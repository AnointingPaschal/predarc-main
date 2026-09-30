import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, ChevronRight } from 'lucide-react'
import { useAllMarkets } from '../hooks/useMarkets'
import { useSportsRegistry, pingSportsKeeper } from '../lib/sports'
import { useSiteConfig } from '../lib/adminConfig'
import type { Market } from '../lib/contract'
import type { SportsRecord } from '../lib/sportsCore'
import { OddsButton, TeamLogo, fmtKick } from '../components/sports/parts'

export default function Sports() {
  const cfg = useSiteConfig()
  const { records, error } = useSportsRegistry()
  const { data } = useAllMarkets()
  const byId = useMemo(() => new Map(((data as unknown as Market[] | undefined) ?? []).map(m => [m.id.toString(), m])), [data])
  const [tab, setTab] = useState<'upcoming' | 'results'>('upcoming')
  const [league, setLeague] = useState('all')

  // Keep settlement moving while people are on the page
  useEffect(() => { if (cfg.sportsAutoSettle !== false) pingSportsKeeper() }, [cfg.sportsAutoSettle, records?.length])

  if (cfg.sportsEnabled === false) return <div className="max-w-md mx-auto px-4 py-24 text-center" style={{ color: 'var(--muted)' }}>Sports betting is switched off. Check back soon.</div>

  const all = records ?? []
  const isDone = (r: SportsRecord) => Object.values(r.markets).every(id => r.settled[id])
  const list = all.filter(r => (tab === 'results' ? isDone(r) : !isDone(r)) && (league === 'all' || r.league === league))
    .sort((a, b) => (tab === 'results' ? b.kickoff - a.kickoff : a.kickoff - b.kickoff))
  const leagues = [...new Map(all.map(r => [r.league, r.leagueName])).entries()]
  const groups = new Map<string, SportsRecord[]>()
  for (const r of list) { const k = new Date(r.kickoff).toISOString().slice(0, 10); groups.set(k, [...(groups.get(k) ?? []), r]) }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}><Trophy size={20} /></div>
        <div>
          <h1 className="display text-2xl font-700">Soccer</h1>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>1X2, double chance, over/under, GG/NG and more. Settled automatically from the final score.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {(['upcoming', 'results'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className="px-4 py-1.5 rounded-full text-sm font-medium capitalize"
            style={{ background: tab === t ? 'var(--accent)' : 'var(--surface)', color: tab === t ? 'var(--accent-text)' : 'var(--muted)', border: '1px solid var(--border)' }}>{t}</button>
        ))}
        <span className="mx-1 h-5 w-px" style={{ background: 'var(--border)' }} />
        <select value={league} onChange={e => setLeague(e.target.value)} className="px-3 py-1.5 rounded-full text-sm outline-none" style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
          <option value="all">All leagues</option>
          {leagues.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>

      {records === null && !error && <p className="py-16 text-center text-sm" style={{ color: 'var(--subtle)' }}>Loading matches…</p>}
      {error && <p className="py-8 text-center text-sm" style={{ color: 'var(--warning)' }}>{error}</p>}
      {records && list.length === 0 && (
        <p className="py-16 text-center text-sm" style={{ color: 'var(--subtle)' }}>{tab === 'upcoming' ? 'No upcoming matches yet. The admin generates fixtures from the Sports tab.' : 'No finished matches yet.'}</p>
      )}

      <div className="space-y-6">
        {[...groups.entries()].map(([day, rs]) => (
          <section key={day}>
            <h2 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--subtle)' }}>
              {new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
            </h2>
            <div className="grid lg:grid-cols-2 gap-3">
              {rs.map(r => <MatchRow key={r.eventId} r={r} byId={byId} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function MatchRow({ r, byId }: { r: SportsRecord; byId: Map<string, Market> }) {
  const m1 = byId.get(r.markets['1x2'] ?? '')
  const mou = byId.get(r.markets['ou_2.5'] ?? ''), mgg = byId.get(r.markets['btts'] ?? '')
  const started = Date.now() >= r.kickoff
  const done = Object.values(r.markets).every(id => r.settled[id])
  const lines = Object.keys(r.markets).length
  return (
    <Link to={`/sports/${r.eventId}`} className="block rounded-2xl p-3 theme-transition hover:brightness-110" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between text-[11px] mb-2" style={{ color: 'var(--subtle)' }}>
        <span className="truncate">{r.leagueName}</span>
        <span className="tabular-nums shrink-0 ml-2">
          {done ? 'Full time' : started ? <b style={{ color: 'var(--warning)' }}>Betting closed · awaiting result</b> : fmtKick(r.kickoff)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          {[r.home, r.away].map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <TeamLogo team={t} size={22} />
              <span className="text-sm font-medium truncate flex-1">{t.name}</span>
              {r.result && <span className="font-bold tabular-nums">{i === 0 ? r.result.home : r.result.away}</span>}
            </div>
          ))}
        </div>
        {!done && (
          <div className="grid grid-cols-3 gap-1.5 w-48 shrink-0">
            <OddsButton compact market={m1} index={0} label="1" />
            <OddsButton compact market={m1} index={1} label="X" />
            <OddsButton compact market={m1} index={2} label="2" />
            {mou && <OddsButton compact market={mou} index={0} label="O 2.5" />}
            {mou && <OddsButton compact market={mou} index={1} label="U 2.5" />}
            {mgg && <OddsButton compact market={mgg} index={0} label="GG" />}
          </div>
        )}
        <ChevronRight size={16} style={{ color: 'var(--subtle)' }} />
      </div>
      <p className="text-[11px] mt-2" style={{ color: 'var(--subtle)' }}>{lines} betting lines</p>
    </Link>
  )
}
