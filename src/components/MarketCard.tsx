import { Link } from 'react-router-dom'
import { Clock, TrendingUp, Users } from 'lucide-react'
import { Market, MarketStatus, MarketType, getOddsDisplay, statusColor, statusLabel, timeUntil, formatUsdc } from '../lib/contract'

interface MarketCardProps {
  market: Market
}

export default function MarketCard({ market }: MarketCardProps) {
  const isOpen = market.status === MarketStatus.Open
  const isResolved = market.status === MarketStatus.Resolved

  return (
    <Link
      to={`/market/${market.id}`}
      className="block rounded-xl p-4 transition-all hover:scale-[1.01]"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--surface-strong)', color: 'var(--muted)' }}>
            {market.category || 'General'}
          </span>
          {market.featured && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(172,198,233,0.15)', color: 'var(--accent)' }}>
              Featured
            </span>
          )}
          <span className={`text-xs font-medium ${statusColor(market.status)}`}>
            {statusLabel(market.status)}
          </span>
        </div>
        <span className="text-xs flex items-center gap-1 flex-shrink-0" style={{ color: 'var(--subtle)' }}>
          <Clock size={11} />
          {timeUntil(market.endTime)}
        </span>
      </div>

      {/* Question */}
      <p className="text-sm font-medium leading-snug mb-4 text-balance" style={{ color: 'var(--ink-2)' }}>
        {market.question}
      </p>

      {/* Outcomes / Odds */}
      {market.marketType === MarketType.Scalar ? (
        <ScalarPreview market={market} />
      ) : (
        <OutcomesPreview market={market} />
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <span className="text-xs flex items-center gap-1" style={{ color: 'var(--subtle)' }}>
          <TrendingUp size={11} />
          ${formatUsdc(market.totalLiquidity)} pool
        </span>
        <span className="text-xs" style={{ color: 'var(--subtle)' }}>
          {market.marketType === MarketType.Binary ? 'Binary' : market.marketType === MarketType.MultipleChoice ? 'Multiple' : 'Scalar'}
        </span>
      </div>
    </Link>
  )
}

function OutcomesPreview({ market }: { market: Market }) {
  const showMax = 4
  const show = market.outcomes.slice(0, showMax)
  const total = market.outcomePools.reduce((a, b) => a + b, 0n)

  return (
    <div className="space-y-1.5">
      {show.map((outcome, i) => {
        const pool = market.outcomePools[i] ?? 0n
        const pct = total > 0n ? (Number(pool) / Number(total)) * 100 : 0
        const isWinner = market.status === MarketStatus.Resolved && market.resolvedOutcome === BigInt(i)
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-strong)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: isWinner ? 'var(--success)' : 'var(--accent)',
                }}
              />
            </div>
            <span className="text-xs w-10 text-right tabular-nums" style={{ color: isWinner ? 'var(--success)' : 'var(--muted)' }}>
              {pct.toFixed(0)}%
            </span>
            <span className="text-xs w-20 truncate" style={{ color: 'var(--subtle)' }}>{outcome}</span>
          </div>
        )
      })}
      {market.outcomes.length > showMax && (
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>+{market.outcomes.length - showMax} more options</p>
      )}
    </div>
  )
}

function ScalarPreview({ market }: { market: Market }) {
  const isResolved = market.status === MarketStatus.Resolved
  return (
    <div className="rounded-lg p-2.5" style={{ background: 'var(--surface-strong)' }}>
      <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--subtle)' }}>
        <span>{market.scalarLow.toString()}</span>
        <span>{market.scalarHigh.toString()}</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: 'var(--surface-muted)' }}>
        {isResolved && (
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(2, Math.min(98, (Number(market.resolvedScalarValue - market.scalarLow) / Number(market.scalarHigh - market.scalarLow)) * 100))}%`,
              background: 'var(--success)',
            }}
          />
        )}
      </div>
      {isResolved && (
        <p className="text-xs mt-1 text-center tabular-nums" style={{ color: 'var(--success)' }}>
          Resolved: {market.resolvedScalarValue.toString()}
        </p>
      )}
    </div>
  )
}
