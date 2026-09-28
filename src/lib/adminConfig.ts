// Admin-configurable site settings
// Stored in localStorage; in production, load from your backend/CMS
export const ADMIN_CONFIG_KEY = 'predarc_admin_config'

export interface SiteConfig {
  siteName: string
  tagline: string
  logoUrl: string          // URL or base64 data URL
  primaryColor: string     // hex
  accentColor: string      // hex
  bgColor: string          // hex
  surfaceColor: string     // hex
  inkColor: string         // hex
  borderColor: string      // hex
  contractAddress: string
  rpcUrl: string
  chainId: number
  usdcAddress: string
  feeBps: number
  feeRecipient: string
  adminWallet: string
  chainlinkBtcFeed: string
  chainlinkEthFeed: string
  customCss: string
  footerText: string
  twitterUrl: string
  discordUrl: string
  githubUrl: string
}

export const DEFAULT_CONFIG: SiteConfig = {
  siteName: 'Predarc',
  tagline: 'Predict. Trade. Win.',
  logoUrl: '',
  primaryColor: '#acc6e9',
  accentColor: '#acc6e9',
  bgColor: '#0d1b2f',
  surfaceColor: 'rgba(255,255,255,0.07)',
  inkColor: '#f9faf3',
  borderColor: 'rgba(255,255,255,0.12)',
  contractAddress: '0xa78c2aa7a9ccff28ba42e59ae0a8c86f0da4e275',
  rpcUrl: 'https://rpc.mainnet.arc.io',
  chainId: 5042,
  usdcAddress: '0x3600000000000000000000000000000000000000',
  feeBps: 200,
  feeRecipient: '',
  adminWallet: '',
  chainlinkBtcFeed: '',
  chainlinkEthFeed: '',
  customCss: '',
  footerText: 'Powered by Arc. Built with Circle USDC.',
  twitterUrl: '',
  discordUrl: '',
  githubUrl: '',
}

export function loadConfig(): SiteConfig {
  try {
    const raw = localStorage.getItem(ADMIN_CONFIG_KEY)
    if (!raw) return DEFAULT_CONFIG
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_CONFIG, ...(parsed as Partial<SiteConfig>) }
  } catch {
    return DEFAULT_CONFIG
  }
}

export function saveConfig(config: SiteConfig): void {
  localStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify(config))
  // Apply CSS variables live
  applyCssVars(config)
}

export function applyCssVars(config: SiteConfig): void {
  const root = document.documentElement
  root.style.setProperty('--bg', config.bgColor)
  root.style.setProperty('--accent', config.primaryColor)
  root.style.setProperty('--accent-hover', config.accentColor)
  root.style.setProperty('--ink', config.inkColor)
  root.style.setProperty('--border', config.borderColor)
  if (config.customCss) {
    let styleEl = document.getElementById('predarc-custom-css')
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = 'predarc-custom-css'
      document.head.appendChild(styleEl)
    }
    styleEl.textContent = config.customCss
  }
}
