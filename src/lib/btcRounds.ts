// "Bitcoin Up or Down" rounds — contract ABI, live price feed and chain reads.
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { parseAbi, parseAbiItem } from 'viem'
import { getLogsAdaptive } from './marketHistory'
import { activeChainId, activeSettings, loadConfig, useSiteConfig, useNetwork, getNetworkSettings } from './adminConfig'

export const BTC_ROUNDS_ABI = parseAbi([
  'function duration() view returns (uint256)',
  'function enabled() view returns (bool)',
  'function feeBps() view returns (uint256)',
  'function minBet() view returns (uint256)',
  'function maxBet() view returns (uint256)',
  'function buffer() view returns (uint256)',
  'function feed() view returns (address)',
  'function maxStaleness() view returns (uint256)',
  'function feeRecipient() view returns (address)',
  'function accruedFees() view returns (uint256)',
  'function owner() view returns (address)',
  'function keepers(address) view returns (bool)',
  'function boundaryPrice(uint256) view returns (uint256)',
  'function currentBoundary() view returns (uint256)',
  'function roundStatus(uint256) view returns (uint8)',
  'function roundInfo(uint256) view returns ((uint256 start,uint256 lockPrice,uint256 closePrice,uint256 upTotal,uint256 downTotal,uint8 status))',
  'function stakeOf(uint256,address) view returns (uint256 up,uint256 down,bool claimed)',
  'function claimable(uint256,address) view returns (uint256 amount,bool refund)',
  'function bet(uint256 roundId,bool up,uint256 amount)',
  'function claim(uint256 roundId) returns (uint256)',
  'function sweepFee(uint256 roundId)',
  'function recordBoundary(uint256 boundary,uint256 price)',
  'function setEnabled(bool on)',
  'function setFee(uint256 bps)',
  'function setBetLimits(uint256 min_,uint256 max_)',
  'function setBuffer(uint256 seconds_)',
  'function setFeed(address feed_,uint256 maxStaleness_)',
  'function setKeeper(address keeper,bool allowed)',
  'function setFeeRecipient(address recipient)',
  'function withdrawFees()',
])

export const RoundStatus = { Upcoming: 0, Live: 1, Pending: 2, SettledUp: 3, SettledDown: 4, Void: 5 } as const

export interface RoundData {
  id: number
  start: number            // unix seconds
  lockPrice: number        // USD (0 = not recorded)
  closePrice: number
  upTotal: bigint
  downTotal: bigint
  status: number
  myUp: bigint
  myDown: bigint
  claimed: boolean
  claimable: bigint
  refund: boolean
}

export interface BtcState {
  address: `0x${string}`
  duration: number
  enabled: boolean
  feeBps: number
  minBet: bigint
  maxBet: bigint
  buffer: number
  feed: string
  chainNow: number         // unix seconds (chain time)
  rounds: RoundData[]      // ascending id: current-HISTORY .. current+3
  currentId: number
}

const HISTORY = 24
const AHEAD = 3
const P = 1e8

export function btcRoundsAddress(): string {
  return ((activeSettings() as { btcRoundsAddress?: string }).btcRoundsAddress ?? '').trim()
}

/** Whether the BTC rounds feature is switched on for visitors and has a contract on this network. */
export function useBtcAvailable(): boolean {
  const cfg = useSiteConfig()
  const net = useNetwork()
  const addr = (getNetworkSettings(cfg, net).btcRoundsAddress ?? '').trim()
  return cfg.btcEnabled && /^0x[0-9a-fA-F]{40}$/.test(addr)
}

export function useBtcState(user: `0x${string}` | undefined, refetchMs = 4000) {
  const client = usePublicClient({ chainId: activeChainId() })
  const addr = btcRoundsAddress()
  return useQuery<BtcState | null>({
    queryKey: ['btc-state', activeChainId(), addr, user],
    enabled: !!client && /^0x[0-9a-fA-F]{40}$/.test(addr),
    refetchInterval: refetchMs,
    staleTime: 2000,
    queryFn: async () => {
      if (!client) return null
      const address = addr as `0x${string}`
      const abi = BTC_ROUNDS_ABI
      const block = await client.getBlock()
      const chainNow = Number(block.timestamp)
      const [duration, enabled, feeBps, minBet, maxBet, buffer, feed] = await Promise.all([
        client.readContract({ address, abi, functionName: 'duration' }),
        client.readContract({ address, abi, functionName: 'enabled' }),
        client.readContract({ address, abi, functionName: 'feeBps' }),
        client.readContract({ address, abi, functionName: 'minBet' }),
        client.readContract({ address, abi, functionName: 'maxBet' }),
        client.readContract({ address, abi, functionName: 'buffer' }),
        client.readContract({ address, abi, functionName: 'feed' }),
      ])
      const dur = Number(duration)
      const currentId = Math.floor(chainNow / dur)
      const ids: number[] = []
      for (let i = currentId - HISTORY; i <= currentId + AHEAD; i++) if (i > 0) ids.push(i)
      const calls = ids.flatMap(id => {
        const c = [{ address, abi, functionName: 'roundInfo', args: [BigInt(id)] } as const]
        if (user) {
          c.push({ address, abi, functionName: 'stakeOf', args: [BigInt(id), user] } as never)
          c.push({ address, abi, functionName: 'claimable', args: [BigInt(id), user] } as never)
        }
        return c
      })
      const res = (await client.multicall({ contracts: calls as never, allowFailure: true })) as { result?: unknown }[]
      const per = user ? 3 : 1
      const rounds: RoundData[] = ids.map((id, i) => {
        const info = res[i * per]?.result as { start: bigint; lockPrice: bigint; closePrice: bigint; upTotal: bigint; downTotal: bigint; status: number } | undefined
        const stake = user ? (res[i * per + 1]?.result as readonly [bigint, bigint, boolean] | undefined) : undefined
        const claim = user ? (res[i * per + 2]?.result as readonly [bigint, boolean] | undefined) : undefined
        return {
          id,
          start: info ? Number(info.start) : id * dur,
          lockPrice: info ? Number(info.lockPrice) / P : 0,
          closePrice: info ? Number(info.closePrice) / P : 0,
          upTotal: info?.upTotal ?? 0n,
          downTotal: info?.downTotal ?? 0n,
          status: info ? Number(info.status) : 0,
          myUp: stake?.[0] ?? 0n,
          myDown: stake?.[1] ?? 0n,
          claimed: stake?.[2] ?? false,
          claimable: claim?.[0] ?? 0n,
          refund: claim?.[1] ?? false,
        }
      })
      return { address, duration: dur, enabled, feeBps: Number(feeBps), minBet, maxBet, buffer: Number(buffer), feed, chainNow, rounds, currentId }
    },
  })
}

// ── Live BTC price (Coinbase; browser talks to it directly) ──────────────────

export interface PricePoint { t: number; p: number } // ms, USD

export async function fetchSpot(): Promise<number> {
  const r = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot')
  const j = await r.json() as { data?: { amount?: string } }
  const n = Number(j.data?.amount)
  if (!n) throw new Error('no price')
  return n
}

export async function fetchCandles(minutes = 60): Promise<PricePoint[]> {
  const end = Math.floor(Date.now() / 1000), start = end - minutes * 60
  const url = `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60&start=${new Date(start * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`
  const r = await fetch(url)
  const rows = await r.json() as [number, number, number, number, number, number][]
  return rows.map(c => ({ t: c[0] * 1000, p: c[4] })).sort((a, b) => a.t - b.t)
}

/** Streams the BTC/USD price. Uses Coinbase's websocket, and falls back to polling if it can't connect. */
export function useLiveBtcPrice(): { price: number | null; points: PricePoint[]; live: boolean } {
  const [price, setPrice] = useState<number | null>(null)
  const [points, setPoints] = useState<PricePoint[]>([])
  const [live, setLive] = useState(false)
  const last = useRef(0)

  useEffect(() => {
    let closed = false
    let ws: WebSocket | null = null
    let poll: ReturnType<typeof setInterval> | null = null
    const push = (p: number, t = Date.now()) => {
      setPrice(p)
      if (t - last.current >= 1000) {
        last.current = t
        setPoints(prev => [...prev.filter(x => t - x.t < 65 * 60 * 1000), { t, p }])
      }
    }
    fetchCandles(60).then(c => { if (!closed) setPoints(c) }).catch(() => { /* chart fills from live ticks */ })
    fetchSpot().then(p => { if (!closed) push(p) }).catch(() => { /* wait for the stream */ })

    const startPolling = () => {
      if (poll) return
      poll = setInterval(() => fetchSpot().then(p => { if (!closed) { setLive(true); push(p) } }).catch(() => setLive(false)), 3000)
    }
    try {
      ws = new WebSocket('wss://ws-feed.exchange.coinbase.com')
      ws.onopen = () => ws?.send(JSON.stringify({ type: 'subscribe', product_ids: ['BTC-USD'], channels: ['ticker'] }))
      ws.onmessage = ev => {
        try {
          const m = JSON.parse(ev.data as string) as { type?: string; price?: string }
          if (m.type === 'ticker' && m.price) { setLive(true); push(Number(m.price)) }
        } catch { /* ignore */ }
      }
      ws.onerror = () => { setLive(false); startPolling() }
      ws.onclose = () => { if (!closed) { setLive(false); startPolling() } }
    } catch { startPolling() }
    return () => { closed = true; ws?.close(); if (poll) clearInterval(poll) }
  }, [])

  return { price, points, live }
}

// ── Keeper (server) ──────────────────────────────────────────────────────────

/** Asks the server keeper to record the round-boundary price if one is due. Safe to call often. */
export async function pingKeeper(network: string): Promise<void> {
  try { await fetch(`/api/btc-keeper?network=${network}`, { method: 'POST' }) } catch { /* best effort */ }
}

export const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
export { loadConfig }

// ── Shared UTC time (everyone sees the same clock, whatever their timezone) ──

const p2 = (n: number) => String(n).padStart(2, '0')
/** "14:35" in UTC from unix seconds. */
export const utcHM = (sec: number) => { const d = new Date(sec * 1000); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}` }
/** "14:35:07 UTC" from unix seconds. */
export const utcHMS = (sec: number) => { const d = new Date(sec * 1000); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} UTC` }
export const utcRange = (startSec: number, dur: number) => `${utcHM(startSec)}–${utcHM(startSec + dur)} UTC`

// ── Probability model ────────────────────────────────────────────────────────

const erf = (x: number) => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return x >= 0 ? y : -y
}
const cdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2))

/** Chance (0..1) that BTC finishes the round above the price to beat, from the gap, recent volatility and time left. */
export function upChance(points: PricePoint[], price: number | null, lock: number, secLeft: number): number | null {
  if (!price || !lock) return null
  const recent = points.filter(p => Date.now() - p.t < 20 * 60 * 1000)
  if (recent.length < 10) return price >= lock ? 0.6 : 0.4
  // per-second variance from the recent sample
  let sum = 0, n = 0
  for (let i = 1; i < recent.length; i++) {
    const dt = Math.max(1, (recent[i].t - recent[i - 1].t) / 1000)
    const r = Math.log(recent[i].p / recent[i - 1].p)
    sum += (r * r) / dt; n++
  }
  const sigma = Math.sqrt(sum / Math.max(1, n)) // per sqrt-second
  const sd = Math.max(sigma * Math.sqrt(Math.max(secLeft, 1)), 1e-6)
  const z = Math.log(price / lock) / sd
  return Math.min(0.99, Math.max(0.01, cdf(z)))
}

// ── 24h stats ────────────────────────────────────────────────────────────────

export interface DayStats { change: number; changePct: number; high: number; low: number; open: number }

export function useBtcDayStats() {
  return useQuery<DayStats | null>({
    queryKey: ['btc-24h'],
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      const end = Math.floor(Date.now() / 1000), start = end - 24 * 3600
      const url = `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=300&start=${new Date(start * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`
      const rows = await (await fetch(url)).json() as [number, number, number, number, number, number][]
      if (!Array.isArray(rows) || !rows.length) return null
      const sorted = rows.slice().sort((a, b) => a[0] - b[0])
      const open = sorted[0][3], close = sorted[sorted.length - 1][4]
      return { open, change: close - open, changePct: ((close - open) / open) * 100, high: Math.max(...sorted.map(r => r[2])), low: Math.min(...sorted.map(r => r[1])) }
    },
  })
}

// ── Recent bets feed ─────────────────────────────────────────────────────────

const BET_EVENT = parseAbiItem('event RoundBet(uint256 indexed roundId, address indexed user, bool up, uint256 amount)')
export interface BetLog { roundId: number; user: string; up: boolean; amount: bigint; block: bigint; index: number }

export function useBtcBets(refetchMs = 8000) {
  const client = usePublicClient({ chainId: activeChainId() })
  const addr = btcRoundsAddress()
  return useQuery<BetLog[]>({
    queryKey: ['btc-bets', activeChainId(), addr],
    enabled: !!client && /^0x[0-9a-fA-F]{40}$/.test(addr),
    refetchInterval: refetchMs,
    staleTime: 4000,
    queryFn: async () => {
      if (!client) return []
      const latest = await client.getBlockNumber()
      const from = latest > 40000n ? latest - 40000n : 0n
      const logs = await getLogsAdaptive(client as never, addr as `0x${string}`, BET_EVENT as never, from, latest)
      return logs.map(l => {
        const a = (l as unknown as { args: { roundId: bigint; user: string; up: boolean; amount: bigint }; blockNumber: bigint; logIndex: number })
        return { roundId: Number(a.args.roundId), user: a.args.user, up: a.args.up, amount: a.args.amount, block: a.blockNumber, index: a.logIndex }
      }).sort((x, y) => (x.block === y.block ? y.index - x.index : x.block < y.block ? 1 : -1)).slice(0, 40)
    },
  })
}

/** Chain-synchronised clock: identical for every visitor. Ticks every 500ms. */
export function useBtcClock(state: BtcState | null | undefined) {
  const [, setT] = useState(0)
  const [skew, setSkew] = useState(0)
  useEffect(() => { const i = setInterval(() => setT(t => t + 1), 500); return () => clearInterval(i) }, [])
  useEffect(() => { if (state) setSkew(state.chainNow * 1000 - Date.now()) }, [state?.chainNow]) // eslint-disable-line react-hooks/exhaustive-deps
  const dur = state?.duration ?? 300
  const nowSec = (Date.now() + skew) / 1000
  const curId = Math.floor(nowSec / dur)
  return { nowSec, skew, dur, curId, secLeft: (curId + 1) * dur - nowSec }
}
