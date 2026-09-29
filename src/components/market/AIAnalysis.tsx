import { useState } from 'react'
import { toast } from 'sonner'
import { Sparkles, RefreshCw } from 'lucide-react'
import { generateAnalysis } from '../../lib/aiMarkets'
import { saveMarketMeta, type AIAnalysis as Analysis, type MarketMeta } from '../../lib/api'
import { getAdminSession, useSiteConfig } from '../../lib/adminConfig'
import { outcomeColor, pct, timeAgo } from './format'

export default function AIAnalysis({ marketId, question, outcomes, prices, endsAt, meta, liquidityUsd, volumeUsd, isAdmin, onSaved }: {
  marketId: bigint; question: string; outcomes: string[]; prices: number[]; endsAt: Date; meta: MarketMeta
  liquidityUsd: number; volumeUsd: number; isAdmin: boolean; onSaved: (m: MarketMeta) => void
}) {
  const config = useSiteConfig()
  const [busy, setBusy] = useState(false)
  const a: Analysis | undefined = meta.analysis

  const run = async () => {
    if (!getAdminSession()) return toast.error('Sign in on the Admin page first.')
    if (!config.openrouterApiKey) return toast.error('Add your OpenRouter key in Admin → Config → AI Settings.')
    setBusy(true)
    try {
      const analysis = await generateAnalysis({ apiKey: config.openrouterApiKey, model: config.openrouterModel || 'openai/gpt-4o-mini', question, outcomes, prices, endsAt, resolutionCriteria: meta.resolutionCriteria, liquidityUsd, volumeUsd })
      onSaved(await saveMarketMeta(marketId, { analysis }))
      toast.success('AI analysis published')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Analysis failed') } finally { setBusy(false) }
  }

  const btn = isAdmin && (
    <button onClick={run} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
      {a ? <RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> : <Sparkles size={12} />}{busy ? 'Analyzing…' : a ? 'Regenerate' : 'Generate analysis'}
    </button>
  )

  if (!a) return (
    <div className="text-center py-6">
      <Sparkles size={22} className="mx-auto mb-2" style={{ color: 'var(--subtle)' }} />
      <p className="text-sm mb-3" style={{ color: 'var(--subtle)' }}>{isAdmin ? 'No analysis yet. Generate one from recent headlines and the current odds.' : 'No AI analysis has been published for this market yet.'}</p>
      {btn}
    </div>
  )

  const Block = ({ title, items, color }: { title: string; items: string[]; color?: string }) => items.length ? (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: color ?? 'var(--subtle)' }}>{title}</h4>
      <ul className="space-y-1.5">{items.map((t, i) => <li key={i} className="text-sm flex gap-2" style={{ color: 'var(--ink-2)' }}><span style={{ color: color ?? 'var(--subtle)' }}>•</span><span>{t}</span></li>)}</ul>
    </div>
  ) : null

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs" style={{ color: 'var(--subtle)' }}>
          AI-generated · {a.model} · {timeAgo(Math.floor(a.generatedAt / 1000))} · confidence <strong style={{ color: 'var(--ink-2)' }}>{a.confidence}</strong>
        </div>
        {btn}
      </div>
      <p className="text-sm" style={{ color: 'var(--ink)' }}>{a.summary}</p>

      {a.probabilities.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--subtle)' }}>AI estimate vs market</h4>
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
        </div>
      )}
      <Block title="Reasoning" items={a.reasoning} />
      <div className="grid md:grid-cols-2 gap-4">
        <Block title={`Case for ${outcomes[0]}`} items={a.bullCase} color="var(--success)" />
        <Block title={`Case against`} items={a.bearCase} color="var(--danger)" />
      </div>
      <Block title="Risks & uncertainties" items={a.risks} color="var(--warning)" />
      <p className="text-xs" style={{ color: 'var(--subtle)' }}>AI analysis is informational, can be wrong, and is not financial advice.</p>
    </div>
  )
}
