import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Search, TrendingUp, Zap, BarChart2, Activity, Trophy, LayoutGrid, Bitcoin, Landmark, Clapperboard, FlaskConical, Banknote, Shapes, ArrowRight, X } from 'lucide-react'
import MarketCard from '../components/MarketCard'
import HeroPredictions from '../components/HeroPredictions'
import MatchCard, { isDone } from '../components/sports/MatchCard'
import { BtcCard } from '../components/BtcPromo'
import { useAllMarkets } from '../hooks/useMarkets'
import { useSportsRegistry, pingSportsKeeper } from '../lib/sports'
import { useSiteConfig } from '../lib/adminConfig'
import type { SportsRecord } from '../lib/sportsCore'
import { Market, MarketStatus, MarketType, CATEGORIES, formatUsdc } from '../lib/contract'

const STATUS_FILTERS = ['All', 'Open', 'Resolved', 'Closed', 'Cancelled']
const TYPE_FILTERS = ['All', 'Binary', 'Multiple', 'Scalar']
const CAT_ICON: Record<string, React.ReactNode> = {
  All: <LayoutGrid size={13} />, Crypto: <Bitcoin size={13} />, Sports: <Trophy size={13} />, Politics: <Landmark size={13} />,
  Entertainment: <Clapperboard size={13} />, Science: <FlaskConical size={13} />, Finance: <Banknote size={13} />, Other: <Shapes size={13} />,
}

type Item = { kind: 'market'; m: Market } | { kind: 'match'; r: SportsRecord }

export default function MarketList() {
  const cfg = useSiteConfig()
  const { data: markets, isLoading } = useAllMarkets()
  const { records } = useSportsRegistry(90_000)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [status, setStatus] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')

  const allMarkets = (markets as unknown as Market[] | undefined) ?? []
  const byId = useMemo(() => new Map(allMarkets.map(m => [m.id.toString(), m])), [allMarkets])
  const images = useMemo(() => Object.fromEntries(allMarkets.map(m => [m.id.toString(), m.imageUrl && !m.imageUrl.startsWith('data:') ? m.imageUrl : ''])), [allMarkets])
  const sportsOn = cfg.sportsEnabled !== false
  useEffect(() => { if (sportsOn && cfg.sportsAutoSettle !== false && records?.length) pingSportsKeeper() }, [sportsOn, cfg.sportsAutoSettle, records?.length])

  const matches = useMemo(() => (sportsOn ? records ?? [] : []), [sportsOn, records])
  const upcoming = useMemo(() => matches.filter(r => !isDone(r) && r.kickoff > Date.now() - 3 * 3600e3).sort((a, b) => a.kickoff - b.kickoff), [matches])

  const stats = useMemo(() => {
    const open = allMarkets.filter(m => m.status === MarketStatus.Open && m.category !== 'Soccer')
    const totalLiquidity = allMarkets.reduce((a, m) => a + m.totalLiquidity, 0n)
    return { total: allMarkets.filter(m => m.category !== 'Soccer').length, open: open.length, liquidity: formatUsdc(totalLiquidity) }
  }, [allMarkets])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allMarkets.filter(market => {
      if (market.category === 'Soccer') return false // soccer lines are shown as match cards
      if (q && !market.question.toLowerCase().includes(q)) return false
      if (category !== 'All' && market.category !== category) return false
      if (status === 'Open' && market.status !== MarketStatus.Open) return false
      if (status === 'Resolved' && market.status !== MarketStatus.Resolved) return false
      if (status === 'Closed' && market.status !== MarketStatus.Closed) return false
      if (status === 'Cancelled' && market.status !== MarketStatus.Cancelled) return false
      if (typeFilter === 'Binary' && market.marketType !== MarketType.Binary) return false
      if (typeFilter === 'Multiple' && market.marketType !== MarketType.MultipleChoice) return false
      if (typeFilter === 'Scalar' && market.marketType !== MarketType.Scalar) return false
      return true
    }).slice().reverse()
  }, [allMarkets, search, category, status, typeFilter])

  // Matches obey the same filters (a match is a multiple-choice "1X2" market plus extra lines)
  const filteredMatches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (category !== 'All' && category !== 'Sports') return []
    if (typeFilter !== 'All' && typeFilter !== 'Multiple') return []
    return matches.filter(r => {
      if (q && !`${r.home.name} ${r.away.name} ${r.leagueName} soccer football`.toLowerCase().includes(q)) return false
      const done = isDone(r), started = Date.now() >= r.kickoff
      if (status === 'Open') return !done && !started
      if (status === 'Closed') return !done && started
      if (status === 'Resolved') return done && r.status !== 'cancelled'
      if (status === 'Cancelled') return r.status === 'cancelled'
      return !done || r.kickoff > Date.now() - 2 * 86400e3 // "All": upcoming plus the last couple of days of results
    }).sort((a, b) => (isDone(a) === isDone(b) ? a.kickoff - b.kickoff : isDone(a) ? 1 : -1))
  }, [matches, search, category, status, typeFilter])

  // Mix the matches in between the markets, evenly spread
  const items = useMemo<Item[]>(() => {
    const shownMatches = category === 'Sports' || search ? filteredMatches : filteredMatches.slice(0, Math.max(4, Math.ceil(filtered.length / 3)))
    const ms: Item[] = filtered.map(m => ({ kind: 'market', m }))
    if (!shownMatches.length) return ms
    if (category === 'Sports' && filtered.length === 0) return shownMatches.map(r => ({ kind: 'match', r }))
    const out: Item[] = []
    const step = Math.max(2, Math.floor((ms.length + 1) / (shownMatches.length + 1)))
    let mi = 0
    for (let i = 0; i < ms.length || mi < shownMatches.length; i++) {
      if (i < ms.length) out.push(ms[i])
      if ((i + 1) % step === 0 && mi < shownMatches.length) out.push({ kind: 'match', r: shownMatches[mi++] })
    }
    while (mi < shownMatches.length) out.push({ kind: 'match', r: shownMatches[mi++] })
    return out
  }, [filtered, filteredMatches, category, search])

  const featured = useMemo(() => allMarkets.filter(m => m.featured && m.category !== 'Soccer'), [allMarkets])
  const heroMarkets = useMemo(() => allMarkets.filter(m => m.category !== 'Soccer'), [allMarkets])
  const showStrip = sportsOn && upcoming.length > 0 && (category === 'All' || category === 'Sports') && !search
  const chip = (on: boolean) => ({ background: on ? 'var(--accent)' : 'var(--surface)', color: on ? 'var(--accent-text)' : 'var(--muted)', border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border)') })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <HeroPredictions markets={heroMarkets} images={images} />

      {/* Stats */}
      {!isLoading && allMarkets.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <StatItem icon={<BarChart2 size={15} />} label="Markets" value={stats.total.toString()} />
          <StatItem icon={<Activity size={15} />} label="Open now" value={stats.open.toString()} accent />
          <StatItem icon={<Trophy size={15} />} label="Matches to bet" value={upcoming.length.toString()} />
          <StatItem icon={<TrendingUp size={15} />} label="Total liquidity" value={`$${stats.liquidity}`} />
        </div>
      )}

      {/* Upcoming matches strip */}
      {showStrip && (
        <section className="mb-9">
          <div className="flex items-center justify-between mb-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--ink-2)' }}><Trophy size={15} style={{ color: 'var(--accent)' }} />Soccer · next matches</h2>
            <Link to="/sports" className="inline-flex items-center gap-1 text-xs font-semibold hover:opacity-80" style={{ color: 'var(--accent)' }}>All matches <ArrowRight size={12} /></Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1 snap-x">
            {upcoming.slice(0, 10).map(r => <div key={r.eventId} className="w-[300px] sm:w-[330px] shrink-0 snap-start"><MatchCard r={r} byId={byId} compact /></div>)}
          </div>
        </section>
      )}

      {/* Featured */}
      {featured.length > 0 && !isLoading && category === 'All' && !search && (
        <div className="mb-9">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>Featured markets</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featured.slice(0, 3).map(m => <MarketCard key={m.id.toString()} market={m} featured image={images[m.id.toString()]} />)}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="rounded-2xl p-3 sm:p-4 mb-6 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)' }}>
        <div className="relative">
          <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--subtle)' }} />
          <input type="text" placeholder="Search markets, teams, leagues…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 rounded-full text-sm theme-transition outline-none" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }} />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1" style={{ color: 'var(--subtle)' }}><X size={14} /></button>}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap theme-transition" style={chip(category === c)}>
              {CAT_ICON[c]}{c}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <FilterGroup label="Status" options={STATUS_FILTERS} value={status} onChange={setStatus} />
          <FilterGroup label="Type" options={TYPE_FILTERS} value={typeFilter} onChange={setTypeFilter} />
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-56 rounded-2xl skeleton" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}><TrendingUp size={24} style={{ color: 'var(--subtle)' }} /></div>
          <p className="font-medium" style={{ color: 'var(--muted)' }}>No markets found</p>
          {search && <p className="text-sm mt-1" style={{ color: 'var(--subtle)' }}>No results for "{search}"</p>}
          <p className="text-xs mt-2" style={{ color: 'var(--subtle)' }}>{allMarkets.length === 0 ? 'Markets created by the admin will appear here.' : 'Try different filters.'}</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>{category === 'All' ? 'All markets' : category}</h2>
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>{filtered.length} market{filtered.length !== 1 ? 's' : ''}{filteredMatches.length ? ` · ${filteredMatches.length} match${filteredMatches.length !== 1 ? 'es' : ''}` : ''}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {category === 'All' && !search && status === 'All' && typeFilter === 'All' && <BtcCard />}
            {items.map(it => it.kind === 'market'
              ? <MarketCard key={it.m.id.toString()} market={it.m} image={images[it.m.id.toString()]} />
              : <MatchCard key={`m${it.r.eventId}`} r={it.r} byId={byId} />)}
          </div>
        </>
      )}
    </div>
  )
}

function StatItem({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl p-4 theme-transition" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)' }}>
      <span className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: accent ? 'var(--accent)' : 'var(--accent-bg)', color: accent ? 'var(--accent-text)' : 'var(--accent)' }}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px]" style={{ color: 'var(--subtle)' }}>{label}</div>
        <div className="display text-xl font-700 num truncate" style={{ color: 'var(--ink)' }}>{value}</div>
      </div>
    </div>
  )
}

function FilterGroup({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>{label}</span>
      <div className="flex rounded-full overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
        {options.map(opt => (
          <button key={opt} onClick={() => onChange(opt)} className="px-3 py-1 text-xs font-medium theme-transition"
            style={{ color: value === opt ? 'var(--accent-text)' : 'var(--muted)', background: value === opt ? 'var(--accent)' : 'transparent' }}>{opt}</button>
        ))}
      </div>
    </div>
  )
}
