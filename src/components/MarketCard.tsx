import { Link } from 'react-router-dom'
import { Clock, TrendingUp, ArrowUpRight, CheckCircle2, XCircle, Minus } from 'lucide-react'
import { Market, MarketStatus, MarketType, timeUntil, formatUsdc } from '../lib/contract'

interface MarketCardProps {
  market: Market
  featured?: boolean
}

const TYPE_LABELS: Record<number, string> = { 0: 'Binary', 1: 'Multiple', 2: 'Scalar' }

const CATEGORY_COLORS: Record<string, string> = {
  Crypto: 'var(--accent)',
  Sports: 'var(--success)',
  Politics: 'var(--warning)',
  Entertainment: '#a78bfa',
  Science: '#22d3ee',
  Finance: 'var(--accent)',
  Other: 'var(--muted)',
}

export default function MarketCard({ market, featured: _featured }: MarketCardProps) {
  const isOpen = market.status === MarketStatus.Open
  const isResolved = market.status === MarketStatus.Resolved
  const isCancelled = market.status === MarketStatus.Cancelled
  const catColor = CATEGORY_COLORS[market.category] ?? 'var(--muted)'

  return (
    <Link
      to={`/market/${market.id}`}
      className="group block rounded-2xl overflow-hidden theme-transition"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--card-shadow)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      {/* Top accent bar — color by category */}
      <div className="h-0.5 w-full" style={{ background: catColor, opacity: 0.7 }} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Category */}
            <span
              className="pill theme-transition"
              style={{ background: `color-mix(in srgb, ${catColor} 12%, transparent)`, color: catColor }}
            >
              {market.category || 'General'}
            </span>
            {/* Type */}
            <span
              className="pill theme-transition"
              style={{ background: 'var(--surface-strong)', color: 'var(--subtle)' }}
            >
              {TYPE_LABELS[market.marketType] ?? 'Market'}
            </span>
            {/* Status */}
            <StatusBadge status={market.status} />
          </div>

          {/* Arrow on hover */}
          <ArrowUpRight
            size={14}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: 'var(--accent)', marginTop: 2 }}
          />
        </div>

        {/* Time */}
        <div className="flex items-center gap-1 mb-2.5" style={{ color: 'var(--subtle)' }}>
          <Clock size={11} strokeWidth={2} />
          <span className="text-xs num">
            {isResolved ? 'Resolved' : isCancelled ? 'Cancelled' : timeUntil(market.endTime)}
          </span>
        </div>

        {/* Question */}
        <p
          className="text-sm font-medium leading-snug mb-4 text-pretty line-clamp-3"
          style={{ color: 'var(--ink-2)' }}
        >
          {market.question}
        </p>

        {/* Outcomes */}
        {market.marketType === MarketType.Scalar ? (
          <ScalarPreview market={market} />
        ) : (
          <OutcomesPreview market={market} />
        )}

        {/* Footer */}
        <div
          className="flex items-center justify-between mt-3 pt-3 theme-transition"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <span className="flex items-center gap-1 text-xs num" style={{ color: 'var(--subtle)' }}>
            <TrendingUp size={11} strokeWidth={2} />
            <span style={{ color: 'var(--muted)', fontWeight: 500 }}>${formatUsdc(market.totalLiquidity)}</span>
            <span>pool</span>
          </span>
          {isOpen && (
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-lg"
              style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
            >
              Trade
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

function StatusBadge({ status }: { status: MarketStatus }) {
  const styles: Record<MarketStatus, { bg: string; color: string; icon: React.ReactNode; label: string }> = {
    [MarketStatus.Open]: { bg: 'var(--success-bg)', color: 'var(--success)', icon: <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" />, label: 'Open' },
    [MarketStatus.Closed]: { bg: 'var(--warning-bg)', color: 'var(--warning)', icon: <Minus size={9} strokeWidth={3} />, label: 'Closed' },
    [MarketStatus.Resolved]: { bg: 'var(--success-bg)', color: 'var(--success)', icon: <CheckCircle2 size={9} strokeWidth={2.5} />, label: 'Resolved' },
    [MarketStatus.Cancelled]: { bg: 'var(--danger-bg)', color: 'var(--danger)', icon: <XCircle size={9} strokeWidth={2.5} />, label: 'Cancelled' },
  }
  const s = styles[status]
  return (
    <span
      className="pill flex items-center gap-1"
      style={{ background: s.bg, color: s.color }}
    >
      {s.icon}
      {s.label}
    </span>
  )
}

function OutcomesPreview({ market }: { market: Market }) {
  const showMax = market.marketType === MarketType.Binary ? 2 : 3
  const show = market.outcomes.slice(0, showMax)
  const total = market.outcomePools.reduce((a, b) => a + b, 0n)

  return (
    <div className="space-y-2">
      {show.map((outcome, i) => {
        const pool = market.outcomePools[i] ?? 0n
        const pct = total > 0n ? (Number(pool) / Number(total)) * 100 : 0
        const isWinner = market.status === MarketStatus.Resolved && market.resolvedOutcome === BigInt(i)
        const barColor = isWinner ? 'var(--success)' : i === 0 ? 'var(--accent)' : 'var(--muted)'
        return (
          <div key={i}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium truncate max-w-[120px]" style={{ color: isWinner ? 'var(--success)' : 'var(--ink-2)' }}>
                {outcome}
              </span>
              <span className="text-xs font-semibold num ml-2" style={{ color: isWinner ? 'var(--success)' : 'var(--muted)' }}>
                {pct.toFixed(1)}%
              </span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${pct}%`, background: barColor }}
              />
            </div>
          </div>
        )
      })}
      {market.outcomes.length > showMax && (
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>
          +{market.outcomes.length - showMax} more options
        </p>
      )}
    </div>
  )
}

function ScalarPreview({ market }: { market: Market }) {
  const isResolved = market.status === MarketStatus.Resolved
  const pct = isResolved
    ? Math.max(2, Math.min(98, (Number(market.resolvedScalarValue - market.scalarLow) / Number(market.scalarHigh - market.scalarLow)) * 100))
    : 50

  return (
    <div
      className="rounded-xl p-3 theme-transition"
      style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
    >
      <div className="flex justify-between text-xs num mb-2" style={{ color: 'var(--subtle)' }}>
        <span>{market.scalarLow.toString()}</span>
        <span style={{ color: 'var(--muted)', fontSize: 10, letterSpacing: '0.05em' }}>RANGE</span>
        <span>{market.scalarHigh.toString()}</span>
      </div>
      <div className="relative h-1.5 rounded-full" style={{ background: 'var(--surface-strong)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${isResolved ? pct : 50}%`, background: isResolved ? 'var(--success)' : 'var(--accent)', opacity: isResolved ? 1 : 0.4 }}
        />
        {isResolved && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2"
            style={{ left: `${pct}%`, borderColor: 'var(--bg)', background: 'var(--success)' }}
          />
        )}
      </div>
      {isResolved && (
        <p className="text-xs text-center mt-2 num font-semibold" style={{ color: 'var(--success)' }}>
          Resolved: {market.resolvedScalarValue.toString()}
        </p>
      )}
    </div>
  )
}
