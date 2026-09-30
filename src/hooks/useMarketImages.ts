import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMarketImages, requestMarketImage } from '../lib/api'
import { useNetwork } from '../lib/adminConfig'
import type { Market } from '../lib/contract'

const usable = (u: string) => !!u && !u.startsWith('data:')

/**
 * Cover image for every market: the on-chain image when there is one, otherwise the AI-generated one saved by the server.
 * Markets that have neither are sent (one at a time) to the server to be generated with the admin's AI.
 */
export function useMarketImages(markets: Market[]): Record<string, string> {
  const network = useNetwork()
  const qc = useQueryClient()
  const missingOnChain = markets.filter(m => !usable(m.imageUrl)).map(m => m.id.toString())
  const key = ['market-images', network, missingOnChain.join(',')]
  const { data } = useQuery({ queryKey: key, enabled: missingOnChain.length > 0, queryFn: () => fetchMarketImages(missingOnChain.slice(0, 60), network), staleTime: 20_000 })
  const attempted = useRef(new Set<string>())
  const running = useRef(false)

  useEffect(() => {
    if (!data || running.current) return
    const todo = missingOnChain.filter(id => !data[id] && !attempted.current.has(`${network}:${id}`)).slice(0, 3)
    if (!todo.length) return
    running.current = true
    ;(async () => {
      for (const id of todo) {
        attempted.current.add(`${network}:${id}`)
        try {
          const r = await requestMarketImage(id, { network })
          if (r.imageUrl) qc.setQueryData(key, (old: Record<string, string> | undefined) => ({ ...(old ?? {}), [id]: r.imageUrl! }))
        } catch { /* try again on a later visit */ }
      }
    })().finally(() => { running.current = false; qc.invalidateQueries({ queryKey: ['market-images'] }) })
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const out: Record<string, string> = {}
  for (const m of markets) out[m.id.toString()] = usable(m.imageUrl) ? m.imageUrl : (data?.[m.id.toString()] ?? '')
  return out
}
