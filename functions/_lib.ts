// Shared helpers for Cloudflare Pages Functions.
// Storage: one Workers KV namespace bound as PREDARC_KV.
//   config:public  -> site config served to everyone (no secrets)
//   config:secret  -> admin-only secrets (OpenRouter API key)
import { verifyMessage, isAddress } from 'viem'

export interface KVNamespaceLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

export interface Env {
  PREDARC_KV: KVNamespaceLike
  // The single admin wallet. Set as a Cloudflare env var / secret.
  ADMIN_WALLET?: string
  VITE_ADMIN_WALLET?: string
}

export const PUBLIC_KEY = 'config:public'
export const SECRET_KEY = 'config:secret'
export const MAX_BODY_BYTES = 2_000_000 // logo is stored as a data URL
export const SESSION_MAX_MS = 60 * 60 * 1000 // admin session lifetime: 1 hour
export const CLOCK_TOLERANCE_MS = 5 * 60 * 1000 // allowed device/server clock difference

// Fields that must never leave the server on the public endpoint.
export const SECRET_FIELDS = ['openrouterApiKey'] as const

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  })
}

export function adminWalletOf(env: Env): string {
  return (env.ADMIN_WALLET || env.VITE_ADMIN_WALLET || '').trim().toLowerCase()
}

export function checkStorage(env: Env): Response | null {
  return env.PREDARC_KV
    ? null
    : json({ error: 'KV namespace PREDARC_KV is not bound. Add it in Cloudflare Pages → Settings → Bindings.' }, 500)
}

/**
 * Verifies the admin session headers sent by the browser:
 *   x-admin-address, x-admin-message (base64), x-admin-signature
 * The message is signed once by the admin wallet (personal_sign) and reused for
 * up to an hour. It is bound to this host and carries issue/expiry times.
 * Returns null when valid, or an error Response.
 */
export async function requireAdmin(request: Request, env: Env): Promise<Response | null> {
  const admin = adminWalletOf(env)
  if (!admin || !isAddress(admin)) {
    return json({ error: 'ADMIN_WALLET is not configured on the server.' }, 500)
  }
  const address = (request.headers.get('x-admin-address') || '').toLowerCase()
  const b64 = request.headers.get('x-admin-message') || ''
  const signature = request.headers.get('x-admin-signature') || ''
  if (!address || !b64 || !signature) return json({ error: 'Admin signature required.' }, 401)
  if (address !== admin) return json({ error: 'Not the admin wallet.' }, 403)

  let message: string
  try {
    message = new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)))
  } catch {
    return json({ error: 'Bad message encoding.' }, 400)
  }

  const field = (name: string) => new RegExp(`^${name}: (.+)$`, 'm').exec(message)?.[1]?.trim()
  const msgAddr = field('Address')?.toLowerCase()
  const host = field('Host')
  const issued = Number(field('Issued'))
  const expires = Number(field('Expires'))
  const now = Date.now()

  if (!message.startsWith('Predarc admin session')) return json({ error: 'Bad message.' }, 400)
  if (msgAddr !== admin) return json({ error: 'Message address mismatch.' }, 403)
  if (host !== new URL(request.url).host) return json({ error: 'Message is for another host.' }, 403)
  if (!Number.isFinite(issued) || !Number.isFinite(expires)) return json({ error: 'Bad timestamps.' }, 400)
  const skewMin = Math.round((issued - now) / 60_000)
  if (issued > now + CLOCK_TOLERANCE_MS) {
    return json({ error: `Your device clock is about ${skewMin} min ahead of the server. Fix your date/time settings (enable automatic time) and sign in again.`, serverTime: now }, 401)
  }
  if (expires - issued > SESSION_MAX_MS + CLOCK_TOLERANCE_MS) return json({ error: 'Session lifetime too long.', serverTime: now }, 401)
  if (expires < now) {
    return json({ error: issued < now - SESSION_MAX_MS - CLOCK_TOLERANCE_MS
      ? `Your device clock is about ${Math.round((now - issued) / 60_000)} min behind the server. Fix your date/time settings and sign in again.`
      : 'Admin session expired. Sign in again.', serverTime: now }, 401)
  }

  try {
    const ok = await verifyMessage({
      address: admin as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    })
    if (!ok) return json({ error: 'Invalid signature.' }, 403)
  } catch {
    return json({ error: 'Invalid signature.' }, 403)
  }
  return null
}

export async function readJson(env: Env, key: string): Promise<Record<string, unknown>> {
  const raw = await env.PREDARC_KV.get(key)
  if (!raw) return {}
  try {
    const v = JSON.parse(raw) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export const NETWORKS = ['mainnet', 'testnet'] as const
export type NetworkName = (typeof NETWORKS)[number]
export const isNetwork = (v: unknown): v is NetworkName => v === 'mainnet' || v === 'testnet'
export const isMarketId = (v: unknown): v is string => typeof v === 'string' && /^\d{1,9}$/.test(v)

/**
 * Verifies a normal (non-admin) wallet session: headers x-user-address,
 * x-user-message (base64), x-user-signature. The message must start with
 * "Predarc session" and carries Address / Host / Issued / Expires lines.
 * Returns the lower-cased address, or an error Response.
 */
export async function requireUser(request: Request, env: Env): Promise<{ address: string } | Response> {
  void env
  const address = (request.headers.get('x-user-address') || '').toLowerCase()
  const b64 = request.headers.get('x-user-message') || ''
  const signature = request.headers.get('x-user-signature') || ''
  if (!address || !b64 || !signature || !isAddress(address)) return json({ error: 'Connect your wallet and sign in to do this.' }, 401)
  let message: string
  try { message = new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))) } catch { return json({ error: 'Bad message encoding.' }, 400) }
  const field = (name: string) => new RegExp(`^${name}: (.+)$`, 'm').exec(message)?.[1]?.trim()
  if (!message.startsWith('Predarc session')) return json({ error: 'Bad message.' }, 400)
  if (field('Address')?.toLowerCase() !== address) return json({ error: 'Message address mismatch.' }, 403)
  if (field('Host') !== new URL(request.url).host) return json({ error: 'Message is for another host.' }, 403)
  const issued = Number(field('Issued')); const expires = Number(field('Expires')); const now = Date.now()
  if (!Number.isFinite(issued) || !Number.isFinite(expires)) return json({ error: 'Bad timestamps.' }, 400)
  if (issued > now + CLOCK_TOLERANCE_MS) return json({ error: 'Your device clock is ahead of the server. Fix your date/time and sign in again.', serverTime: now }, 401)
  if (expires - issued > 24 * 3600_000 + CLOCK_TOLERANCE_MS) return json({ error: 'Session lifetime too long.', serverTime: now }, 401)
  if (expires < now) return json({ error: 'Session expired. Sign in again.', serverTime: now }, 401)
  try {
    const ok = await verifyMessage({ address: address as `0x${string}`, message, signature: signature as `0x${string}` })
    if (!ok) return json({ error: 'Invalid signature.' }, 403)
  } catch { return json({ error: 'Invalid signature.' }, 403) }
  return { address }
}
