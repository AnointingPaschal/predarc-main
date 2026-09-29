import { useEffect, useMemo, useRef, useState } from 'react'
import { useReadContracts, usePublicClient } from 'wagmi'
import type { PublicClient } from 'viem'
import { PREDARC_ABI, Market } from '../lib/contract'
import { activeChainId, activeContract, activeSettings } from '../lib/adminConfig'
import { buildPosition, type Position } from '../lib/portfolio'
import { loadUserTrades, type UserTrade } from '../lib/marketHistory'
import { useAllMarkets, useUserPositions } from './useMarkets'

export function usePortfolio(address: `0x${string}` | undefined) {
  const { data: ids, isLoading: idsLoading, refetch: refetchIds } = useUserPositions(address)
  const { data: all, isLoading: marketsLoading, refetch: refetchMarkets } = useAllMarkets()
  const markets = useMemo(() => {
    const idSet = new Set(((ids as bigint[] | undefined) ?? []).map(String))
    return ((all as Market[] | undefined) ?? []).filter(m => idSet.has(String(m.id)))
  }, [ids, all])

  const calls = useMemo(() => !address ? [] : markets.flatMap(m => [
    ...m.outcomes.map((_, i) => ({ address: activeContract(), abi: PREDARC_ABI, chainId: activeChainId(), functionName: 'getUserShares' as const, args: [m.id, address, BigInt(i)] as const })),
    { address: activeContract(), abi: PREDARC_ABI, chainId: activeChainId(), functionName: 'userCostBasis' as const, args: [m.id, address] as const },
  ]), [markets, address])
  const reads = useReadContracts({ contracts: calls, query: { enabled: calls.length > 0, refetchInterval: 15_000 } })

  const positions: Position[] = useMemo(() => {
    if (!reads.data) return []
    let k = 0
    return markets.map(m => {
      const shares = m.outcomes.map(() => { const r = reads.data![k++]; return r?.status === 'success' ? (r.result as bigint) : 0n })
      const cost = (() => { const r = reads.data![k++]; return r?.status === 'success' ? (r.result as bigint) : 0n })()
      return buildPosition(m, shares, cost)
    }).filter(p => p.holdings.length > 0 || p.claimable > 0 || p.costBasis > 0)
  }, [markets, reads.data])

  // trade history
  const client = usePublicClient({ chainId: activeChainId() }) as PublicClient | undefined
  const [trades, setTrades] = useState<UserTrade[] | null>(null)
  const [tradesError, setTradesError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const earliest = useMemo(() => markets.reduce<bigint | null>((a, m) => (a === null || m.id < a ? m.id : a), null), [markets])
  const seq = useRef(0)
  useEffect(() => {
    if (!client || !address || earliest === null) { if (!idsLoading && !marketsLoading && markets.length === 0) setTrades([]); return }
    const my = ++seq.current
    setTradesError(null)
    loadUserTrades(client, activeContract(), address, earliest, activeSettings().deployBlock)
      .then(t => { if (my === seq.current) setTrades(t) })
      .catch(e => { if (my === seq.current) setTradesError(e instanceof Error ? e.message : 'Could not load trade history') })
  }, [client, address, earliest, attempt, idsLoading, marketsLoading, markets.length])

  return {
    positions, trades, tradesError, retryTrades: () => setAttempt(a => a + 1),
    loading: idsLoading || marketsLoading || (calls.length > 0 && reads.isLoading),
    refetch: () => { void refetchIds(); void refetchMarkets(); void reads.refetch(); setAttempt(a => a + 1) },
  }
}
