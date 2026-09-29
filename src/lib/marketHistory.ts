// Rebuilds a market's full activity (trades, liquidity, price history) from onchain events.
import { parseAbiItem, type AbiEvent, type PublicClient } from 'viem'
import { replayMatching, holdersFromTrades, type MarketEvent, type TradeEvent, type Replay, type Holder, type PoolState } from './marketMath'

const EV = {
  created: parseAbiItem('event MarketCreated(uint256 indexed marketId, uint8 marketType, string question, uint256 endTime)'),
  bought: parseAbiItem('event SharesBought(uint256 indexed marketId, address indexed user, uint256 outcomeIndex, uint256 usdcIn, uint256 sharesOut)'),
  sold: parseAbiItem('event SharesSold(uint256 indexed marketId, address indexed user, uint256 outcomeIndex, uint256 sharesIn, uint256 usdcOut)'),
  liqAdd: parseAbiItem('event LiquidityAdded(uint256 indexed marketId, uint256 amount)'),
  liqRem: parseAbiItem('event LiquidityRemoved(uint256 indexed marketId, uint256 amount)'),
  fee: parseAbiItem('event FeeSet(uint256 newFeeBps)'),
}

type AnyLog = { blockNumber: bigint; logIndex: number; transactionHash: string; args: Record<string, unknown> }

/** getLogs that halves the block range whenever the RPC rejects it. */
export async function getLogsAdaptive(client: PublicClient, address: `0x${string}`, event: AbiEvent, from: bigint, to: bigint, args?: Record<string, unknown>, depth = 0): Promise<AnyLog[]> {
  try {
    const logs = await client.getLogs({ address, event: event as never, args: args as never, fromBlock: from, toBlock: to })
    return logs as unknown as AnyLog[]
  } catch (e) {
    if (to - from < 1000n || depth > 24) throw e
    const mid = from + (to - from) / 2n
    const [a, b] = await Promise.all([
      getLogsAdaptive(client, address, event, from, mid, args, depth + 1),
      getLogsAdaptive(client, address, event, mid + 1n, to, args, depth + 1),
    ])
    return [...a, ...b]
  }
}

const COMMENT_EV = {
  posted: parseAbiItem('event CommentPosted(uint256 indexed marketId, uint256 indexed commentId, address indexed author, uint256 parentId, string text)'),
  deleted: parseAbiItem('event CommentDeleted(uint256 indexed marketId, uint256 indexed commentId, address indexed by)'),
  reaction: parseAbiItem('event CommentReaction(uint256 indexed marketId, uint256 indexed commentId, address indexed user, bool liked)'),
}

const createdCache = new Map<string, bigint>()
const blockTimeCache = new Map<string, number>()

const withTimeout = <T,>(p: Promise<T>, ms: number, what: string): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} timed out — the RPC is slow or unreachable.`)), ms))])

/**
 * Finds the block a market was created in by binary-searching the contract's market count
 * (monotonic) — about 25 cheap calls instead of scanning millions of blocks for logs.
 * Falls back to a log scan if the RPC has no historical state.
 */
export async function findCreationBlock(client: PublicClient, contract: `0x${string}`, marketId: bigint, latest: bigint, deployBlock: bigint): Promise<bigint> {
  const countAt = async (blockNumber: bigint): Promise<bigint> => {
    try { return (await client.readContract({ address: contract, abi: COUNT_ABI, functionName: 'getTotalMarkets', blockNumber })) as bigint } catch { return 0n }
  }
  if ((await countAt(latest)) >= marketId) {
    let lo = deployBlock, hi = latest
    while (lo < hi) {
      const mid = lo + (hi - lo) / 2n
      if ((await countAt(mid)) >= marketId) hi = mid; else lo = mid + 1n
    }
    const check = await client.getLogs({ address: contract, event: EV.created as never, args: { marketId } as never, fromBlock: lo, toBlock: lo }).catch(() => [])
    if (check.length) return lo
  }
  // Fallback: scan logs (works when the RPC allows wide ranges or after splitting)
  const logs = await getLogsAdaptive(client, contract, EV.created, deployBlock, latest, { marketId })
  if (!logs.length) throw new Error("Could not find this market's creation event on this network.")
  return logs[0].blockNumber
}

const COUNT_ABI = [{ type: 'function', name: 'getTotalMarkets', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' }] as const

export interface MarketActivity {
  trades: (TradeEvent & { ts: number })[]
  replay: Replay | null
  createdBlock: bigint
  createdTs: number
  /** unix seconds for every snapshot in replay.snapshots */
  snapshotTimes: number[]
  holders: Holder[]
  approximate: boolean // true when the replay could not be matched to the live pools
}

export async function loadMarketActivity(
  client: PublicClient, contract: `0x${string}`, marketId: bigint, outcomeCount: number,
  onchain: PoolState, currentFeeBps: bigint, deployBlock?: number,
): Promise<MarketActivity> {
  const latest = await client.getBlockNumber()
  const key = `${contract}:${marketId}`
  let createdBlock = createdCache.get(key)
  if (createdBlock === undefined) {
    createdBlock = await withTimeout(findCreationBlock(client, contract, marketId, latest, BigInt(deployBlock ?? 0)), 40_000, 'Locating the market')
    createdCache.set(key, createdBlock)
  }
  const range = [createdBlock, latest] as const
  const [bought, sold, add, rem, fees] = await Promise.all([
    withTimeout(getLogsAdaptive(client, contract, EV.bought, ...range, { marketId }), 60_000, 'Loading trades'),
    withTimeout(getLogsAdaptive(client, contract, EV.sold, ...range, { marketId }), 60_000, 'Loading trades'),
    withTimeout(getLogsAdaptive(client, contract, EV.liqAdd, ...range, { marketId }), 60_000, 'Loading trades'),
    withTimeout(getLogsAdaptive(client, contract, EV.liqRem, ...range, { marketId }), 60_000, 'Loading trades'),
    withTimeout(getLogsAdaptive(client, contract, EV.fee, ...range), 60_000, 'Loading fees'),
  ])
  const events: MarketEvent[] = []
  for (const l of bought) events.push({ kind: 'buy', block: l.blockNumber, logIndex: l.logIndex, txHash: l.transactionHash, user: l.args.user as `0x${string}`, outcome: Number(l.args.outcomeIndex), usdc: l.args.usdcIn as bigint, shares: l.args.sharesOut as bigint })
  for (const l of sold) events.push({ kind: 'sell', block: l.blockNumber, logIndex: l.logIndex, txHash: l.transactionHash, user: l.args.user as `0x${string}`, outcome: Number(l.args.outcomeIndex), usdc: l.args.usdcOut as bigint, shares: l.args.sharesIn as bigint })
  for (const l of add) events.push({ kind: 'liq', add: true, block: l.blockNumber, logIndex: l.logIndex, amount: l.args.amount as bigint })
  for (const l of rem) events.push({ kind: 'liq', add: false, block: l.blockNumber, logIndex: l.logIndex, amount: l.args.amount as bigint })
  for (const l of fees) events.push({ kind: 'fee', block: l.blockNumber, logIndex: l.logIndex, bps: l.args.newFeeBps as bigint })

  // Initial liquidity = live total minus everything that changed it since creation.
  // (createMarket's own amount isn't in an event, so derive it by walking backwards is unsafe;
  // instead brute-force from the first-trade-independent identity below.)
  const initialLiquidity = await deriveInitialLiquidity(client, contract, marketId, createdBlock)

  const fee = currentFeeBps
  const replay = replayMatching(outcomeCount, initialLiquidity, events, createdBlock, onchain.pools, fee)

  // Timestamps for the blocks we need (unique)
  const blocks = new Set<bigint>([createdBlock])
  events.forEach(e => blocks.add(e.block))
  const times = new Map<bigint, number>()
  const list = [...blocks]
  for (let i = 0; i < list.length; i += 25) {
    await Promise.all(list.slice(i, i + 25).map(async b => {
      const ck = `${contract}:${b}`
      const hit = blockTimeCache.get(ck)
      if (hit) { times.set(b, hit); return }
      try {
        const t = Number((await withTimeout(client.getBlock({ blockNumber: b }), 15_000, 'Block lookup')).timestamp)
        blockTimeCache.set(ck, t); times.set(b, t)
      } catch { times.set(b, 0) }
    }))
  }
  const trades = events.filter((e): e is TradeEvent => e.kind === 'buy' || e.kind === 'sell')
    .map(t => ({ ...t, ts: times.get(t.block) ?? 0 }))
    .sort((a, b) => (a.block === b.block ? b.logIndex - a.logIndex : a.block < b.block ? 1 : -1))

  const poolEvents = events.filter(e => e.kind !== 'fee').sort((a, b) => (a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1))
  const snapshotTimes = [times.get(createdBlock) ?? 0, ...poolEvents.map(e => times.get(e.block) ?? 0)]

  return {
    trades, replay, createdBlock, createdTs: times.get(createdBlock) ?? 0,
    snapshotTimes, holders: holdersFromTrades(trades, outcomeCount), approximate: !replay,
  }
}

/** The initial liquidity is the USDC transferred into the contract by createMarket; read it from the USDC Transfer log in the same tx. */
async function deriveInitialLiquidity(client: PublicClient, contract: `0x${string}`, marketId: bigint, createdBlock: bigint): Promise<bigint> {
  const logs = await client.getLogs({ address: contract, event: EV.created as never, args: { marketId } as never, fromBlock: createdBlock, toBlock: createdBlock })
  const tx = (logs[0] as unknown as AnyLog).transactionHash as `0x${string}`
  const receipt = await client.getTransactionReceipt({ hash: tx })
  const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
  const pad = (a: string) => '0x' + a.toLowerCase().replace('0x', '').padStart(64, '0')
  const to = pad(contract)
  const t = receipt.logs.find(l => l.topics[0] === TRANSFER && l.topics[2]?.toLowerCase() === to)
  return t ? BigInt(t.data) : 0n // free markets are created with 0 liquidity (no transfer)
}


export interface OnchainComment { id: string; address: string; text: string; ts: number; parentId?: string; likes: string[]; txHash: string }

/** Onchain comments for a market (contract v2+): posted, minus deleted, with likes from the latest reaction per user. */
export async function loadOnchainComments(client: PublicClient, contract: `0x${string}`, marketId: bigint, deployBlock?: number): Promise<OnchainComment[]> {
  const latest = await client.getBlockNumber()
  const key = `${contract}:${marketId}`
  let from = createdCache.get(key)
  if (from === undefined) {
    from = await withTimeout(findCreationBlock(client, contract, marketId, latest, BigInt(deployBlock ?? 0)), 40_000, 'Locating the market')
    createdCache.set(key, from)
  }
  const [posted, deleted, reacted] = await Promise.all([
    withTimeout(getLogsAdaptive(client, contract, COMMENT_EV.posted, from, latest, { marketId }), 60_000, 'Loading comments'),
    withTimeout(getLogsAdaptive(client, contract, COMMENT_EV.deleted, from, latest, { marketId }), 60_000, 'Loading comments'),
    withTimeout(getLogsAdaptive(client, contract, COMMENT_EV.reaction, from, latest, { marketId }), 60_000, 'Loading comments'),
  ])
  const gone = new Set(deleted.map(l => String(l.args.commentId)))
  const likeState = new Map<string, Map<string, boolean>>()
  ;[...reacted].sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1)).forEach(l => {
    const id = String(l.args.commentId); const m = likeState.get(id) ?? new Map<string, boolean>()
    m.set((l.args.user as string).toLowerCase(), Boolean(l.args.liked)); likeState.set(id, m)
  })
  const blocks = [...new Set(posted.map(l => l.blockNumber))]
  const times = new Map<bigint, number>()
  for (let i = 0; i < blocks.length; i += 25) {
    await Promise.all(blocks.slice(i, i + 25).map(async b => {
      const ck = `${contract}:${b}`; const hit = blockTimeCache.get(ck)
      if (hit) { times.set(b, hit); return }
      try { const t = Number((await withTimeout(client.getBlock({ blockNumber: b }), 15_000, 'Block lookup')).timestamp); blockTimeCache.set(ck, t); times.set(b, t) } catch { times.set(b, 0) }
    }))
  }
  return posted.filter(l => !gone.has(String(l.args.commentId))).map(l => ({
    id: String(l.args.commentId), address: (l.args.author as string).toLowerCase(), text: String(l.args.text),
    ts: (times.get(l.blockNumber) ?? 0) * 1000, parentId: l.args.parentId ? String(l.args.parentId) : undefined,
    likes: [...(likeState.get(String(l.args.commentId)) ?? new Map()).entries()].filter(([, v]) => v).map(([k]) => k),
    txHash: l.transactionHash,
  }))
}


// ── A wallet's trades across all markets (portfolio) ─────────────────────────
const USER_EV = {
  bought: EV.bought, sold: EV.sold,
  redeemed: parseAbiItem('event WinningsRedeemed(uint256 indexed marketId, address indexed user, uint256 amount)'),
}
export interface UserTrade { kind: 'buy' | 'sell' | 'redeem'; marketId: bigint; outcome: number; usdc: bigint; shares: bigint; block: bigint; logIndex: number; txHash: string; ts: number }

export async function loadUserTrades(client: PublicClient, contract: `0x${string}`, user: `0x${string}`, earliestMarketId: bigint, deployBlock?: number): Promise<UserTrade[]> {
  const latest = await client.getBlockNumber()
  const key = `${contract}:${earliestMarketId}`
  let from = createdCache.get(key)
  if (from === undefined) {
    from = await withTimeout(findCreationBlock(client, contract, earliestMarketId, latest, BigInt(deployBlock ?? 0)), 40_000, 'Locating your first market')
    createdCache.set(key, from)
  }
  const [bought, sold, redeemed] = await Promise.all([
    withTimeout(getLogsAdaptive(client, contract, USER_EV.bought, from, latest, { user }), 60_000, 'Loading your trades'),
    withTimeout(getLogsAdaptive(client, contract, USER_EV.sold, from, latest, { user }), 60_000, 'Loading your trades'),
    withTimeout(getLogsAdaptive(client, contract, USER_EV.redeemed, from, latest, { user }), 60_000, 'Loading your trades'),
  ])
  const out: UserTrade[] = []
  const base = (l: AnyLog) => ({ marketId: l.args.marketId as bigint, block: l.blockNumber, logIndex: l.logIndex, txHash: l.transactionHash, ts: 0 })
  bought.forEach(l => out.push({ ...base(l), kind: 'buy', outcome: Number(l.args.outcomeIndex), usdc: l.args.usdcIn as bigint, shares: l.args.sharesOut as bigint }))
  sold.forEach(l => out.push({ ...base(l), kind: 'sell', outcome: Number(l.args.outcomeIndex), usdc: l.args.usdcOut as bigint, shares: l.args.sharesIn as bigint }))
  redeemed.forEach(l => out.push({ ...base(l), kind: 'redeem', outcome: -1, usdc: l.args.amount as bigint, shares: 0n }))
  const blocks = [...new Set(out.map(t => t.block))]
  const times = new Map<bigint, number>()
  for (let i = 0; i < blocks.length; i += 25) {
    await Promise.all(blocks.slice(i, i + 25).map(async b => {
      const ck = `${contract}:${b}`; const hit = blockTimeCache.get(ck)
      if (hit) { times.set(b, hit); return }
      try { const t = Number((await withTimeout(client.getBlock({ blockNumber: b }), 15_000, 'Block lookup')).timestamp); blockTimeCache.set(ck, t); times.set(b, t) } catch { times.set(b, 0) }
    }))
  }
  out.forEach(t => { t.ts = times.get(t.block) ?? 0 })
  return out.sort((a, b) => (a.block === b.block ? b.logIndex - a.logIndex : a.block < b.block ? 1 : -1))
}
