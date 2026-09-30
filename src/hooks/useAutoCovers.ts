import { useEffect, useRef, useState } from 'react'
import { fetchImageIndex, generateMarketImage, saveMarketMeta } from '../lib/api'
import { getAdminSession, getEffectiveNetwork } from '../lib/adminConfig'
import { MarketStatus, type Market } from '../lib/contract'

const tried = new Set<string>() // markets attempted in this page session (successful or not)
const PER_VISIT = 25

/** Public index of cover images stored off-chain (market id → url). */
export function useImageIndex() {
  const [index, setIndex] = useState<Record<string, string>>({})
  useEffect(() => { fetchImageIndex().then(setIndex).catch(() => undefined) }, [])
  return { index, add: (id: string, url: string) => setIndex(x => ({ ...x, [id]: url })) }
}

/**
 * Admin only: works through saved markets that have no cover, generating one at a time from the market text
 * (the same brief-first generator as the editor), and stores it off-chain so every visitor sees it.
 */
export function useAutoCovers(opts: { enabled: boolean; markets: Market[]; hasImage: (m: Market) => boolean; onDone: (id: string, url: string) => void }) {
  const { enabled, markets, hasImage, onDone } = opts
  const [state, setState] = useState<{ running: boolean; done: number; total: number; current: string; needsSignIn: boolean; error: string }>({ running: false, done: 0, total: 0, current: '', needsSignIn: false, error: '' })
  const stopRef = useRef(false)
  const runningRef = useRef(false)
  const doneCount = useRef(0)
  const failures = useRef(0)

  const pending = markets.filter(m => m.category !== 'Soccer' && m.status === MarketStatus.Open && !hasImage(m) && !tried.has(`${getEffectiveNetwork()}:${m.id}`))
  const pendingKey = pending.map(m => m.id.toString()).join(',')

  useEffect(() => {
    if (!enabled || !pending.length || runningRef.current || stopRef.current) return
    if (!getAdminSession()) { setState(s => ({ ...s, needsSignIn: true })); return }
    runningRef.current = true
    setState(s => ({ ...s, running: true, needsSignIn: false, total: doneCount.current + pending.length, error: '' }))
    void (async () => {
      for (const m of pending) {
        if (stopRef.current || doneCount.current >= PER_VISIT || failures.current >= 3) break
        const k = `${getEffectiveNetwork()}:${m.id}`
        tried.add(k)
        setState(s => ({ ...s, current: m.question }))
        try {
          const url = await generateMarketImage({ question: m.question, outcomes: m.outcomes, category: m.category })
          await saveMarketMeta(m.id, { imageUrl: url })
          onDone(m.id.toString(), url)
          doneCount.current++; failures.current = 0
          setState(s => ({ ...s, done: doneCount.current }))
        } catch (e) {
          failures.current++
          setState(s => ({ ...s, error: e instanceof Error ? e.message : 'Image generation failed' }))
        }
        await new Promise(r => setTimeout(r, 1500))
      }
      runningRef.current = false
      setState(s => ({ ...s, running: false, current: '' }))
    })()
  }, [enabled, pendingKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, remaining: pending.length, stop: () => { stopRef.current = true; setState(s => ({ ...s, running: false })) } }
}
