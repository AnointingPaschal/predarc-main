import artifact from '../../contracts/out/PredarcMarket.sol/PredarcMarket.json'

// Arc Testnet deployment — update with mainnet address after mainnet deploy
export const PREDARC_ADDRESS = '0xa78c2aa7a9ccff28ba42e59ae0a8c86f0da4e275' as `0x${string}`
export const PREDARC_ABI = artifact.abi

// USDC on Arc (same address on mainnet and testnet)
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as `0x${string}`
export const USDC_DECIMALS = 6

export enum MarketType { Binary = 0, MultipleChoice = 1, Scalar = 2 }
export enum MarketStatus { Open = 0, Closed = 1, Resolved = 2, Cancelled = 3 }

export interface Market {
  id: bigint
  marketType: MarketType
  status: MarketStatus
  question: string
  outcomes: string[]
  endTime: bigint
  resolutionTime: bigint
  resolvedOutcome: bigint
  resolvedScalarValue: bigint
  scalarLow: bigint
  scalarHigh: bigint
  totalLiquidity: bigint
  outcomePools: bigint[]
  feesCollected: bigint
  creator: string
  category: string
  imageUrl: string
  featured: boolean
}

export const CATEGORIES = ['All', 'Crypto', 'Sports', 'Politics', 'Entertainment', 'Science', 'Finance', 'Other']

export function formatUsdc(raw: bigint): string {
  const n = Number(raw) / 1e6
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export function parseUsdc(amount: string): bigint {
  const n = parseFloat(amount)
  if (isNaN(n) || n < 0) return 0n
  return BigInt(Math.round(n * 1e6))
}

export function getMarketPrice(market: Market, outcomeIndex: number): number {
  const pools = market.outcomePools
  if (!pools || pools.length === 0) return 0
  const total = pools.reduce((a, b) => a + b, 0n)
  if (total === 0n) return 0
  const poolX = pools[outcomeIndex] ?? 0n
  // Price = pool_x / total (simplified for display)
  return Number(poolX) / Number(total)
}

export function getOddsDisplay(market: Market, outcomeIndex: number): string {
  const price = getMarketPrice(market, outcomeIndex)
  return (price * 100).toFixed(1) + '%'
}

export function timeUntil(ts: bigint): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = Number(ts) - now
  if (diff <= 0) return 'Ended'
  const d = Math.floor(diff / 86400)
  const h = Math.floor((diff % 86400) / 3600)
  const m = Math.floor((diff % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function statusLabel(status: MarketStatus): string {
  switch (status) {
    case MarketStatus.Open: return 'Open'
    case MarketStatus.Closed: return 'Closed'
    case MarketStatus.Resolved: return 'Resolved'
    case MarketStatus.Cancelled: return 'Cancelled'
  }
}

export function statusColor(status: MarketStatus): string {
  switch (status) {
    case MarketStatus.Open: return 'text-green-400'
    case MarketStatus.Closed: return 'text-yellow-400'
    case MarketStatus.Resolved: return 'text-blue-400'
    case MarketStatus.Cancelled: return 'text-red-400'
  }
}
