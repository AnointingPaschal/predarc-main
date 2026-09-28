import { useState } from 'react'
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, Zap, Newspaper, List, Bot, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { generateMarkets, AIMarketDraft, AIGenerateMode, OPENROUTER_MODELS } from '../lib/aiMarkets'
import { loadConfig } from '../lib/adminConfig'
import { CATEGORIES } from '../lib/contract'

interface AIMarketGeneratorProps {
  onUseMarket: (draft: AIMarketDraft) => void
}

type MarketTypeFilter = 'binary' | 'multiple' | 'scalar'

const MODE_INFO = {
  topic:  { icon: <Zap size={14} />,       label: 'From Topic',    desc: 'Describe a topic and AI generates a market' },
  news:   { icon: <Newspaper size={14} />, label: 'From News',     desc: 'Paste headlines and AI turns them into markets' },
  batch:  { icon: <List size={14} />,      label: 'Batch',         desc: 'Generate multiple markets across categories' },
  auto:   { icon: <Bot size={14} />,       label: 'Auto-Generate', desc: 'AI picks trending topics automatically' },
}

const inputCls = 'w-full px-3 py-2.5 rounded-xl text-sm outline-none'
  + ' bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--ink)] placeholder:text-[var(--subtle)]'

export default function AIMarketGenerator({ onUseMarket }: AIMarketGeneratorProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<AIGenerateMode>('topic')
  const [topic, setTopic] = useState('')
  const [newsContext, setNewsContext] = useState('')
  const [count, setCount] = useState(5)
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['Crypto', 'Sports', 'Politics'])
  const [selectedTypes, setSelectedTypes] = useState<MarketTypeFilter[]>(['binary', 'multiple', 'scalar'])
  const [loading, setLoading] = useState(false)
  const [drafts, setDrafts] = useState<AIMarketDraft[]>([])
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const config = loadConfig()
  const hasKey = !!config.openrouterApiKey

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    )
  }

  const toggleType = (t: MarketTypeFilter) => {
    setSelectedTypes(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    )
  }

  const handleGenerate = async () => {
    if (!hasKey) {
      toast.error('Add your OpenRouter API key in Admin → Config → AI Settings first.')
      return
    }
    if (mode === 'topic' && !topic.trim()) {
      toast.error('Enter a topic first.')
      return
    }
    if (mode === 'news' && !newsContext.trim()) {
      toast.error('Paste some news headlines or context first.')
      return
    }
    if (selectedTypes.length === 0) {
      toast.error('Select at least one market type.')
      return
    }

    setLoading(true)
    setDrafts([])
    try {
      const results = await generateMarkets({
        mode,
        topic,
        newsContext,
        count,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
        marketTypes: selectedTypes,
        apiKey: config.openrouterApiKey,
        model: config.openrouterModel || 'openai/gpt-4o-mini',
      })
      setDrafts(results)
      if (results.length === 0) {
        toast.warning('AI returned no markets. Try a different topic or model.')
      } else {
        toast.success(`Generated ${results.length} market${results.length > 1 ? 's' : ''}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI generation failed.')
    } finally {
      setLoading(false)
    }
  }

  const marketTypeLabel = (t: 0 | 1 | 2) =>
    t === 0 ? 'Binary' : t === 1 ? 'Multiple' : 'Scalar'

  const marketTypeColor = (t: 0 | 1 | 2) =>
    t === 0 ? 'var(--accent)' : t === 1 ? 'var(--success)' : 'var(--warning)'

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 group"
        style={{ background: 'transparent' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}>
            <Sparkles size={15} />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>AI Market Generator</p>
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>
              {hasKey ? `Powered by ${OPENROUTER_MODELS.find(m => m.id === config.openrouterModel)?.label ?? config.openrouterModel}` : 'Configure API key in Config tab'}
            </p>
          </div>
        </div>
        <div style={{ color: 'var(--subtle)' }}>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="pt-4" />

          {/* Mode selector */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.entries(MODE_INFO) as [AIGenerateMode, typeof MODE_INFO.topic][]).map(([m, info]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="flex flex-col items-start gap-1 p-3 rounded-xl text-left transition-all"
                style={{
                  background: mode === m ? 'var(--accent-bg, rgba(99,102,241,0.12))' : 'var(--surface-muted)',
                  border: `1px solid ${mode === m ? 'var(--accent)' : 'var(--border)'}`,
                  color: mode === m ? 'var(--accent)' : 'var(--muted)',
                }}
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  {info.icon} {info.label}
                </span>
                <span className="text-[10px] leading-tight" style={{ color: 'var(--subtle)' }}>{info.desc}</span>
              </button>
            ))}
          </div>

          {/* Mode-specific inputs */}
          {mode === 'topic' && (
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--subtle)' }}>Topic or question idea</label>
              <input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. Bitcoin price, 2026 US election, Champions League final..."
                className={inputCls}
                onKeyDown={e => e.key === 'Enter' && void handleGenerate()}
              />
            </div>
          )}

          {mode === 'news' && (
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--subtle)' }}>Paste news headlines or event context</label>
              <textarea
                value={newsContext}
                onChange={e => setNewsContext(e.target.value)}
                placeholder="Paste recent news headlines, event summaries, or any context you want AI to create markets from..."
                rows={4}
                className={inputCls}
                style={{ resize: 'vertical' }}
              />
            </div>
          )}

          {(mode === 'batch' || mode === 'auto') && (
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--subtle)' }}>Number of markets to generate</label>
              <input
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={e => setCount(Math.min(20, Math.max(1, parseInt(e.target.value) || 5)))}
                className={inputCls}
              />
            </div>
          )}

          {/* Category selector (batch/auto/news) */}
          {mode !== 'topic' && (
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--subtle)' }}>Categories</label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.filter(c => c !== 'All').map(cat => (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                    style={{
                      background: selectedCategories.includes(cat) ? 'var(--accent)' : 'var(--surface-muted)',
                      color: selectedCategories.includes(cat) ? 'var(--accent-text, #fff)' : 'var(--muted)',
                      border: `1px solid ${selectedCategories.includes(cat) ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Market type filter */}
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: 'var(--subtle)' }}>Market types to generate</label>
            <div className="flex gap-2">
              {(['binary', 'multiple', 'scalar'] as MarketTypeFilter[]).map(t => (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all capitalize"
                  style={{
                    background: selectedTypes.includes(t) ? 'var(--surface-strong, rgba(255,255,255,0.1))' : 'var(--surface-muted)',
                    border: `1px solid ${selectedTypes.includes(t) ? 'var(--accent)' : 'var(--border)'}`,
                    color: selectedTypes.includes(t) ? 'var(--ink)' : 'var(--subtle)',
                  }}
                >
                  {selectedTypes.includes(t) && <Check size={10} />}
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={() => void handleGenerate()}
            disabled={loading || !hasKey}
            className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}
          >
            {loading
              ? <><RefreshCw size={14} className="animate-spin" /> Generating...</>
              : <><Sparkles size={14} /> Generate Markets</>
            }
          </button>

          {!hasKey && (
            <p className="text-xs text-center" style={{ color: 'var(--danger)' }}>
              Add your OpenRouter API key in Admin → Config → AI Settings to enable generation.
            </p>
          )}

          {/* Results */}
          {drafts.length > 0 && (
            <div className="space-y-2 mt-2">
              <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                {drafts.length} market{drafts.length > 1 ? 's' : ''} generated — click Use to load into the create form
              </p>
              {drafts.map((draft, idx) => (
                <div
                  key={idx}
                  className="rounded-xl overflow-hidden transition-all"
                  style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
                >
                  {/* Card header */}
                  <div className="flex items-start gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(99,102,241,0.12)', color: marketTypeColor(draft.marketType) }}
                        >
                          {marketTypeLabel(draft.marketType)}
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--subtle)' }}>{draft.category}</span>
                      </div>
                      <p className="text-sm font-medium leading-snug" style={{ color: 'var(--ink)' }}>
                        {draft.question}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {draft.outcomes.map((o, i) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                            {o}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => { onUseMarket(draft); toast.success('Market loaded into form') }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: 'var(--accent)', color: 'var(--accent-text, #fff)' }}
                      >
                        <Check size={11} /> Use
                      </button>
                      <button
                        onClick={() => setDrafts(d => d.filter((_, i) => i !== idx))}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs"
                        style={{ background: 'var(--surface)', color: 'var(--subtle)', border: '1px solid var(--border)' }}
                      >
                        <X size={11} /> Skip
                      </button>
                    </div>
                  </div>

                  {/* Expand for rationale */}
                  {draft.rationale && (
                    <>
                      <button
                        onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                        className="w-full px-3 py-1.5 text-left text-[10px] flex items-center gap-1"
                        style={{ color: 'var(--subtle)', borderTop: '1px solid var(--border)' }}
                      >
                        {expandedIdx === idx ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                        {expandedIdx === idx ? 'Hide' : 'Show'} AI reasoning · {draft.suggestedDurationDays}d · ${draft.suggestedLiquidity} liquidity
                      </button>
                      {expandedIdx === idx && (
                        <div className="px-3 pb-3">
                          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                            {draft.rationale}
                          </p>
                          {draft.marketType === 2 && (
                            <p className="text-[11px] mt-1" style={{ color: 'var(--subtle)' }}>
                              Range: {draft.scalarLow} – {draft.scalarHigh} {draft.scalarUnit}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}

              {drafts.length > 1 && (
                <button
                  onClick={() => { drafts.forEach(d => onUseMarket(d)); toast.success('All markets loaded') }}
                  className="w-full py-2 rounded-xl text-xs font-semibold"
                  style={{ background: 'var(--surface-muted)', color: 'var(--accent)', border: '1px solid var(--border)' }}
                >
                  Use All {drafts.length} Markets
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
