import { useState, useMemo } from 'react'
import { Search, Filter, TrendingUp, Zap } from 'lucide-react'
import MarketCard from '../components/MarketCard'
import { useAllMarkets } from '../hooks/useMarkets'
import { Market, MarketStatus, MarketType, CATEGORIES } from '../lib/contract'

const STATUS_FILTERS = ['All', 'Open', 'Resolved', 'Closed']

export default function MarketList() {
  const { data: markets, isLoading } = useAllMarkets()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [status, setStatus] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')

  const filtered = useMemo(() => {
    if (!markets) return []
    const m = markets as unknown as Market[]
    return m.filter(market => {
      if (search && !market.question.toLowerCase().includes(search.toLowerCase())) return false
      if (category !== 'All' && market.category !== category) return false
      if (status === 'Open' && market.status !== MarketStatus.Open) return false
      if (status === 'Resolved' && market.status !== MarketStatus.Resolved) return false
      if (status === 'Closed' && market.status !== MarketStatus.Closed) return false
      if (typeFilter === 'Binary' && market.marketType !== MarketType.Binary) return false
      if (typeFilter === 'Multiple' && market.marketType !== MarketType.MultipleChoice) return false
      if (typeFilter === 'Scalar' && market.marketType !== MarketType.Scalar) return false
      return true
    }).reverse()
  }, [markets, search, category, status, typeFilter])

  const featured = useMemo(() => (markets as Market[] | undefined)?.filter(m => m.featured) ?? [], [markets])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Hero */}
      <div className="mb-8">
        <h1 className="display text-3xl sm:text-4xl font-700 mb-2" style={{ color: 'var(--ink)' }}>
          Prediction Markets
        </h1>
        <p className="text-sm" style={{ color: 'var(--subtle)' }}>
          Trade on real-world outcomes. Powered by USDC on Arc.
        </p>
      </div>

      {/* Featured */}
      {featured.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>Featured Markets</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featured.slice(0, 3).map(m => <MarketCard key={m.id.toString()} market={m} />)}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--subtle)' }} />
          <input
            type="text"
            placeholder="Search markets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
          />
        </div>

        {/* Status */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className="px-3 py-2 text-xs font-medium transition-colors"
              style={{
                color: status === s ? '#0d1b2f' : 'var(--muted)',
                background: status === s ? 'var(--accent)' : 'transparent',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Type */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
          {['All', 'Binary', 'Multiple', 'Scalar'].map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className="px-3 py-2 text-xs font-medium transition-colors"
              style={{
                color: typeFilter === t ? '#0d1b2f' : 'var(--muted)',
                background: typeFilter === t ? 'var(--accent)' : 'transparent',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
            style={{
              background: category === c ? 'var(--accent)' : 'var(--surface)',
              color: category === c ? '#0d1b2f' : 'var(--muted)',
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
            <div key={i} className="h-48 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <TrendingUp size={32} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--muted)' }} />
          <p style={{ color: 'var(--muted)' }}>No markets found.</p>
          {search && <p className="text-sm mt-1" style={{ color: 'var(--subtle)' }}>Try a different search term.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(m => <MarketCard key={m.id.toString()} market={m} />)}
        </div>
      )}
    </div>
  )
}
