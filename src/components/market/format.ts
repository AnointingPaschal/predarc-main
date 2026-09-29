export const OUTCOME_COLORS = ['#5b9cf6', '#f87171', '#34d399', '#fbbf24', '#a78bfa', '#f472b6', '#22d3ee', '#fb923c']
export const outcomeColor = (i: number) => OUTCOME_COLORS[i % OUTCOME_COLORS.length]
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
export const pct = (p: number, d = 1) => `${(p * 100).toFixed(d)}%`
export const cents = (p: number) => (p >= 0.995 ? '$1.00' : p < 0.001 ? '<0.1¢' : p < 0.1 ? `${(p * 100).toFixed(1)}¢` : `${Math.round(p * 100)}¢`)
/** cost of one share in USDC (a winning share pays $1) */
export const perShare = (n: number) => `$${n.toFixed(n < 10 ? 3 : 2)}`
export const usd = (n: number, d = 2) => `$${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`
export const compactUsd = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : usd(n, 2)
export function timeAgo(ts: number): string {
  if (!ts) return '—'
  const s = Math.max(1, Math.floor(Date.now() / 1000 - ts))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
export const explorerBase = (network: 'mainnet' | 'testnet') => network === 'testnet' ? 'https://testnet.arcscan.app' : 'https://explorer.arc.io'
