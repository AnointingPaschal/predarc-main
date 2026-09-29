import { useState, useMemo } from 'react'
import { Search, TrendingUp, Zap, BarChart2, Activity } from 'lucide-react'
import MarketCard from '../components/MarketCard'
import BtcPromo from '../components/BtcPromo'
import { useAllMarkets } from '../hooks/useMarkets'
import { Market, MarketStatus, MarketType, CATEGORIES, formatUsdc } from '../lib/contract'

const STATUS_FILTERS = ['All', 'Open', 'Resolved', 'Closed', 'Cancelled']
const TYPE_FILTERS = [
  { label: 'All', value: 'All' },
  { label: 'Binary', value: 'Binary' },
  { label: 'Multiple', value: 'Multiple' },
  { label: 'Scalar', value: 'Scalar' },
]

export default function MarketList() {
  const { data: markets, isLoading } = useAllMarkets()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [status, setStatus] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')

  const allMarkets = (markets as unknown as Market[] | undefined) ?? []

  const stats = useMemo(() => {
    const open = allMarkets.filter(m => m.status === MarketStatus.Open)
    const totalLiquidity = allMarkets.reduce((a, m) => a + m.totalLiquidity, 0n)
    return {
      total: allMarkets.length,
      open: open.length,
      liquidity: formatUsdc(totalLiquidity),
    }
  }, [allMarkets])

  const filtered = useMemo(() => {
    return allMarkets.filter(market => {
      if (search && !market.question.toLowerCase().includes(search.toLowerCase())) return false
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

  const featured = useMemo(() => allMarkets.filter(m => m.featured), [allMarkets])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

      {/* Hero */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span
            className="text-xs font-semibold tracking-widest uppercase px-2 py-1 rounded-lg"
            style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
          >
            Live on Arc
          </span>
        </div>
        <h1 className="display text-3xl sm:text-4xl font-700 mb-2 text-balance" style={{ color: 'var(--ink)' }}>
          Predict the Future.
        </h1>
        <p className="text-sm max-w-xl text-pretty" style={{ color: 'var(--muted)' }}>
          Trade outcome shares with USDC. Markets resolve automatically or via admin — transparent, onchain, instant.
        </p>
      </div>

      <BtcPromo />

      {/* Stats bar */}
      {!isLoading && allMarkets.length > 0 && (
        <div
          className="grid grid-cols-3 gap-3 mb-8 rounded-2xl p-4 theme-transition"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)' }}
        >
          <StatItem icon={<BarChart2 size={14} />} label="Total Markets" value={stats.total.toString()} />
          <StatItem icon={<Activity size={14} />} label="Open Markets" value={stats.open.toString()} accent />
          <StatItem icon={<TrendingUp size={14} />} label="Total Liquidity" value={`$${stats.liquidity}`} />
        </div>
      )}

      {/* Featured */}
      {featured.length > 0 && !isLoading && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={13} style={{ color: 'var(--accent)' }} />
            <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--accent)' }}>
              Featured Markets
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featured.slice(0, 3).map(m => <MarketCard key={m.id.toString()} market={m} featured />)}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="space-y-3 mb-6">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--subtle)' }} />
          <input
            type="text"
            placeholder="Search markets…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm theme-transition"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--ink)',
            }}
          />
        </div>

        {/* Status + Type row */}
        <div className="flex flex-wrap gap-2">
          <FilterGroup
            options={STATUS_FILTERS}
            value={status}
            onChange={setStatus}
          />
          <div className="w-px self-stretch" style={{ background: 'var(--border)' }} />
          <FilterGroup
            options={TYPE_FILTERS.map(t => t.label)}
            value={typeFilter}
            onChange={setTypeFilter}
          />
        </div>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className="px-3 py-1 rounded-full text-xs font-medium theme-transition"
            style={{
              background: category === c ? 'var(--accent)' : 'var(--surface)',
              color: category === c ? 'var(--accent-text)' : 'var(--muted)',
              border: '1px solid ' + (category === c ? 'var(--accent)' : 'var(--border)'),
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Markets grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-56 rounded-2xl skeleton" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div
            className="mx-auto mb-4 h-14 w-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <TrendingUp size={24} style={{ color: 'var(--subtle)' }} />
          </div>
          <p className="font-medium" style={{ color: 'var(--muted)' }}>No markets found</p>
          {search && (
            <p className="text-sm mt-1" style={{ color: 'var(--subtle)' }}>
              No results for "{search}"
            </p>
          )}
          <p className="text-xs mt-2" style={{ color: 'var(--subtle)' }}>
            {allMarkets.length === 0 ? 'Markets created by the admin will appear here.' : 'Try different filters.'}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>
              {filtered.length} market{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(m => <MarketCard key={m.id.toString()} market={m} />)}
          </div>
        </>
      )}
    </div>
  )
}

function StatItem({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5" style={{ color: 'var(--subtle)' }}>
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <span
        className="display text-xl font-700 num"
        style={{ color: accent ? 'var(--accent)' : 'var(--ink)' }}
      >
        {value}
      </span>
    </div>
  )
}

function FilterGroup({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div
      className="flex rounded-xl overflow-hidden theme-transition"
      style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
    >
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className="px-3 py-1.5 text-xs font-medium theme-transition"
          style={{
            color: value === opt ? 'var(--accent-text)' : 'var(--muted)',
            background: value === opt ? 'var(--accent)' : 'transparent',
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}
