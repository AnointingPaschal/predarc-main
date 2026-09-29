// Exact BigInt mirror of PredarcMarket's pricing math, plus a replay engine that
// rebuilds a market's price history from its onchain events. Pure functions only.

export const SHARE_DEN = 10n ** 12n // 1e18 shares / 1e6 USDC
const BPS = 10_000n

export type TradeKind = 'buy' | 'sell'
export interface TradeEvent {
  kind: TradeKind
  block: bigint
  logIndex: number
  txHash: string
  user: `0x${string}`
  outcome: number
  usdc: bigint   // buy: usdcIn (gross, incl. fee) · sell: usdcOut (net)
  shares: bigint // 1e18 units
}
export interface LiqEvent { kind: 'liq'; add: boolean; block: bigint; logIndex: number; amount: bigint }
export interface FeeEvent { kind: 'fee'; block: bigint; logIndex: number; bps: bigint }
export type MarketEvent = TradeEvent | LiqEvent | FeeEvent

export const eventOrder = (a: { block: bigint; logIndex: number }, b: { block: bigint; logIndex: number }) =>
  a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1

/** Outcome probabilities (sum ≈ 1). The contract prices outcomes by inverse pool size. */
export function pricesFromPools(pools: bigint[]): number[] {
  if (pools.length === 0) return []
  if (pools.every(p => p === 0n)) return pools.map(() => 1 / pools.length) // unfunded market
  if (pools.some(p => p === 0n)) return pools.map(() => 0)
  const inv = pools.map(p => 10n ** 36n / p)
  const sum = inv.reduce((a, b) => a + b, 0n)
  if (sum === 0n) return pools.map(() => 0)
  return inv.map(i => Number((i * 1_000_000_000n) / sum) / 1e9)
}

function distributeOthers(pools: bigint[], x: number, amount: bigint, increase: boolean): bigint[] {
  const out = [...pools]
  const len = out.length
  if (len <= 1 || amount === 0n) return out
  let otherSum = 0n
  for (let i = 0; i < len; i++) if (i !== x) otherSum += out[i]
  if (otherSum === 0n) return out
  let distributed = 0n
  for (let j = 0; j < len; j++) {
    if (j === x) continue
    const delta = (amount * out[j]) / otherSum
    out[j] = increase ? out[j] + delta : out[j] - delta
    distributed += delta
  }
  let remainder = amount - distributed
  for (let k = 0; k < len && remainder > 0n; k++) {
    if (k === x) continue
    if (increase) { out[k] += 1n; remainder -= 1n }
    else if (out[k] > 0n) { out[k] -= 1n; remainder -= 1n }
  }
  return out
}

function distributeAll(pools: bigint[], total: bigint, amount: bigint, increase: boolean): bigint[] {
  const out = [...pools]
  const len = out.length
  let distributed = 0n
  if (increase) {
    if (total === 0n) {
      const eq = amount / BigInt(len)
      let rem = amount - eq * BigInt(len)
      for (let i = 0; i < len; i++) { let a = eq; if (rem > 0n) { a += 1n; rem -= 1n } out[i] += a }
      return out
    }
    for (let j = 0; j < len; j++) { const d = (amount * out[j]) / total; out[j] += d; distributed += d }
    let remainder = amount - distributed
    for (let k = 0; k < len && remainder > 0n; k++) { out[k] += 1n; remainder -= 1n }
  } else {
    for (let x = 0; x < len; x++) { const d = (amount * out[x]) / total; out[x] -= d; distributed += d }
    let rem = amount - distributed
    for (let y = 0; y < len && rem > 0n; y++) if (out[y] > 0n) { out[y] -= 1n; rem -= 1n }
  }
  return out
}

/** Initial pools: initial liquidity split evenly, remainder spread one unit at a time. */
export function initialPools(n: number, liquidity: bigint): bigint[] {
  const base = liquidity / BigInt(n)
  let rem = liquidity - base * BigInt(n)
  return Array.from({ length: n }, () => { let p = base; if (rem > 0n) { p += 1n; rem -= 1n } return p })
}

export interface PoolState { pools: bigint[]; total: bigint }

export function applyBuy(s: PoolState, x: number, usdcIn: bigint, sharesOut: bigint, feeBps: bigint): PoolState {
  const fee = (usdcIn * feeBps) / BPS
  const netIn = usdcIn - fee
  const pools = [...s.pools]
  pools[x] -= sharesOut / SHARE_DEN
  return { pools: distributeOthers(pools, x, netIn, true), total: s.total + netIn }
}

export function applySell(s: PoolState, x: number, sharesIn: bigint): PoolState {
  const shareUsdc = sharesIn / SHARE_DEN
  const oldX = s.pools[x]
  const oldOther = s.total - oldX
  const newX = oldX + shareUsdc
  const newOther = (oldX * oldOther) / newX
  const gross = oldOther - newOther
  const pools = [...s.pools]
  pools[x] = newX
  return { pools: distributeOthers(pools, x, gross, false), total: s.total - gross }
}

/** shares received for `usdcIn` (mirrors getSharesOut) */
export function previewSharesOut(s: PoolState, x: number, usdcIn: bigint, feeBps: bigint): bigint {
  if (usdcIn === 0n) return 0n
  const netIn = usdcIn - (usdcIn * feeBps) / BPS
  if (netIn === 0n) return 0n
  const poolX = s.pools[x]
  const otherSum = s.total - poolX
  if (otherSum === 0n) return 0n
  const newPoolX = (poolX * otherSum) / (otherSum + netIn)
  if (newPoolX >= poolX) return 0n
  return (poolX - newPoolX) * SHARE_DEN
}

/** USDC received for selling `sharesIn` (mirrors getUsdcOut) */
export function previewUsdcOut(s: PoolState, x: number, sharesIn: bigint, feeBps: bigint): bigint {
  const shareUsdc = sharesIn / SHARE_DEN
  if (shareUsdc === 0n) return 0n
  const poolX = s.pools[x]
  const otherSum = s.total - poolX
  if (otherSum === 0n) return 0n
  const newPoolX = poolX + shareUsdc
  const newOther = (poolX * otherSum) / newPoolX
  if (newOther >= otherSum) return 0n
  const gross = otherSum - newOther
  return gross - (gross * feeBps) / BPS
}

// ── Depth ladder (the AMM's version of an order book) ───────────────────────

export interface LadderRow {
  size: number        // USDC for buys, shares for sells
  shares: number      // shares received (buy) / sold (sell)
  usdc: number        // USDC paid (buy) / received (sell)
  avgPrice: number    // USDC per share
  priceAfter: number  // outcome probability after the trade
  impactPct: number   // price move vs. now, in percentage points
}

export function buyLadder(s: PoolState, x: number, feeBps: bigint, sizes: number[]): LadderRow[] {
  const now = pricesFromPools(s.pools)[x]
  return sizes.flatMap(size => {
    const usdcIn = BigInt(Math.round(size * 1e6))
    const out = previewSharesOut(s, x, usdcIn, feeBps)
    if (out === 0n) return []
    const after = applyBuy(s, x, usdcIn, out, feeBps)
    const shares = Number(out) / 1e18
    return [{ size, shares, usdc: size, avgPrice: size / shares, priceAfter: pricesFromPools(after.pools)[x], impactPct: (pricesFromPools(after.pools)[x] - now) * 100 }]
  })
}

export function sellLadder(s: PoolState, x: number, feeBps: bigint, sizes: number[]): LadderRow[] {
  const now = pricesFromPools(s.pools)[x]
  return sizes.flatMap(size => {
    const sharesIn = BigInt(Math.round(size * 1e6)) * SHARE_DEN
    const out = previewUsdcOut(s, x, sharesIn, feeBps)
    if (out === 0n) return []
    const after = applySell(s, x, sharesIn)
    const usdc = Number(out) / 1e6
    return [{ size, shares: size, usdc, avgPrice: usdc / size, priceAfter: pricesFromPools(after.pools)[x], impactPct: (pricesFromPools(after.pools)[x] - now) * 100 }]
  })
}

// ── History replay ───────────────────────────────────────────────────────────

export interface Snapshot {
  block: bigint
  logIndex: number
  pools: bigint[]
  total: bigint
  prices: number[]
}

export interface Replay {
  snapshots: Snapshot[]   // [0] = state at creation, then one per pool-changing event
  final: PoolState
  feeBps: bigint
}

/** Replays events over the initial state. `feeAtStart` applies until the first FeeSet event. */
export function replay(n: number, initialLiquidity: bigint, feeAtStart: bigint, events: MarketEvent[], createdBlock: bigint): Replay {
  const evs = [...events].sort(eventOrder)
  let state: PoolState = { pools: initialPools(n, initialLiquidity), total: initialLiquidity }
  let fee = feeAtStart
  const snapshots: Snapshot[] = [{ block: createdBlock, logIndex: -1, pools: state.pools, total: state.total, prices: pricesFromPools(state.pools) }]
  for (const e of evs) {
    if (e.kind === 'fee') { fee = e.bps; continue }
    if (e.kind === 'buy') state = applyBuy(state, e.outcome, e.usdc, e.shares, fee)
    else if (e.kind === 'sell') state = applySell(state, e.outcome, e.shares)
    else if (e.kind === 'liq') { state = { pools: distributeAll(state.pools, state.total, e.amount, e.add), total: e.add ? state.total + e.amount : state.total - e.amount } }
    snapshots.push({ block: e.block, logIndex: e.logIndex, pools: state.pools, total: state.total, prices: pricesFromPools(state.pools) })
  }
  return { snapshots, final: state, feeBps: fee }
}

export const samePools = (a: bigint[], b: bigint[]) => a.length === b.length && a.every((v, i) => v === b[i])

/**
 * Finds the fee at creation time by trying likely values until the replayed end state
 * equals the market's real pools. Returns null if nothing reproduces it.
 */
export function replayMatching(n: number, initialLiquidity: bigint, events: MarketEvent[], createdBlock: bigint, onchainPools: bigint[], currentFeeBps: bigint): Replay | null {
  const firstFee = events.filter((e): e is FeeEvent => e.kind === 'fee').sort(eventOrder)[0]
  const candidates = firstFee ? [currentFeeBps, 200n, 0n, 100n, 250n, 300n, 500n, 50n] : [currentFeeBps]
  for (const c of new Set(candidates)) {
    const r = replay(n, initialLiquidity, c, events, createdBlock)
    if (samePools(r.final.pools, onchainPools)) return r
  }
  return null
}

// ── Holders ──────────────────────────────────────────────────────────────────

export interface Holder { address: `0x${string}`; shares: number[]; totalShares: number }

/** Net shares per wallet from buy/sell events (shares only change via trades until redemption). */
export function holdersFromTrades(trades: TradeEvent[], n: number): Holder[] {
  const map = new Map<string, bigint[]>()
  for (const t of trades) {
    const arr = map.get(t.user) ?? Array.from({ length: n }, () => 0n)
    arr[t.outcome] += t.kind === 'buy' ? t.shares : -t.shares
    map.set(t.user, arr)
  }
  return [...map.entries()]
    .map(([address, arr]) => {
      const shares = arr.map(v => Number(v > 0n ? v : 0n) / 1e18)
      return { address: address as `0x${string}`, shares, totalShares: shares.reduce((a, b) => a + b, 0) }
    })
    .filter(h => h.totalShares > 0.000001)
    .sort((a, b) => b.totalShares - a.totalShares)
}
