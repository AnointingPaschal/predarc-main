// Admin-configurable site settings.
// Source of truth is Cloudflare KV, served by /api/config (public, no secrets)
// and /api/admin/config (admin wallet signature required). Nothing is stored in
// the browser: the config lives in a module-level in-memory cache.
import { useSyncExternalStore } from 'react'

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

  // Network mode
  network: 'mainnet' | 'testnet'

  // Onchain config — separate per network
  contractAddress: string       // mainnet contract
  testnetContractAddress: string // testnet contract
  rpcUrl: string
  chainId: number
  usdcAddress: string
  feeBps: number
  feeRecipient: string
  adminWallet: string
  chainlinkBtcFeed: string
  chainlinkEthFeed: string
  minLiquidityUsdc: number  // minimum USDC for market creation (default 1)

  // AI config
  openrouterApiKey: string
  openrouterModel: string
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
// These are only the first-run defaults, used until an admin saves config to
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
  network: (ENV.network === 'testnet' ? 'testnet' : 'mainnet'),
  contractAddress:        ENV.contractAddress,
  testnetContractAddress: ENV.testnetContractAddress || '0xa78c2aa7a9ccff28ba42e59ae0a8c86f0da4e275',
  rpcUrl:           ENV.rpcUrl,
  chainId: 5042,
  usdcAddress:      ENV.usdcAddress,
  feeBps: 200,
  feeRecipient:     ENV.feeRecipient,
  adminWallet:      ENV.adminWallet,
  chainlinkBtcFeed: ENV.chainlinkBtcFeed,
  chainlinkEthFeed: ENV.chainlinkEthFeed,
  minLiquidityUsdc: 1,
  openrouterApiKey: '',
  openrouterModel: 'openai/gpt-4o-mini',
  aiAutoGenEnabled: false,
  aiAutoGenInterval: 60,
  aiAutoGenCategories: 'Crypto,Sports,Politics',
}

// Returns the active contract address for the current network mode
export function getActiveContractAddress(config: SiteConfig): string {
  return config.network === 'testnet' ? config.testnetContractAddress : config.contractAddress
}

// Returns chain ID for the current network mode
export function getActiveChainId(config: SiteConfig): number {
  return config.network === 'testnet' ? 5042002 : 5042
}

// Returns RPC URL for the current network mode
export function getActiveRpcUrl(config: SiteConfig): string {
  return config.network === 'testnet' ? 'https://rpc.testnet.arc.network' : config.rpcUrl
}

function mergeConfig(parsed: Partial<SiteConfig> | null | undefined): SiteConfig {
  const p = parsed ?? {}
  return {
    ...DEFAULT_CONFIG,
    ...p,
    darkTheme:  { ...DEFAULT_DARK,  ...(p.darkTheme  ?? {}) },
    lightTheme: { ...DEFAULT_LIGHT, ...(p.lightTheme ?? {}) },
  }
}

// ── In-memory store ──────────────────────────────────────────────────────────
// `current` is the saved (server) config. Each visitor can additionally pick a
// network to view; that choice is kept in a cookie and overrides `network`.
let current: SiteConfig = mergeConfig(null)
const listeners = new Set<() => void>()

export type Network = 'mainnet' | 'testnet'
const NET_COOKIE = 'predarc_network'

function readSelectedNetwork(): Network | null {
  try {
    const q = new URLSearchParams(window.location.search).get('network')
    if (q === 'mainnet' || q === 'testnet') return q
    const m = document.cookie.match(new RegExp(`(?:^|; )${NET_COOKIE}=(mainnet|testnet)`))
    return (m?.[1] as Network | undefined) ?? null
  } catch { return null }
}
let selectedNetwork: Network | null = readSelectedNetwork()

/** The network this visitor is viewing: their own choice, else the admin default. */
export function getEffectiveNetwork(): Network {
  return selectedNetwork ?? current.network
}

export function setSelectedNetwork(n: Network): void {
  selectedNetwork = n
  try { document.cookie = `${NET_COOKIE}=${n}; path=/; max-age=31536000; SameSite=Lax` } catch { /* ignore */ }
  listeners.forEach(l => l())
}

export function useNetwork(): Network {
  return useSyncExternalStore(subscribeConfig, getEffectiveNetwork, getEffectiveNetwork)
}

function setCurrent(c: SiteConfig) {
  current = c
  listeners.forEach(l => l())
}

export function subscribeConfig(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** Raw saved config (what the admin edits — no per-visitor network override). */
export function loadRawConfig(): SiteConfig {
  return current
}

// Cached so useSyncExternalStore gets a stable reference between changes
let effCache: { base: SiteConfig; net: Network; value: SiteConfig } | null = null

/** Synchronous read of the config as this visitor sees it (network override applied). */
export function loadConfig(): SiteConfig {
  const net = getEffectiveNetwork()
  if (!effCache || effCache.base !== current || effCache.net !== net) {
    effCache = { base: current, net, value: net === current.network ? current : { ...current, network: net } }
  }
  return effCache.value
}

/** React hook: re-renders when the config or the viewed network changes. */
export function useSiteConfig(): SiteConfig {
  return useSyncExternalStore(subscribeConfig, loadConfig, loadConfig)
}

export function activeContract(): `0x${string}` {
  return getActiveContractAddress(loadConfig()) as `0x${string}`
}
export function activeChainId(): number {
  return getActiveChainId(loadConfig())
}

/** Fetch the public config from Cloudflare. Never throws; falls back to defaults. */
export async function initConfig(): Promise<SiteConfig> {
  try {
    const res = await fetch('/api/config', { cache: 'no-store', signal: AbortSignal.timeout(4000) })
    if (res.ok) {
      const data = (await res.json()) as { config?: Partial<SiteConfig> }
      setCurrent(mergeConfig(data.config))
    }
  } catch { /* offline / local dev without functions: keep defaults */ }
  applyThemeVars(current)
  return current
}

// ── Admin session (in memory only) ───────────────────────────────────────────
export interface AdminSession { address: string; message: string; signature: string; expires: number }
let session: AdminSession | null = null

export function getAdminSession(address?: string): AdminSession | null {
  if (!session || session.expires < Date.now() + 30_000) return null
  if (address && session.address !== address.toLowerCase()) return null
  return session
}

export function clearAdminSession(): void { session = null }

export function isAdminAddress(address: string | undefined, adminWallet: string | undefined): boolean {
  return !!address && !!adminWallet && address.toLowerCase() === adminWallet.trim().toLowerCase()
}

/** Ask the admin wallet to sign a 1-hour session message, then load the full config. */
export async function signInAsAdmin(
  address: string,
  signMessage: (args: { message: string }) => Promise<string>,
): Promise<void> {
  const issued = Date.now()
  const expires = issued + 60 * 60 * 1000
  const message = [
    'Predarc admin session',
    `Address: ${address.toLowerCase()}`,
    `Host: ${window.location.host}`,
    `Issued: ${issued}`,
    `Expires: ${expires}`,
  ].join('\n')
  const signature = await signMessage({ message })
  session = { address: address.toLowerCase(), message, signature, expires }
  await fetchAdminConfig()
}

function adminHeaders(): Record<string, string> {
  const s = getAdminSession()
  if (!s) throw new Error('Admin session expired. Please sign in again.')
  return {
    'x-admin-address': s.address,
    'x-admin-message': btoa(String.fromCharCode(...new TextEncoder().encode(s.message))),
    'x-admin-signature': s.signature,
  }
}

async function apiError(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  return new Error(body.error || `Request failed (${res.status})`)
}

/** Load the full config (including secrets) — admin only. */
export async function fetchAdminConfig(): Promise<SiteConfig> {
  const res = await fetch('/api/admin/config', { headers: adminHeaders(), cache: 'no-store' })
  if (!res.ok) { if (res.status === 401) session = null; throw await apiError(res) }
  const data = (await res.json()) as { config?: Partial<SiteConfig> }
  setCurrent(mergeConfig(data.config))
  applyThemeVars(current)
  return current
}

/** Save config to Cloudflare KV (admin signature required) and apply it. */
export async function saveConfig(config: SiteConfig): Promise<void> {
  const res = await fetch('/api/admin/config', {
    method: 'PUT',
    headers: { ...adminHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) { if (res.status === 401) session = null; throw await apiError(res) }
  setCurrent(mergeConfig(config))
  applyThemeVars(current)
}

/** Delete saved config from Cloudflare KV, returning to defaults. */
export async function resetConfig(): Promise<void> {
  const res = await fetch('/api/admin/config', { method: 'DELETE', headers: adminHeaders() })
  if (!res.ok) throw await apiError(res)
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
