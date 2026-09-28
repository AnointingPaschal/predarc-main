import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Clock, TrendingUp, CheckCircle, ExternalLink } from 'lucide-react'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import { useMarket } from '../hooks/useMarkets'
import { useRedeemWinnings } from '../hooks/useEscrow'
import TradingPanel from '../components/TradingPanel'
import {
  Market, MarketStatus, MarketType,
  formatUsdc, statusColor, statusLabel, timeUntil,
} from '../lib/contract'

export default function MarketDetail() {
  const { id } = useParams<{ id: string }>()
  const marketId = id ? BigInt(id) : undefined

  const { data: rawMarket, isLoading, refetch } = useMarket(marketId)
  const market = rawMarket as Market | undefined

  const { address } = useAccount()
  const redeem = useRedeemWinnings()

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="h-8 w-32 rounded animate-pulse mb-6" style={{ background: 'var(--surface)' }} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />
            ))}
          </div>
          <div className="h-64 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />
        </div>
      </div>
    )
  }

  if (!market) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <p style={{ color: 'var(--muted)' }}>Market not found.</p>
        <Link to="/" className="text-sm mt-2 block" style={{ color: 'var(--accent)' }}>Back to markets</Link>
      </div>
    )
  }

  const isResolved = market.status === MarketStatus.Resolved
  const isCancelled = market.status === MarketStatus.Cancelled
  const canRedeem = isResolved || isCancelled
  const total = market.outcomePools.reduce((a, b) => a + b, 0n)

  const handleRedeem = () => {
    if (!address) return toast.error('Connect wallet first.')
    redeem.redeem(market.id)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Back */}
      <Link to="/" className="flex items-center gap-2 text-sm mb-6 transition-opacity hover:opacity-80" style={{ color: 'var(--subtle)' }}>
        <ArrowLeft size={14} />
        All Markets
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left / Main */}
        <div className="lg:col-span-2 space-y-5">
          {/* Header card */}
          <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-strong)', color: 'var(--muted)' }}>
                {market.category || 'General'}
              </span>
              <span className={`text-xs font-medium ${statusColor(market.status)}`}>{statusLabel(market.status)}</span>
              <span className="text-xs flex items-center gap-1 ml-auto" style={{ color: 'var(--subtle)' }}>
                <Clock size={11} />
                {timeUntil(market.endTime)}
              </span>
            </div>

            <h1 className="display text-xl font-600 mb-4 text-balance" style={{ color: 'var(--ink)' }}>{market.question}</h1>

            <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--subtle)' }}>
              <span className="flex items-center gap-1">
                <TrendingUp size={11} />
                ${formatUsdc(market.totalLiquidity)} pool
              </span>
              <span>
                {market.marketType === MarketType.Binary ? 'Binary' : market.marketType === MarketType.MultipleChoice ? 'Multiple Choice' : 'Scalar'}
              </span>
            </div>
          </div>

          {/* Outcomes */}
          <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--ink-2)' }}>Outcomes</h2>
            {market.marketType === MarketType.Scalar ? (
              <ScalarView market={market} />
            ) : (
              <OutcomesView market={market} total={total} />
            )}
          </div>

          {/* Resolution */}
          {canRedeem && (
            <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-start gap-3">
                <CheckCircle size={18} style={{ color: isResolved ? 'var(--success)' : 'var(--danger)', flexShrink: 0 }} />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>
                    {isCancelled ? 'Market Cancelled' : 'Market Resolved'}
                  </h3>
                  {isResolved && market.marketType !== MarketType.Scalar && (
                    <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>
                      Winner: <strong style={{ color: 'var(--success)' }}>{market.outcomes[Number(market.resolvedOutcome)]}</strong>
                    </p>
                  )}
                  {isResolved && market.marketType === MarketType.Scalar && (
                    <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>
                      Resolved value: <strong style={{ color: 'var(--success)' }} className="tabular-nums">{market.resolvedScalarValue.toString()}</strong>
                    </p>
                  )}
                  {isCancelled && (
                    <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>Your USDC has been refunded.</p>
                  )}
                  <button
                    onClick={handleRedeem}
                    disabled={redeem.isPending || redeem.isConfirming}
                    className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                    style={{ background: 'var(--success)', color: '#0d1b2f' }}
                  >
                    {redeem.isPending || redeem.isConfirming ? 'Claiming...' : 'Claim Winnings'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right / Trading */}
        <div className="space-y-4">
          <TradingPanel market={market} onSuccess={() => { void refetch() }} />

          {/* Market info */}
          <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>Market Info</h3>
            <InfoRow label="Trading ends" value={new Date(Number(market.endTime) * 1000).toLocaleDateString()} />
            <InfoRow label="Resolution" value={new Date(Number(market.resolutionTime) * 1000).toLocaleDateString()} />
            <InfoRow label="Pool" value={`$${formatUsdc(market.totalLiquidity)}`} />
            <InfoRow label="Fees collected" value={`$${formatUsdc(market.feesCollected)}`} />
            <a
              href={`https://explorer.testnet.arc.io/address/${market.creator}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
              style={{ color: 'var(--accent)' }}
            >
              View creator <ExternalLink size={10} />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

function OutcomesView({ market, total }: { market: Market; total: bigint }) {
  return (
    <div className="space-y-3">
      {market.outcomes.map((outcome, i) => {
        const pool = market.outcomePools[i] ?? 0n
        const pct = total > 0n ? (Number(pool) / Number(total)) * 100 : 0
        const isWinner = market.status === MarketStatus.Resolved && market.resolvedOutcome === BigInt(i)
        return (
          <div key={i}>
            <div className="flex justify-between text-sm mb-1.5">
              <span style={{ color: isWinner ? 'var(--success)' : 'var(--ink-2)' }}>
                {isWinner && '✓ '}{outcome}
              </span>
              <span className="tabular-nums font-semibold" style={{ color: isWinner ? 'var(--success)' : 'var(--accent)' }}>
                {pct.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: isWinner ? 'var(--success)' : 'var(--accent)',
                  opacity: isWinner ? 1 : 0.7,
                }}
              />
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
              Pool: ${formatUsdc(pool)}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function ScalarView({ market }: { market: Market }) {
  const range = Number(market.scalarHigh - market.scalarLow)
  const isResolved = market.status === MarketStatus.Resolved
  const resolvedPct = isResolved && range > 0
    ? Math.max(2, Math.min(98, (Number(market.resolvedScalarValue - market.scalarLow) / range) * 100))
    : null

  return (
    <div className="space-y-4">
      <div className="flex justify-between text-sm">
        <span style={{ color: 'var(--muted)' }}>Low: {market.scalarLow.toString()}</span>
        <span style={{ color: 'var(--muted)' }}>High: {market.scalarHigh.toString()}</span>
      </div>
      <div className="relative h-4 rounded-full" style={{ background: 'var(--surface-muted)' }}>
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all"
          style={{
            width: '100%',
            background: 'linear-gradient(to right, var(--danger), var(--success))',
            opacity: 0.3,
          }}
        />
        {resolvedPct !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2"
            style={{
              left: `${resolvedPct}%`,
              transform: 'translate(-50%, -50%)',
              background: 'var(--success)',
              borderColor: '#0d1b2f',
            }}
          />
        )}
      </div>
      {isResolved && (
        <p className="text-sm text-center tabular-nums font-semibold" style={{ color: 'var(--success)' }}>
          Resolved: {market.resolvedScalarValue.toString()}
        </p>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span style={{ color: 'var(--subtle)' }}>{label}</span>
      <span style={{ color: 'var(--muted)' }}>{value}</span>
    </div>
  )
}
