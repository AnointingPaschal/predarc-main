// Admin-configurable site settings
// Stored in localStorage; in production, back this with a signed server call.
export const ADMIN_CONFIG_KEY = 'predarc_admin_config'

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
// These become the defaults — localStorage overrides layer on top per-browser.
// Set these in Cloudflare Pages → Settings → Environment variables.
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
  contractAddress:        ENV.contractAddress        || '0xa78c2aa7a9ccff28ba42e59ae0a8c86f0da4e275',
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

export function loadConfig(): SiteConfig {
  try {
    const raw = localStorage.getItem(ADMIN_CONFIG_KEY)
    if (!raw) return DEFAULT_CONFIG
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(raw) as Partial<SiteConfig>
    const merged: SiteConfig = {
      ...DEFAULT_CONFIG,
      ...parsed,
      darkTheme:  { ...DEFAULT_DARK,  ...(parsed.darkTheme  ?? {}) },
      lightTheme: { ...DEFAULT_LIGHT, ...(parsed.lightTheme ?? {}) },
    }
    // Env vars always win for contract addresses and wallet addresses —
    // so the correct address is available on every device without manual config.
    if (ENV.contractAddress)        merged.contractAddress        = ENV.contractAddress
    if (ENV.testnetContractAddress) merged.testnetContractAddress = ENV.testnetContractAddress
    if (ENV.adminWallet)            merged.adminWallet            = ENV.adminWallet
    if (ENV.feeRecipient)           merged.feeRecipient           = ENV.feeRecipient
    if (ENV.chainlinkBtcFeed)       merged.chainlinkBtcFeed       = ENV.chainlinkBtcFeed
    if (ENV.chainlinkEthFeed)       merged.chainlinkEthFeed       = ENV.chainlinkEthFeed
    return merged
  } catch {
    return DEFAULT_CONFIG
  }
}

export function saveConfig(config: SiteConfig): void {
  localStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify(config))
  applyThemeVars(config)
}

// Apply the right set of CSS vars based on current theme mode
export function applyThemeVars(config: SiteConfig): void {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light'
  const t = isDark ? config.darkTheme : config.lightTheme
  applyColorSet(t)
  applyCustomCss(config.customCss)
}

// Called on theme mode toggle so stored colors re-apply to the new mode
export function reapplyThemeVars(): void {
  const raw = localStorage.getItem(ADMIN_CONFIG_KEY)
  if (!raw) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(raw)
    const config: SiteConfig = {
      ...DEFAULT_CONFIG,
      ...(parsed as Partial<SiteConfig>),
      darkTheme:  { ...DEFAULT_DARK,  ...((parsed as Partial<SiteConfig>).darkTheme  ?? {}) },
      lightTheme: { ...DEFAULT_LIGHT, ...((parsed as Partial<SiteConfig>).lightTheme ?? {}) },
    }
    applyThemeVars(config)
  } catch { /* ignore */ }
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
