import { Market, MarketStatus, MarketType } from './contract'
import { pricesFromPools } from './marketMath'

export interface OutcomeHolding { index: number; name: string; shares: number; price: number; value: number; won: boolean }
export interface Position {
  market: Market
  holdings: OutcomeHolding[]
  costBasis: number      // contract's net cost basis (USDC still at risk)
  value: number          // open/closed: shares × current price
  claimable: number      // resolved / cancelled: what redeemWinnings would pay right now
  status: 'active' | 'closed' | 'claimable' | 'settled'
}

/** shares are 1e18 units, costBasis 6-dp USDC, both raw bigints from the contract */
export function buildPosition(market: Market, rawShares: bigint[], rawCost: bigint): Position {
  const prices = pricesFromPools([...market.outcomePools])
  const holdings = market.outcomes.map((name, i) => {
    const shares = Number(rawShares[i] ?? 0n) / 1e18
    return { index: i, name, shares, price: prices[i] ?? 0, value: shares * (prices[i] ?? 0), won: market.status === MarketStatus.Resolved && market.marketType !== MarketType.Scalar && market.resolvedOutcome === BigInt(i) }
  }).filter(h => h.shares > 0.000001)
  const costBasis = Number(rawCost) / 1e6
  let claimable = 0
  if (market.status === MarketStatus.Cancelled) claimable = costBasis
  else if (market.status === MarketStatus.Resolved) {
    if (market.marketType === MarketType.Scalar) {
      const range = Number(market.scalarHigh - market.scalarLow)
      if (range > 0) {
        const hi = Math.min(1, Math.max(0, Number(market.resolvedScalarValue - market.scalarLow) / range))
        claimable = ((Number(rawShares[0] ?? 0n) / 1e18) * (1 - hi) + (Number(rawShares[1] ?? 0n) / 1e18) * hi)
      }
    } else claimable = Number(rawShares[Number(market.resolvedOutcome)] ?? 0n) / 1e18
  }
  const settledMarket = market.status === MarketStatus.Resolved || market.status === MarketStatus.Cancelled
  const value = settledMarket ? 0 : holdings.reduce((s, h) => s + h.value, 0)
  const status: Position['status'] = settledMarket ? (claimable > 0.000001 ? 'claimable' : 'settled') : market.status === MarketStatus.Closed ? 'closed' : 'active'
  return { market, holdings, costBasis, value, claimable, status }
}
