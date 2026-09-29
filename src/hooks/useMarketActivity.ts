import { useEffect, useRef, useState } from 'react'
import { usePublicClient } from 'wagmi'
import type { PublicClient } from 'viem'
import { activeContract, activeChainId, activeSettings } from '../lib/adminConfig'
import { loadMarketActivity, type MarketActivity } from '../lib/marketHistory'

/**
 * Loads trades / price history / holders for a market from onchain events and
 * refreshes when the live pool state changes (so charts update as people trade).
 */
export function useMarketActivity(marketId: bigint | undefined, outcomeCount: number, pools: bigint[] | undefined, total: bigint | undefined, feeBps: bigint | undefined) {
  const client = usePublicClient({ chainId: activeChainId() }) as PublicClient | undefined
  const [data, setData] = useState<MarketActivity | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)
  const sig = pools ? pools.join(',') + ':' + String(total) : ''

  useEffect(() => {
    if (!client || marketId === undefined || !pools || total === undefined || feeBps === undefined || !outcomeCount) return
    const my = ++seq.current
    setLoading(true)
    loadMarketActivity(client, activeContract(), marketId, outcomeCount, { pools, total }, feeBps, activeSettings().deployBlock)
      .then(d => { if (my === seq.current) { setData(d); setError(null) } })
      .catch(e => { if (my === seq.current) setError(e instanceof Error ? e.message : 'Failed to load activity') })
      .finally(() => { if (my === seq.current) setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, marketId, sig, feeBps, outcomeCount])

  return { data, error, loading }
}
