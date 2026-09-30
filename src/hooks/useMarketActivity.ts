import { useEffect, useRef, useState } from 'react'
import { usePublicClient } from 'wagmi'
import type { PublicClient } from 'viem'
import { activeContract, activeChainId, activeSettings } from '../lib/adminConfig'
import { loadMarketActivity, type MarketActivity } from '../lib/marketHistory'

/**
 * Loads trades / price history / holders for a market from onchain events and
 * refreshes when the live pool state changes (so charts update as people trade).
 */
const activityCache = new Map<string, MarketActivity>()

/** `delayMs` postpones the (heavy) onchain history scan, e.g. on the home page; results are cached per market state. */
export function useMarketActivity(marketId: bigint | undefined, outcomeCount: number, pools: bigint[] | undefined, total: bigint | undefined, feeBps: bigint | undefined, delayMs = 0) {
  const client = usePublicClient({ chainId: activeChainId() }) as PublicClient | undefined
  const [data, setData] = useState<MarketActivity | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)
  const [attempt, setAttempt] = useState(0)
  const sig = pools ? pools.join(',') + ':' + String(total) : ''

  useEffect(() => {
    if (!client || marketId === undefined || !pools || total === undefined || feeBps === undefined || !outcomeCount) return
    const my = ++seq.current
    const ck = `${activeContract()}:${marketId}:${sig}`
    const hit = activityCache.get(ck)
    if (hit) { setData(hit); setError(null); setLoading(false); return }
    setLoading(true)
    let cancelled = false
    const start = () => Promise.race([
      loadMarketActivity(client, activeContract(), marketId, outcomeCount, { pools, total }, feeBps, activeSettings().deployBlock),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Loading activity took too long — the RPC may be slow or rate-limited.')), 90_000)),
    ])
      .then(d => { activityCache.set(ck, d); if (my === seq.current && !cancelled) { setData(d); setError(null) } })
      .catch(e => { if (my === seq.current) setError(e instanceof Error ? e.message : 'Failed to load activity') })
      .finally(() => { if (my === seq.current) setLoading(false) })
    const timer = window.setTimeout(() => { void start() }, delayMs)
    return () => { cancelled = true; window.clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, marketId, sig, feeBps, outcomeCount, attempt])

  return { data, error, loading, retry: () => setAttempt(a => a + 1) }
}
