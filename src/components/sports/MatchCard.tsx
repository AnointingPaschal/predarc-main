import { Link } from 'react-router-dom'
import { ChevronRight, Radio, Trophy } from 'lucide-react'
import type { Market } from '../../lib/contract'
import { MarketStatus } from '../../lib/contract'
import type { SportsRecord } from '../../lib/sportsCore'
import { OddsButton, TeamLogo, fmtKick } from './parts'

export const isDone = (r: SportsRecord) => Object.values(r.markets).every(id => r.settled[id])

export function countdown(ms: number): string {
  const s = Math.floor((ms - Date.now()) / 1000)
  if (s <= 0) return 'Started'
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function MatchStatus({ r }: { r: SportsRecord }) {
  const done = isDone(r), started = Date.now() >= r.kickoff
  const cancelled = r.status === 'cancelled'
  const [label, tone] = cancelled ? ['Cancelled', 'var(--danger)']
    : done ? ['Full time', 'var(--muted)']
      : started ? ['Awaiting result', 'var(--warning)']
        : [`Starts in ${countdown(r.kickoff)}`, 'var(--accent)']
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold whitespace-nowrap" style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}>
      {started && !done && !cancelled && <Radio size={10} />}{label}
    </span>
  )
}

/** Match card used on the Sports page and mixed into the home grid. */
export default function MatchCard({ r, byId, compact }: { r: SportsRecord; byId: Map<string, Market>; compact?: boolean }) {
  const m1 = byId.get(r.markets['1x2'] ?? '')
  const mou = byId.get(r.markets['ou_2.5'] ?? ''), mgg = byId.get(r.markets['btts'] ?? '')
  const done = isDone(r)
  const open = (m?: Market) => m && m.status === MarketStatus.Open
  const lines = Object.keys(r.markets).length
  const abbr = (t: SportsRecord['home']) => (t.abbr || t.name).slice(0, 3).toUpperCase()

  return (
    <Link to={`/sports/${r.eventId}`} className="group block rounded-2xl overflow-hidden theme-transition hover:-translate-y-0.5"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)' }}>
      <div className="flex items-center justify-between gap-2 px-4 py-2 text-[11px]" style={{ background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 14%, var(--surface)), var(--surface))', borderBottom: '1px solid var(--border)' }}>
        <span className="inline-flex items-center gap-1.5 font-semibold truncate" style={{ color: 'var(--accent)' }}><Trophy size={11} />{r.leagueName}</span>
        <span className="tabular-nums shrink-0" style={{ color: 'var(--subtle)' }}>{fmtKick(r.kickoff)}</span>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0 space-y-2.5">
            {[r.home, r.away].map((t, i) => (
              <div key={i} className="flex items-center gap-3">
                <TeamLogo team={t} size={compact ? 26 : 32} />
                <span className="text-[15px] font-semibold truncate flex-1" style={{ color: 'var(--ink)' }}>{t.name}</span>
                {r.result && <span className="display text-xl font-700 tabular-nums">{i === 0 ? r.result.home : r.result.away}</span>}
              </div>
            ))}
          </div>
          <ChevronRight size={16} className="transition-transform group-hover:translate-x-0.5 shrink-0" style={{ color: 'var(--subtle)' }} />
        </div>

        {!done && (
          <div className="mt-4 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <OddsButton market={m1} index={0} label={abbr(r.home)} />
              <OddsButton market={m1} index={1} label="Draw" />
              <OddsButton market={m1} index={2} label={abbr(r.away)} />
            </div>
            {(open(mou) || open(mgg)) && (
              <div className="grid grid-cols-4 gap-2">
                {open(mou) && <><OddsButton compact market={mou} index={0} label="Over 2.5" /><OddsButton compact market={mou} index={1} label="Under 2.5" /></>}
                {open(mgg) && <><OddsButton compact market={mgg} index={0} label="GG" /><OddsButton compact market={mgg} index={1} label="NG" /></>}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-3.5">
          <MatchStatus r={r} />
          <span className="text-[11px]" style={{ color: 'var(--subtle)' }}>{lines} betting line{lines === 1 ? '' : 's'}</span>
        </div>
      </div>
    </Link>
  )
}
