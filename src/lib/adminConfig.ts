// Site settings.
// Source of truth is Cloudflare KV, served by /api/config (public, no secrets)
// and /api/admin/config (admin wallet signature required). Nothing is stored in
// the browser: the config lives in a module-level in-memory cache.
import { useSyncExternalStore } from 'react'

export type Network = 'mainnet' | 'testnet'
export const CHAIN_IDS: Record<Network, number> = { mainnet: 5042, testnet: 5042002 }

// Per-mode theme token set
export interface ThemeColors {
  bg: string
  surface: string
  surfaceMuted: string
  ink: string
  muted: string
  accent: string
  border: string
  success: string
  danger: string
  warning: string
}

/** Everything that differs between Arc Mainnet and Arc Testnet. */
export interface NetworkSettings {
  contractAddress: string
  rpcUrl: string
  usdcAddress: string
  feeRecipient: string
  chainlinkBtcFeed: string
  chainlinkEthFeed: string
  deployBlock?: number // optional: block the contract was deployed at (speeds up history)
  minLiquidityUsdc: number // UI-side minimum for market creation (the contract enforces its own)
}

export interface SiteConfig {
  // Identity
  siteName: string
  tagline: string
  logoUrl: string

  // Theme tokens per mode
  darkTheme: ThemeColors
  lightTheme: ThemeColors

  // Custom CSS applied on top
  customCss: string

  // Footer / social
  footerText: string
  twitterUrl: string
  discordUrl: string
  githubUrl: string

  // Which network the whole site is on (changed only in Admin → Config)
  network: Network

  // Onchain config — each network has its own settings
  mainnet: NetworkSettings
  testnet: NetworkSettings
  adminWallet: string // read-only in the UI; set by the ADMIN_WALLET env var

  // AI config
  openrouterApiKey: string
  openrouterModel: string
  openrouterWebSearch: boolean   // append :online so the model can search the web
  aiInitialLiquidityUsdc: number // initial liquidity for AI-published markets (0 = free)
  aiAutoGenEnabled: boolean
  aiAutoGenInterval: number   // minutes between auto-generated markets
  aiAutoGenCategories: string // comma-separated list of categories to auto-generate
}

export const DEFAULT_DARK: ThemeColors = {
  bg:          '#0a1628',
  surface:     'rgba(255,255,255,0.06)',
  surfaceMuted:'#152035',
  ink:         '#f0f6ff',
  muted:       '#7fa3c8',
  accent:      '#5b9cf6',
  border:      'rgba(255,255,255,0.09)',
  success:     '#34d399',
  danger:      '#f87171',
  warning:     '#fbbf24',
}

export const DEFAULT_LIGHT: ThemeColors = {
  bg:          '#ffffff',
  surface:     '#ffffff',
  surfaceMuted:'#eef2fa',
  ink:         '#0d1829',
  muted:       '#3d5470',
  accent:      '#2563eb',
  border:      '#d0dcea',
  success:     '#059669',
  danger:      '#dc2626',
  warning:     '#b45309',
}

// Values baked in at build time from Cloudflare environment variables.
// These are only first-run defaults, used until an admin saves config to
// Cloudflare KV (saved values win).
const ENV = {
  contractAddress:        (import.meta.env.VITE_CONTRACT_ADDRESS        as string | undefined) ?? '',
  testnetContractAddress: (import.meta.env.VITE_TESTNET_CONTRACT_ADDRESS as string | undefined) ?? '',
  network:                (import.meta.env.VITE_NETWORK                 as string | undefined) ?? 'mainnet',
  rpcUrl:                 (import.meta.env.VITE_RPC_URL                 as string | undefined) ?? 'https://rpc.mainnet.arc.io',
  usdcAddress:            (import.meta.env.VITE_USDC_ADDRESS            as string | undefined) ?? '0x3600000000000000000000000000000000000000',
  adminWallet:            (import.meta.env.VITE_ADMIN_WALLET            as string | undefined) ?? '',
  feeRecipient:           (import.meta.env.VITE_FEE_RECIPIENT           as string | undefined) ?? '',
  chainlinkBtcFeed:       (import.meta.env.VITE_CHAINLINK_BTC_FEED      as string | undefined) ?? '',
  chainlinkEthFeed:       (import.meta.env.VITE_CHAINLINK_ETH_FEED      as string | undefined) ?? '',
  siteName:               (import.meta.env.VITE_SITE_NAME               as string | undefined) ?? 'Predarc',
  tagline:                (import.meta.env.VITE_TAGLINE                 as string | undefined) ?? 'Predict. Trade. Win.',
}

export const DEFAULT_CONFIG: SiteConfig = {
  siteName: ENV.siteName,
  tagline: ENV.tagline,
  logoUrl: '',
  darkTheme: DEFAULT_DARK,
  lightTheme: DEFAULT_LIGHT,
  customCss: '',
  footerText: 'Powered by Arc. Built with Circle USDC.',
  twitterUrl: '',
  discordUrl: '',
  githubUrl: '',
  network: ENV.network === 'testnet' ? 'testnet' : 'mainnet',
  mainnet: {
    contractAddress:  ENV.contractAddress,
    rpcUrl:           ENV.rpcUrl,
    usdcAddress:      ENV.usdcAddress,
    feeRecipient:     ENV.feeRecipient,
    chainlinkBtcFeed: ENV.chainlinkBtcFeed,
    chainlinkEthFeed: ENV.chainlinkEthFeed,
    minLiquidityUsdc: 0,
  },
  testnet: {
    contractAddress:  ENV.testnetContractAddress,
    rpcUrl:           'https://rpc.testnet.arc.network',
    usdcAddress:      '0x3600000000000000000000000000000000000000',
    feeRecipient:     ENV.feeRecipient,
    chainlinkBtcFeed: '',
    chainlinkEthFeed: '',
    minLiquidityUsdc: 0,
  },
  adminWallet: ENV.adminWallet,
  openrouterApiKey: '',
  openrouterModel: 'openai/gpt-4o-mini',
  openrouterWebSearch: false,
  aiInitialLiquidityUsdc: 0,
  aiAutoGenEnabled: false,
  aiAutoGenInterval: 60,
  aiAutoGenCategories: 'Crypto,Sports,Politics',
}

// ── Per-network helpers ──────────────────────────────────────────────────────

/** Settings block for a network (defaults to the config's active one). */
export function getNetworkSettings(config: SiteConfig, network: Network = config.network): NetworkSettings {
  return network === 'testnet' ? config.testnet : config.mainnet
}

export function getActiveContractAddress(config: SiteConfig): string {
  return getNetworkSettings(config).contractAddress.trim()
}

export function getActiveChainId(config: SiteConfig): number {
  return CHAIN_IDS[config.network]
}

export function getActiveRpcUrl(config: SiteConfig): string {
  return getNetworkSettings(config).rpcUrl.trim()
}

// ── Merging (with migration from the old flat config shape) ──────────────────

type Legacy = Partial<SiteConfig> & {
  contractAddress?: string; testnetContractAddress?: string; rpcUrl?: string; usdcAddress?: string
  feeRecipient?: string; chainlinkBtcFeed?: string; chainlinkEthFeed?: string; minLiquidityUsdc?: number
}

function mergeConfig(parsed: Legacy | null | undefined): SiteConfig {
  const p = parsed ?? {}
  const d = DEFAULT_CONFIG
  // Configs saved before per-network settings used flat fields (mainnet + one testnet address)
  const legacyMain: Partial<NetworkSettings> = {}
  const legacyTest: Partial<NetworkSettings> = {}
  if (!p.mainnet) {
    if (p.contractAddress !== undefined)  legacyMain.contractAddress = p.contractAddress
    if (p.rpcUrl !== undefined)           legacyMain.rpcUrl = p.rpcUrl
    if (p.usdcAddress !== undefined)      legacyMain.usdcAddress = p.usdcAddress
    if (p.feeRecipient !== undefined)     { legacyMain.feeRecipient = p.feeRecipient; legacyTest.feeRecipient = p.feeRecipient }
    if (p.chainlinkBtcFeed !== undefined) legacyMain.chainlinkBtcFeed = p.chainlinkBtcFeed
    if (p.chainlinkEthFeed !== undefined) legacyMain.chainlinkEthFeed = p.chainlinkEthFeed
    if (p.minLiquidityUsdc !== undefined) legacyMain.minLiquidityUsdc = p.minLiquidityUsdc
  }
  if (!p.testnet && p.testnetContractAddress !== undefined) legacyTest.contractAddress = p.testnetContractAddress

  const rest: Record<string, unknown> = { ...p }
  for (const k of ['contractAddress', 'testnetContractAddress', 'rpcUrl', 'usdcAddress', 'feeRecipient',
    'chainlinkBtcFeed', 'chainlinkEthFeed', 'minLiquidityUsdc', 'chainId', 'feeBps']) delete rest[k]

  return {
    ...d,
    ...(rest as Partial<SiteConfig>),
    mainnet: { ...d.mainnet, ...legacyMain, ...(p.mainnet ?? {}) },
    testnet: { ...d.testnet, ...legacyTest, ...(p.testnet ?? {}) },
    darkTheme:  { ...DEFAULT_DARK,  ...(p.darkTheme  ?? {}) },
    lightTheme: { ...DEFAULT_LIGHT, ...(p.lightTheme ?? {}) },
  }
}

// ── In-memory store ──────────────────────────────────────────────────────────
let current: SiteConfig = mergeConfig(null)
const listeners = new Set<() => void>()

function setCurrent(c: SiteConfig) {
  current = c
  listeners.forEach(l => l())
}

export function subscribeConfig(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** The current site config (loaded from Cloudflare). */
export function loadConfig(): SiteConfig {
  return current
}

/** React hook: re-renders when the config changes. */
export function useSiteConfig(): SiteConfig {
  return useSyncExternalStore(subscribeConfig, loadConfig, loadConfig)
}

/** The network the whole site is on — a single setting, changed only in Admin → Config. */
export function getEffectiveNetwork(): Network {
  return current.network
}

export function useNetwork(): Network {
  return useSyncExternalStore(subscribeConfig, getEffectiveNetwork, getEffectiveNetwork)
}

/** Settings of the network the site is currently on. */
export function activeSettings(): NetworkSettings {
  return getNetworkSettings(current)
}

export function activeUsdc(): `0x${string}` {
  return (activeSettings().usdcAddress.trim() || '0x3600000000000000000000000000000000000000') as `0x${string}`
}
export function activeContract(): `0x${string}` {
  return getActiveContractAddress(current) as `0x${string}`
}
export function activeChainId(): number {
  return getActiveChainId(current)
}

/** Fetch the public config from Cloudflare. Never throws; falls back to defaults. */
export async function initConfig(): Promise<SiteConfig> {
  // Older versions kept settings in localStorage; that copy is obsolete.
  try { localStorage.removeItem('predarc_admin_config') } catch { /* ignore */ }
  try {
    const res = await fetch('/api/config', { cache: 'no-store', signal: AbortSignal.timeout(4000) })
    if (res.ok) {
      const data = (await res.json()) as { config?: Partial<SiteConfig>; serverTime?: number }
      noteServerTime(data.serverTime, res)
      setCurrent(mergeConfig(data.config))
    }
  } catch { /* offline / local dev without functions: keep defaults */ }
  applyThemeVars(current)
  return current
}

// ── Server clock ─────────────────────────────────────────────────────────────
// Admin sessions are time-limited and checked by the server, so they must be
// stamped with the server's time, not a possibly-wrong device clock.
let clockSkew = 0 // serverTime - deviceTime (ms)
function noteServerTime(t: unknown, res?: Response) {
  const fromBody = typeof t === 'number' ? t : NaN
  const hdr = res?.headers.get('date')
  const server = Number.isFinite(fromBody) ? fromBody : hdr ? Date.parse(hdr) : NaN
  if (Number.isFinite(server)) clockSkew = server - Date.now()
}
export const serverNow = () => Date.now() + clockSkew

// ── Admin session (in memory only) ───────────────────────────────────────────
export interface AdminSession { address: string; message: string; signature: string; expires: number }
let session: AdminSession | null = null

export function getAdminSession(address?: string): AdminSession | null {
  if (!session || session.expires < serverNow() + 30_000) return null
  if (address && session.address !== address.toLowerCase()) return null
  return session
}

export function clearAdminSession(): void { session = null }

export function isAdminAddress(address: string | undefined, adminWallet: string | undefined): boolean {
  return !!address && !!adminWallet && address.toLowerCase() === adminWallet.trim().toLowerCase()
}

/** Parse an API response as JSON, with a clear error when Functions aren't serving it. */
async function apiJson<T>(res: Response): Promise<T> {
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('json')) {
    throw new Error(`Config API is not responding (HTTP ${res.status}, got ${type || 'no content-type'}). Make sure the latest deployment finished and includes the functions/ folder.`)
  }
  const body = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)
  return body
}

function makeHeaders(s: AdminSession): Record<string, string> {
  return {
    'x-admin-address': s.address,
    'x-admin-message': btoa(String.fromCharCode(...new TextEncoder().encode(s.message))),
    'x-admin-signature': s.signature,
  }
}

export function adminAuthHeaders(): Record<string, string> { return adminHeaders() }

function adminHeaders(): Record<string, string> {
  const s = getAdminSession()
  if (!s) throw new Error('Admin session expired. Please sign in again.')
  return makeHeaders(s)
}

async function getAdminConfigRaw(headers: Record<string, string>): Promise<Partial<SiteConfig>> {
  const res = await fetch('/api/admin/config', { headers, cache: 'no-store' })
  return (await apiJson<{ config?: Partial<SiteConfig> }>(res)).config ?? {}
}

/** Ask the admin wallet to sign a 1-hour session message, then load the full config. */
export async function signInAsAdmin(
  address: string,
  signMessage: (args: { message: string }) => Promise<string>,
): Promise<void> {
  // Sync with the server clock first so a wrong device clock cannot break sign-in
  try {
    const r = await fetch('/api/config', { cache: 'no-store' })
    const b = (await r.json().catch(() => ({}))) as { serverTime?: number }
    noteServerTime(b.serverTime, r)
  } catch { /* fall back to device clock */ }
  const issued = serverNow()
  const expires = issued + 60 * 60 * 1000
  const message = [
    'Predarc admin session',
    `Address: ${address.toLowerCase()}`,
    `Host: ${window.location.host}`,
    `Issued: ${issued}`,
    `Expires: ${expires}`,
  ].join('\n')
  const signature = await signMessage({ message })
  const candidate: AdminSession = { address: address.toLowerCase(), message, signature, expires }
  // Only keep the session once the server has accepted it
  const cfg = await getAdminConfigRaw(makeHeaders(candidate))
  session = candidate
  setCurrent(mergeConfig(cfg))
  applyThemeVars(current)
}

/** Reload the full config (including secrets) from Cloudflare — admin only. */
export async function fetchAdminConfig(): Promise<SiteConfig> {
  try {
    setCurrent(mergeConfig(await getAdminConfigRaw(adminHeaders())))
  } catch (e) {
    session = null
    throw e
  }
  applyThemeVars(current)
  return current
}

/** Fields compared when verifying that a save really reached Cloudflare. */
const VERIFY_FIELDS: (keyof SiteConfig)[] = [
  'siteName', 'network', 'mainnet', 'testnet',
  'openrouterApiKey', 'openrouterModel', 'openrouterWebSearch', 'aiInitialLiquidityUsdc', 'aiAutoGenEnabled',
]

/** Save config to Cloudflare KV, then read it back to prove it persisted. */
export async function saveConfig(config: SiteConfig): Promise<void> {
  const headers = adminHeaders()
  const res = await fetch('/api/admin/config', {
    method: 'PUT',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(config),
  })
  try { await apiJson<{ ok: boolean }>(res) } catch (e) { if (res.status === 401) session = null; throw e }

  const stored = mergeConfig(await getAdminConfigRaw(headers))
  const bad = VERIFY_FIELDS.filter(k => JSON.stringify(stored[k]) !== JSON.stringify(config[k]))
  if (bad.length) throw new Error(`Save did not persist (${bad.join(', ')}). Check the PREDARC_KV binding in Cloudflare and redeploy.`)
  setCurrent(stored)
  applyThemeVars(current)
}

/** Delete saved config from Cloudflare KV, returning to defaults. */
export async function resetConfig(): Promise<void> {
  const res = await fetch('/api/admin/config', { method: 'DELETE', headers: adminHeaders() })
  await apiJson<{ ok: boolean }>(res)
  setCurrent(mergeConfig(null))
  applyThemeVars(current)
}

// Apply the right set of CSS vars based on current theme mode
export function applyThemeVars(config: SiteConfig): void {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light'
  const t = isDark ? config.darkTheme : config.lightTheme
  applyColorSet(t)
  applyCustomCss(config.customCss)
}

// Called on theme mode toggle so configured colors re-apply to the new mode
export function reapplyThemeVars(): void {
  applyThemeVars(current)
}

function applyColorSet(t: ThemeColors): void {
  const r = document.documentElement
  r.style.setProperty('--bg',            t.bg)
  r.style.setProperty('--surface',       t.surface)
  r.style.setProperty('--surface-muted', t.surfaceMuted)
  r.style.setProperty('--ink',           t.ink)
  r.style.setProperty('--muted',         t.muted)
  r.style.setProperty('--accent',        t.accent)
  r.style.setProperty('--border',        t.border)
  r.style.setProperty('--success',       t.success)
  r.style.setProperty('--danger',        t.danger)
  r.style.setProperty('--warning',       t.warning)
}

function applyCustomCss(css: string): void {
  let el = document.getElementById('predarc-custom-css')
  if (!el) {
    el = document.createElement('style')
    el.id = 'predarc-custom-css'
    document.head.appendChild(el)
  }
  el.textContent = css
}
