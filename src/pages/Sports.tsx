import { useEffect, useMemo, useState } from 'react'
import { Trophy, CalendarDays, Flag, Layers } from 'lucide-react'
import { useAllMarkets } from '../hooks/useMarkets'
import { useSportsRegistry, pingSportsKeeper } from '../lib/sports'
import { useSiteConfig } from '../lib/adminConfig'
import type { Market } from '../lib/contract'
import type { SportsRecord } from '../lib/sportsCore'
import MatchCard, { isDone } from '../components/sports/MatchCard'

export default function Sports() {
  const cfg = useSiteConfig()
  const { records, error } = useSportsRegistry()
  const { data } = useAllMarkets()
  const byId = useMemo(() => new Map(((data as unknown as Market[] | undefined) ?? []).map(m => [m.id.toString(), m])), [data])
  const [tab, setTab] = useState<'upcoming' | 'results'>('upcoming')
  const [league, setLeague] = useState('all')
  const [day, setDay] = useState('all')

  useEffect(() => { if (cfg.sportsAutoSettle !== false) pingSportsKeeper() }, [cfg.sportsAutoSettle, records?.length])

  if (cfg.sportsEnabled === false) return <div className="max-w-md mx-auto px-4 py-24 text-center" style={{ color: 'var(--muted)' }}>Sports betting is switched off. Check back soon.</div>

  const all = records ?? []
  const pool = all.filter(r => (tab === 'results' ? isDone(r) : !isDone(r)))
  const leagues = [...pool.reduce((m, r) => m.set(r.league, { name: r.leagueName, n: (m.get(r.league)?.n ?? 0) + 1 }), new Map<string, { name: string; n: number }>())]
  const dayKey = (r: SportsRecord) => new Date(r.kickoff).toISOString().slice(0, 10)
  const inLeague = pool.filter(r => league === 'all' || r.league === league)
  const days = [...new Set(inLeague.map(dayKey))].sort((a, b) => (tab === 'results' ? b.localeCompare(a) : a.localeCompare(b)))
  const list = inLeague.filter(r => day === 'all' || dayKey(r) === day).sort((a, b) => (tab === 'results' ? b.kickoff - a.kickoff : a.kickoff - b.kickoff))
  const groups = new Map<string, SportsRecord[]>()
  for (const r of list) groups.set(dayKey(r), [...(groups.get(dayKey(r)) ?? []), r])
  const label = (d: string, long = false) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', long ? { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' } : { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const totalLines = all.reduce((n, r) => n + Object.keys(r.markets).length, 0)

  const chip = (on: boolean) => ({ background: on ? 'var(--accent)' : 'var(--surface)', color: on ? 'var(--accent-text)' : 'var(--muted)', border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border)') })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 mb-6" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, var(--surface)) 0%, var(--surface) 65%)', border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)' }}>
        <Trophy size={190} className="absolute -right-6 -bottom-10 rotate-12 pointer-events-none" style={{ color: 'var(--accent)', opacity: .07 }} />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-widest uppercase px-2.5 py-1 rounded-full mb-3" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><Trophy size={12} />Soccer</span>
            <h1 className="display text-3xl sm:text-4xl font-700 text-balance">Bet on every match</h1>
            <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>1X2, double chance, over/under, GG/NG and more. Odds move with the crowd and every bet is settled automatically from the final score.</p>
          </div>
          <div className="flex gap-3">
            {[[Layers, 'Betting lines', totalLines], [CalendarDays, 'Upcoming', all.filter(r => !isDone(r)).length], [Flag, 'Leagues', new Set(all.map(r => r.league)).size]].map(([Icon, l, v]) => {
              const I = Icon as typeof Layers
              return (
                <div key={String(l)} className="rounded-2xl px-4 py-3 min-w-24" style={{ background: 'color-mix(in srgb, var(--surface) 80%, transparent)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--subtle)' }}><I size={12} />{String(l)}</div>
                  <div className="display text-2xl font-700 tabular-nums">{String(v)}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {(['upcoming', 'results'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setLeague('all'); setDay('all') }} className="px-4 py-1.5 rounded-full text-sm font-semibold capitalize theme-transition" style={chip(tab === t)}>{t}</button>
        ))}
      </div>
      {leagues.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
          <button onClick={() => { setLeague('all'); setDay('all') }} className="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap" style={chip(league === 'all')}>All leagues <span style={{ opacity: .6 }}>{pool.length}</span></button>
          {leagues.map(([id, l]) => (
            <button key={id} onClick={() => { setLeague(id); setDay('all') }} className="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap" style={chip(league === id)}>{l.name} <span style={{ opacity: .6 }}>{l.n}</span></button>
          ))}
        </div>
      )}
      {days.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
          <button onClick={() => setDay('all')} className="px-3 py-1 rounded-lg text-xs whitespace-nowrap" style={chip(day === 'all')}>Any day</button>
          {days.map(d => <button key={d} onClick={() => setDay(d)} className="px-3 py-1 rounded-lg text-xs whitespace-nowrap" style={chip(day === d)}>{label(d)}</button>)}
        </div>
      )}

      {records === null && !error && <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-56 rounded-2xl skeleton" />)}</div>}
      {error && <p className="py-8 text-center text-sm" style={{ color: 'var(--warning)' }}>{error}</p>}
      {records && list.length === 0 && (
        <div className="text-center py-20">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}><Trophy size={24} style={{ color: 'var(--subtle)' }} /></div>
          <p className="font-medium" style={{ color: 'var(--muted)' }}>{tab === 'upcoming' ? 'No upcoming matches' : 'No finished matches yet'}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>{tab === 'upcoming' ? 'Matches added by the admin will appear here.' : 'Results show up here once matches are settled.'}</p>
        </div>
      )}

      <div className="space-y-7">
        {[...groups.entries()].map(([d, rs]) => (
          <section key={d}>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>{label(d, true)}</h2>
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>{rs.length} match{rs.length === 1 ? '' : 'es'}</span>
              <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {rs.map(r => <MatchCard key={r.eventId} r={r} byId={byId} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
