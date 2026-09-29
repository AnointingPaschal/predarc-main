// Client helpers for the Cloudflare APIs: comments, market details, news.
import { serverNow, getEffectiveNetwork, adminAuthHeaders, type Network } from './adminConfig'

// ── Regular wallet session (used for commenting) ─────────────────────────────
interface UserSession { address: string; message: string; signature: string; expires: number }
let userSession: UserSession | null = null

export const getUserSession = (address?: string) =>
  userSession && userSession.expires > serverNow() + 30_000 && (!address || userSession.address === address.toLowerCase()) ? userSession : null

export async function signInUser(address: string, signMessage: (a: { message: string }) => Promise<string>): Promise<void> {
  const issued = serverNow()
  const expires = issued + 12 * 60 * 60 * 1000
  const message = ['Predarc session', `Address: ${address.toLowerCase()}`, `Host: ${window.location.host}`, `Issued: ${issued}`, `Expires: ${expires}`,
    '', 'Signing in only proves you own this wallet. It costs no gas and moves no funds.'].join('\n')
  const signature = await signMessage({ message })
  userSession = { address: address.toLowerCase(), message, signature, expires }
}

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
function userHeaders(): Record<string, string> {
  if (!userSession) throw new Error('Sign in with your wallet first.')
  return { 'x-user-address': userSession.address, 'x-user-message': b64(userSession.message), 'x-user-signature': userSession.signature }
}

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)
  return body
}

// ── Comments ─────────────────────────────────────────────────────────────────
export interface Comment { id: string; address: string; text: string; ts: number; parentId?: string; likes?: string[] }
const qs = (market: bigint | string, network: Network = getEffectiveNetwork()) => `network=${network}&market=${market}`

export const fetchComments = async (market: bigint): Promise<Comment[]> =>
  (await parse<{ comments: Comment[] }>(await fetch(`/api/comments?${qs(market)}`, { cache: 'no-store' }))).comments

const postComment = async (body: Record<string, unknown>) =>
  (await parse<{ comments: Comment[] }>(await fetch('/api/comments', {
    method: 'POST', headers: { 'content-type': 'application/json', ...userHeaders() },
    body: JSON.stringify({ network: getEffectiveNetwork(), ...body }),
  }))).comments

export const addComment = (market: bigint, text: string, parentId?: string) => postComment({ market: String(market), text, parentId })
export const likeComment = (market: bigint, likeId: string) => postComment({ market: String(market), likeId })
export async function deleteComment(market: bigint, id: string, asAdmin: boolean): Promise<Comment[]> {
  const headers = asAdmin ? adminAuthHeaders() : userHeaders()
  return (await parse<{ comments: Comment[] }>(await fetch(`/api/comments?${qs(market)}&id=${id}`, { method: 'DELETE', headers }))).comments
}

// ── Market details (off-chain) ───────────────────────────────────────────────
export interface AIAnalysis {
  summary: string; reasoning: string[]; bullCase: string[]; bearCase: string[]; risks: string[]
  probabilities: { outcome: string; probability: number }[]
  confidence: 'low' | 'medium' | 'high'; model: string; generatedAt: number
}
export interface MarketMeta {
  description?: string
  resolutionCriteria?: string
  sources?: { title: string; url: string }[]
  analysis?: AIAnalysis
}

export const fetchMarketMeta = async (market: bigint | string, network?: Network): Promise<MarketMeta> =>
  (await parse<{ meta: MarketMeta }>(await fetch(`/api/market-meta?${qs(market, network)}`, { cache: 'no-store' }))).meta

export async function saveMarketMeta(market: bigint | string, meta: MarketMeta, network: Network = getEffectiveNetwork()): Promise<MarketMeta> {
  return (await parse<{ meta: MarketMeta }>(await fetch('/api/market-meta', {
    method: 'PUT', headers: { 'content-type': 'application/json', ...adminAuthHeaders() },
    body: JSON.stringify({ network, market: String(market), meta }),
  }))).meta
}

// ── News ─────────────────────────────────────────────────────────────────────
export interface NewsItem { title: string; source: string; url: string; published: string }
export async function fetchNews(opts: { topic?: string; q?: string }): Promise<NewsItem[]> {
  const p = new URLSearchParams(); if (opts.topic) p.set('topic', opts.topic); if (opts.q) p.set('q', opts.q)
  try { return (await parse<{ items: NewsItem[] }>(await fetch(`/api/news?${p}`))).items ?? [] } catch { return [] }
}

// ── Automatic AI insights (generated server-side with the admin's saved key/model) ──
export interface AnalysisResult { status: 'fresh' | 'generated' | 'pending' | 'unavailable' | 'closed' | 'error'; reason?: string; meta: MarketMeta }
export async function requestAnalysis(market: bigint, force = false): Promise<AnalysisResult> {
  const res = await fetch('/api/market-analysis', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(force ? adminAuthHeaders() : {}) },
    body: JSON.stringify({ network: getEffectiveNetwork(), market: String(market), force }),
  })
  const body = (await res.json().catch(() => ({}))) as Partial<AnalysisResult> & { error?: string }
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)
  return { status: body.status ?? 'error', reason: body.reason, meta: body.meta ?? {} }
}

// ── Image upload (admin) ─────────────────────────────────────────────────────
/** Resize in the browser (max 1000px, JPEG/PNG kept small) and upload; returns the absolute URL to store onchain. */
export async function uploadMarketImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1000 / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('Could not process the image.'))), 'image/jpeg', 0.85))
  const r = await fetch('/api/image', { method: 'POST', headers: { 'content-type': 'image/jpeg', ...adminAuthHeaders() }, body: blob })
  const body = (await r.json().catch(() => ({}))) as { path?: string; error?: string }
  if (!r.ok || !body.path) throw new Error(body.error || `Upload failed (${r.status})`)
  return `${window.location.origin}${body.path}`
}
