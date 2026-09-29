import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Sparkles, RefreshCw } from 'lucide-react'
import { requestAnalysis, type MarketMeta } from '../../lib/api'
import { getAdminSession } from '../../lib/adminConfig'
import { outcomeColor, pct, timeAgo } from './format'

const STALE_MS = 6 * 60 * 60 * 1000

/** AI insights load automatically: the server generates them (admin's saved key + model) when missing or stale. */
export default function AIInsights({ marketId, outcomes, prices, meta, metaLoaded, isAdmin, active, onMeta }: {
  marketId: bigint; outcomes: string[]; prices: number[]; meta: MarketMeta; metaLoaded: boolean; isAdmin: boolean; active: boolean; onMeta: (m: MarketMeta) => void
}) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const asked = useRef<string>('')
  const a = meta.analysis
  const stale = !a || Date.now() - a.generatedAt > STALE_MS

  const run = async (force = false) => {
    if (force && !getAdminSession()) return toast.error('Sign in on the Admin page to force a refresh.')
    setBusy(true); setNote('')
    try {
      const r = await requestAnalysis(marketId, force)
      onMeta(r.meta)
      if (r.status === 'unavailable' || r.status === 'error') setNote(r.reason ?? 'AI insights are unavailable right now.')
      if (r.status === 'pending') setTimeout(() => { void run() }, 6000)
    } catch (e) { setNote(e instanceof Error ? e.message : 'Could not load AI insights.') } finally { setBusy(false) }
  }

  useEffect(() => {
    if (!metaLoaded || !active) return
    const key = `${marketId}`
    if (asked.current === key) return
    asked.current = key
    if (stale || !meta.resolutionCriteria) void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaLoaded, marketId, active])

  const Block = ({ title, items, color }: { title: string; items: string[]; color?: string }) => items.length ? (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: color ?? 'var(--subtle)' }}>{title}</h4>
      <ul className="space-y-1.5">{items.map((t, i) => <li key={i} className="text-sm flex gap-2" style={{ color: 'var(--ink-2)' }}><span style={{ color: color ?? 'var(--subtle)' }}>•</span><span>{t}</span></li>)}</ul>
    </div>
  ) : null

  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--ink-2)' }}><Sparkles size={14} style={{ color: 'var(--accent)' }} />AI insights</h2>
        {isAdmin && (
          <button onClick={() => run(true)} disabled={busy} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium disabled:opacity-50" style={{ background: 'var(--surface-strong)', color: 'var(--muted)' }}>
            <RefreshCw size={11} className={busy ? 'animate-spin' : ''} />Refresh
          </button>
        )}
      </div>

      {!a && busy && (
        <div className="space-y-2 animate-pulse">
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>Analyzing this market against the latest headlines…</p>
          {[90, 100, 70].map((w, i) => <div key={i} className="h-3 rounded" style={{ width: `${w}%`, background: 'var(--surface-muted)' }} />)}
        </div>
      )}
      {!a && !busy && <p className="text-sm" style={{ color: note ? 'var(--warning)' : 'var(--subtle)' }}>{note || 'Insights will appear here shortly.'}</p>}

      {a && (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--ink)' }}>{a.summary}</p>
          {a.probabilities.length > 0 && (
            <div className="space-y-2">
              {outcomes.map((o, i) => {
                const ai = a.probabilities.find(p => p.outcome.toLowerCase() === o.toLowerCase())?.probability
                if (ai === undefined) return null
                const diff = (ai - (prices[i] ?? 0)) * 100
                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1"><span style={{ color: 'var(--muted)' }}>{o}</span>
                      <span className="tabular-nums" style={{ color: 'var(--ink-2)' }}>AI {pct(ai, 0)} · market {pct(prices[i] ?? 0, 0)} <span style={{ color: Math.abs(diff) < 3 ? 'var(--subtle)' : diff > 0 ? 'var(--success)' : 'var(--danger)' }}>({diff > 0 ? '+' : ''}{diff.toFixed(0)}pt)</span></span></div>
                    <div className="relative h-2 rounded-full" style={{ background: 'var(--surface-muted)' }}>
                      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${ai * 100}%`, background: outcomeColor(i), opacity: 0.85 }} />
                      <div className="absolute -top-0.5 w-0.5 h-3 rounded" style={{ left: `${(prices[i] ?? 0) * 100}%`, background: 'var(--ink)' }} title="Market price" />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <Block title="Reasoning" items={a.reasoning} />
          <div className="grid md:grid-cols-2 gap-4">
            <Block title={`Case for ${outcomes[0]}`} items={a.bullCase} color="var(--success)" />
            <Block title="Case against" items={a.bearCase} color="var(--danger)" />
          </div>
          <Block title="Risks & uncertainties" items={a.risks} color="var(--warning)" />
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            AI-generated · {a.model} · {timeAgo(Math.floor(a.generatedAt / 1000))} · confidence {a.confidence}{busy ? ' · refreshing…' : ''}. Informational only, can be wrong, not financial advice.
          </p>
          {note && <p className="text-xs" style={{ color: 'var(--warning)' }}>{note}</p>}
        </div>
      )}
    </div>
  )
}
