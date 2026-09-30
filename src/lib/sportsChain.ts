// PredarcSports: client side (ABI, line type, reads). Lines are adapted to the regular `Market` shape so the
// existing odds buttons and cards work unchanged.
import { useEffect, useMemo, useState } from 'react'
import { usePublicClient } from 'wagmi'
import type { PublicClient } from 'viem'
import { activeChainId, activeSettings, useSiteConfig } from './adminConfig'
import { Market, MarketStatus, MarketType } from './contract'

export { SPORTS_ABI }
import { SPORTS_ABI } from './sportsAbi'

export function sportsAddress(): `0x${string}` | '' {
  const a = ((activeSettings() as { sportsAddress?: string }).sportsAddress ?? '').trim()
  return /^0x[0-9a-fA-F]{40}$/.test(a) ? (a as `0x${string}`) : ''
}
export function useSportsAvailable(): boolean {
  useSiteConfig()
  return !!sportsAddress()
}

export interface SportsLine {
  id: bigint; matchId: bigint; kind: string; question: string; outcomes: string[]; pools: bigint[]
  endTime: bigint; resolveTime: bigint; status: number; winning: bigint; liquidity: bigint; sets: bigint; fees: bigint; netCostTotal: bigint
}

/** View of a sports line as a regular market (status 0 open / 1 resolved / 2 cancelled → Open / Resolved / Cancelled). */
export function lineToMarket(l: SportsLine): Market {
  return {
    id: l.id, marketType: l.outcomes.length === 2 ? MarketType.Binary : MarketType.MultipleChoice,
    status: l.status === 1 ? MarketStatus.Resolved : l.status === 2 ? MarketStatus.Cancelled : MarketStatus.Open,
    question: l.question, outcomes: [...l.outcomes], endTime: l.endTime, resolutionTime: l.resolveTime,
    resolvedOutcome: l.winning, resolvedScalarValue: 0n, scalarLow: 0n, scalarHigh: 0n,
    totalLiquidity: l.sets, outcomePools: [...l.pools], feesCollected: l.fees, creator: '', category: 'Soccer', imageUrl: '', featured: false,
  }
}

const cache = new Map<string, { at: number; line: SportsLine }>()

/** Loads many lines in chunks (one eth_call per 40 lines) and refreshes on an interval. */
export function useSportsLines(ids: string[], refetchMs = 20_000) {
  const client = usePublicClient({ chainId: activeChainId() }) as PublicClient | undefined
  const addr = sportsAddress()
  const key = ids.join(',')
  const [map, setMap] = useState<Map<string, Market>>(new Map())
  const [raw, setRaw] = useState<Map<string, SportsLine>>(new Map())
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!client || !addr || !ids.length) { setMap(new Map()); return }
    let dead = false
    const load = async () => {
      try {
        const out = new Map<string, SportsLine>()
        for (let i = 0; i < ids.length; i += 40) {
          const chunk = ids.slice(i, i + 40).map(BigInt)
          const lines = (await client.readContract({ address: addr, abi: SPORTS_ABI, functionName: 'getLines', args: [chunk] })) as unknown as SportsLine[]
          lines.forEach(l => { out.set(l.id.toString(), l); cache.set(`${addr}:${l.id}`, { at: Date.now(), line: l }) })
        }
        if (!dead) { setRaw(out); setMap(new Map([...out].map(([k, v]) => [k, lineToMarket(v)]))) }
      } catch { /* keep the previous data */ }
    }
    void load()
    const t = refetchMs ? setInterval(load, refetchMs) : undefined
    return () => { dead = true; if (t) clearInterval(t) }
  }, [client, addr, key, refetchMs, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => ({ markets: map, lines: raw, refresh: () => setTick(x => x + 1) }), [map, raw])
}

/** Live lines for every registered match, keyed by line id (as Market shape). */
export function useSportsMarkets(records: { markets: Record<string, string> }[] | null | undefined, refetchMs = 20_000) {
  const ids = useMemo(() => [...new Set((records ?? []).flatMap(r => Object.values(r.markets)))].sort((a, b) => Number(a) - Number(b)), [records])
  return useSportsLines(ids, refetchMs)
}
