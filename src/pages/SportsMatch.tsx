import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAllMarkets } from '../hooks/useMarkets'
import { useSportsRegistry } from '../lib/sports'
import { KINDS, KIND_BY_ID } from '../lib/sportsCore'
import { Market, MarketStatus, timeUntil } from '../lib/contract'
import TradingPanel from '../components/TradingPanel'
import { OddsButton, TeamLogo, fmtKick } from '../components/sports/parts'

export default function SportsMatch() {
  const { eventId } = useParams()
  const { records } = useSportsRegistry(30_000)
  const { data, refetch } = useAllMarkets()
  const byId = useMemo(() => new Map(((data as unknown as Market[] | undefined) ?? []).map(m => [m.id.toString(), m])), [data])
  const r = records?.find(x => x.eventId === eventId)
  const [sel, setSel] = useState<{ kind: string; outcome: number } | null>(null)

  useEffect(() => { if (r && !sel) setSel({ kind: r.markets['1x2'] ? '1x2' : Object.keys(r.markets)[0], outcome: 0 }) }, [r]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!records) return <p className="py-24 text-center text-sm" style={{ color: 'var(--subtle)' }}>Loading match…</p>
  if (!r) return <div className="max-w-md mx-auto px-4 py-24 text-center"><p style={{ color: 'var(--muted)' }}>Match not found.</p><Link to="/sports" className="underline text-sm">Back to Sports</Link></div>

  const started = Date.now() >= r.kickoff
  const groups = [...new Set(KINDS.filter(k => r.markets[k.id]).map(k => k.group))]
  const selMarket = sel ? byId.get(r.markets[sel.kind] ?? '') : undefined
  const closed = !selMarket || selMarket.status !== MarketStatus.Open || started

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <Link to="/sports" className="inline-flex items-center gap-1.5 text-sm mb-4" style={{ color: 'var(--muted)' }}><ArrowLeft size={14} /> Soccer</Link>
      <div className="rounded-2xl p-5 mb-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="text-xs mb-3" style={{ color: 'var(--subtle)' }}>{r.leagueName} · {fmtKick(r.kickoff)}{!started && ` · starts in ${timeUntil(BigInt(Math.floor(r.kickoff / 1000)))}`}</p>
        <div className="flex items-center justify-center gap-4 sm:gap-10">
          <div className="flex flex-col items-center gap-2 flex-1 text-center"><TeamLogo team={r.home} size={56} /><span className="font-semibold">{r.home.name}</span></div>
          <div className="text-center">
            {r.result ? <span className="display text-4xl font-700 tabular-nums">{r.result.home} - {r.result.away}</span> : <span className="display text-2xl" style={{ color: 'var(--subtle)' }}>vs</span>}
            {r.result && <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>Full time</p>}
            {started && !r.result && <p className="text-xs mt-1" style={{ color: 'var(--warning)' }}>Betting closed</p>}
          </div>
          <div className="flex flex-col items-center gap-2 flex-1 text-center"><TeamLogo team={r.away} size={56} /><span className="font-semibold">{r.away.name}</span></div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-5 items-start">
        <div className="space-y-4">
          {groups.map(g => (
            <section key={g} className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--subtle)' }}>{g}</h2>
              <div className="space-y-3">
                {KINDS.filter(k => k.group === g && r.markets[k.id]).map(k => {
                  const m = byId.get(r.markets[k.id])
                  const names = m?.outcomes ?? k.outcomes(r.home.name, r.away.name)
                  return (
                    <div key={k.id} className="flex flex-wrap items-center gap-3">
                      <div className="w-full sm:w-56 text-sm">{k.label}
                        {m && <Link to={`/market/${m.id}`} className="ml-2 text-[11px] underline" style={{ color: 'var(--subtle)' }}>market #{m.id.toString()}</Link>}</div>
                      <div className="flex-1 grid gap-2" style={{ gridTemplateColumns: `repeat(${names.length}, minmax(0, 1fr))` }}>
                        {names.map((n, i) => (
                          <OddsButton key={i} market={m} index={i} label={n} selected={sel?.kind === k.id && sel.outcome === i} onClick={() => setSel({ kind: k.id, outcome: i })} />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
          <p className="text-xs px-1" style={{ color: 'var(--subtle)' }}>Odds are decimal (1 ÷ probability) and move as people trade. Settled on the 90-minute score from ESPN. If the match is cancelled, stakes are refunded.</p>
        </div>

        <aside className="lg:sticky lg:top-20">
          {selMarket && sel ? (
            <div>
              <p className="text-sm font-medium mb-2 px-1">{KIND_BY_ID[sel.kind]?.label}</p>
              {closed && <p className="text-xs mb-2 px-1" style={{ color: 'var(--warning)' }}>{selMarket.status === MarketStatus.Resolved ? 'Settled.' : selMarket.status === MarketStatus.Cancelled ? 'Cancelled: stakes refunded.' : 'Betting is closed for this market.'}</p>}
              <TradingPanel key={selMarket.id.toString()} market={selMarket} outcome={sel.outcome} onOutcomeChange={i => setSel({ kind: sel.kind, outcome: i })} onSuccess={() => { void refetch() }} />
            </div>
          ) : <p className="text-sm" style={{ color: 'var(--subtle)' }}>Pick an odd to place a bet.</p>}
        </aside>
      </div>
    </div>
  )
}
