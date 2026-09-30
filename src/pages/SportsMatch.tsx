import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Trophy, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { useSportsMarkets } from '../lib/sportsChain'
import BetPanel from '../components/sports/BetPanel'
import { useSportsRegistry } from '../lib/sports'
import { KINDS, KIND_BY_ID, criteriaFor } from '../lib/sportsCore'
import { OddsButton, TeamLogo, fmtKick } from '../components/sports/parts'
import { MatchStatus } from '../components/sports/MatchCard'

export default function SportsMatch() {
  const { eventId } = useParams()
  const { records } = useSportsRegistry(30_000)
  const r = records?.find(x => x.eventId === eventId)
  const { markets: byId, lines, refresh } = useSportsMarkets(r ? [r] : undefined, 12_000)
  const [sel, setSel] = useState<{ kind: string; outcome: number } | null>(null)
  useEffect(() => { if (r && !sel) setSel({ kind: r.markets['1x2'] ? '1x2' : Object.keys(r.markets)[0], outcome: 0 }) }, [r]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!records) return <div className="max-w-7xl mx-auto px-4 py-8 space-y-4"><div className="h-56 rounded-3xl skeleton" /><div className="h-64 rounded-2xl skeleton" /></div>
  if (!r) return <div className="max-w-md mx-auto px-4 py-24 text-center"><p style={{ color: 'var(--muted)' }}>Match not found.</p><Link to="/sports" className="underline text-sm">Back to Sports</Link></div>

  const groups = [...new Set(KINDS.filter(k => r.markets[k.id]).map(k => k.group))]
  const selId = sel ? r.markets[sel.kind] : undefined
  const selLine = selId ? lines.get(selId) : undefined
  const share = async () => {
    const url = window.location.href
    try { if (navigator.share) await navigator.share({ title: `${r.home.name} vs ${r.away.name}`, url }); else { await navigator.clipboard.writeText(url); toast.success('Link copied') } } catch { /* cancelled */ }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <Link to="/sports" className="inline-flex items-center gap-2 text-sm hover:opacity-80" style={{ color: 'var(--subtle)' }}><ArrowLeft size={14} />All matches</Link>

      {/* Match header */}
      <div className="relative overflow-hidden rounded-3xl p-5 sm:p-8" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 20%, var(--surface)) 0%, var(--surface) 60%)', border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)' }}>
        <Trophy size={200} className="absolute -right-8 -top-8 -rotate-12 pointer-events-none" style={{ color: 'var(--accent)', opacity: .06 }} />
        <div className="relative flex items-center justify-between gap-3 mb-6">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent)' }}><Trophy size={13} />{r.leagueName}</span>
          <div className="flex items-center gap-2"><MatchStatus r={r} /><button onClick={share} className="p-1.5 rounded-lg hover:opacity-80" style={{ color: 'var(--subtle)' }} title="Share"><Share2 size={15} /></button></div>
        </div>
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
          <div className="flex flex-col items-center gap-3 text-center min-w-0"><TeamLogo team={r.home} size={84} /><span className="display text-base sm:text-xl font-600 text-balance">{r.home.name}</span><span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>Home</span></div>
          <div className="text-center">
            {r.result ? <div className="display text-4xl sm:text-6xl font-700 tabular-nums">{r.result.home}<span style={{ color: 'var(--subtle)' }}> : </span>{r.result.away}</div>
              : <div className="display text-3xl sm:text-4xl font-700" style={{ color: 'var(--subtle)' }}>VS</div>}
            <p className="text-xs mt-2 tabular-nums" style={{ color: 'var(--muted)' }}>{fmtKick(r.kickoff)}</p>
          </div>
          <div className="flex flex-col items-center gap-3 text-center min-w-0"><TeamLogo team={r.away} size={84} /><span className="display text-base sm:text-xl font-600 text-balance">{r.away.name}</span><span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>Away</span></div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
      {/* Betting lines */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>Betting lines</h2>
          <span className="text-[11px]" style={{ color: 'var(--subtle)' }}>Decimal odds · tap to bet</span>
        </div>
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-5">
          {groups.map(g => (
            <section key={g}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--subtle)' }}>{g}</h3>
              <div className="space-y-2.5">
                {KINDS.filter(k => k.group === g && r.markets[k.id]).map(k => {
                  const m = byId.get(r.markets[k.id])
                  const names = m?.outcomes ?? k.outcomes(r.home.name, r.away.name)
                  return (
                    <div key={k.id}>
                      <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>{k.label}</p>
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${names.length}, minmax(0, 1fr))` }}>
                        {names.map((n, i) => <OddsButton key={i} market={m} index={i} label={n} selected={sel?.kind === k.id && sel.outcome === i} onClick={() => { setSel({ kind: k.id, outcome: i }); document.getElementById('match-market')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} />)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
        <p className="text-xs mt-5" style={{ color: 'var(--subtle)' }}>Odds are 1 ÷ probability and move as people trade. Settled on the 90-minute score; if the match is cancelled, stakes are refunded.</p>
      </div>

      <aside id="match-market" className="scroll-mt-20 space-y-4 lg:sticky lg:top-20">
        {selLine ? (
          <>
            <BetPanel line={selLine} outcome={sel?.outcome ?? 0} onOutcome={i => setSel(x => x && { ...x, outcome: i })} onDone={refresh} />
            <div className="rounded-2xl p-4 space-y-2 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>About this line</p>
              <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Backing liquidity</span><b className="tabular-nums">${(Number(selLine.liquidity) / 1e6).toLocaleString()}</b></div>
              <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Betting closes</span><b className="tabular-nums">{fmtKick(Number(selLine.endTime) * 1000)}</b></div>
              <p className="text-xs pt-1" style={{ color: 'var(--muted)' }}>{KIND_BY_ID[selLine.kind] ? criteriaFor(KIND_BY_ID[selLine.kind]) : 'Settled on the 90-minute score.'}</p>
            </div>
          </>
        ) : <div className="h-64 rounded-2xl skeleton" />}
      </aside>
      </div>
    </div>
  )
}
