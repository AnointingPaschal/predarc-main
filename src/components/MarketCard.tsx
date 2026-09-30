import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, TrendingUp, ArrowUpRight, CheckCircle2, XCircle, Minus } from 'lucide-react'
import { Market, MarketStatus, MarketType, timeUntil, formatUsdc, getMarketPrice } from '../lib/contract'

interface MarketCardProps {
  market: Market
  featured?: boolean
  image?: string
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

const PALETTE = ['#3b82f6', '#f43f5e', '#f59e0b', '#a855f7', '#14b8a6', '#ec4899', '#84cc16', '#06b6d4', '#f97316', '#8b5cf6']
const YES = '#22c55e', NO = '#ef4444'
/** Consistent colour per outcome: Yes green, No red, everything else from the palette. */
export function outcomeColor(name: string, i: number, total: number): string {
  if (/^yes$/i.test(name.trim())) return YES
  if (/^no$/i.test(name.trim())) return NO
  if (total === 2) return i === 0 ? PALETTE[0] : PALETTE[1]
  return PALETTE[i % PALETTE.length]
}

function Cover({ src, category, catColor }: { src?: string; category: string; catColor: string }) {
  const [bad, setBad] = useState(false)
  if (src && !bad) {
    return <img src={src} alt="" loading="lazy" onError={() => setBad(true)} className="w-11 h-11 rounded-xl object-cover flex-shrink-0" style={{ border: '1px solid var(--border)' }} />
  }
  return (
    <div className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center text-sm font-bold" style={{ background: `color-mix(in srgb, ${catColor} 18%, var(--surface-muted))`, color: catColor }}>
      {(category || 'M').slice(0, 1).toUpperCase()}
    </div>
  )
}

export default function MarketCard({ market, featured: _featured, image }: MarketCardProps) {
  const isOpen = market.status === MarketStatus.Open
  const isResolved = market.status === MarketStatus.Resolved
  const isCancelled = market.status === MarketStatus.Cancelled
  const catColor = CATEGORY_COLORS[market.category] ?? 'var(--muted)'

  return (
    <Link
      to={`/market/${market.id}`}
      className="group flex flex-col rounded-2xl overflow-hidden theme-transition hover:-translate-y-0.5 transition"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
    >
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start gap-3">
          <Cover src={image} category={market.category} catColor={catColor} />
          <p className="text-[15px] font-semibold leading-snug text-pretty line-clamp-3 flex-1" style={{ color: 'var(--ink)' }}>{market.question}</p>
          {market.marketType === MarketType.Binary && !isCancelled && <ChanceRing market={market} />}
        </div>

        {market.marketType === MarketType.Scalar ? <ScalarPreview market={market} /> : <OutcomesPreview market={market} />}

        <div className="flex items-center gap-2 mt-auto pt-2 text-[11px] flex-wrap" style={{ color: 'var(--subtle)', borderTop: '1px solid var(--border)' }}>
          <span className="pill" style={{ background: `color-mix(in srgb, ${catColor} 14%, transparent)`, color: catColor }}>{market.category || 'General'}</span>
          <StatusBadge status={market.status} />
          <span className="flex items-center gap-1 num"><Clock size={10} />{isResolved ? 'Resolved' : isCancelled ? 'Cancelled' : timeUntil(market.endTime)}</span>
          <span className="ml-auto flex items-center gap-1 num"><TrendingUp size={10} /><span style={{ color: 'var(--muted)', fontWeight: 600 }}>${formatUsdc(market.totalLiquidity)}</span></span>
          {isOpen && <ArrowUpRight size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--accent)' }} />}
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
  const st = styles[status]
  return <span className="pill flex items-center gap-1" style={{ background: st.bg, color: st.color }}>{st.icon}{st.label}</span>
}

/** Circular chance readout for the first outcome of a binary market. */
function ChanceRing({ market }: { market: Market }) {
  const pct = Math.round(getMarketPrice(market, 0) * 100)
  const col = outcomeColor(market.outcomes[0] ?? '', 0, 2)
  const r = 17, c = 2 * Math.PI * r
  return (
    <div className="flex-shrink-0 text-center" style={{ width: 46 }}>
      <svg width="46" height="46" viewBox="0 0 46 46" style={{ display: 'block' }}>
        <circle cx="23" cy="23" r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
        <circle cx="23" cy="23" r={r} fill="none" stroke={col} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 23 23)" />
        <text x="23" y="27" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--ink)">{pct}%</text>
      </svg>
    </div>
  )
}

function OutcomesPreview({ market }: { market: Market }) {
  const n = market.outcomes.length
  const rows = market.outcomes.map((name, i) => ({ name, i, pct: getMarketPrice(market, i) * 100, color: outcomeColor(name, i, n) }))
  const resolved = market.status === MarketStatus.Resolved
  const isBinary = market.marketType === MarketType.Binary

  if (isBinary) {
    // Two big "buy" buttons with prices, like a trading ticket
    return (
      <div className="grid grid-cols-2 gap-2">
        {rows.map(r => {
          const won = resolved && market.resolvedOutcome === BigInt(r.i)
          return (
            <div key={r.i} className="rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 min-w-0" style={{ background: `color-mix(in srgb, ${r.color} ${won ? 28 : 14}%, transparent)`, border: `1px solid color-mix(in srgb, ${r.color} ${won ? 60 : 25}%, transparent)` }}>
              <span className="text-sm font-semibold truncate" style={{ color: r.color }}>{r.name}</span>
              <span className="text-sm font-bold num flex-shrink-0" style={{ color: r.color }}>{Math.round(r.pct)}¢</span>
            </div>
          )
        })}
      </div>
    )
  }

  // Multiple choice: leaders first, each row filled proportionally with its own colour
  const sorted = [...rows].sort((a, b) => b.pct - a.pct)
  const show = sorted.slice(0, 3)
  return (
    <div className="space-y-1.5">
      {show.map(r => {
        const won = resolved && market.resolvedOutcome === BigInt(r.i)
        return (
          <div key={r.i} className="relative rounded-lg overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
            <div className="absolute inset-y-0 left-0 rounded-lg" style={{ width: `${Math.max(3, r.pct)}%`, background: `color-mix(in srgb, ${r.color} ${won ? 40 : 24}%, transparent)`, transition: 'width .5s' }} />
            <div className="relative flex items-center gap-2 px-2.5 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: r.color }} />
              <span className="text-xs font-medium truncate flex-1" style={{ color: 'var(--ink)' }}>{r.name}</span>
              <span className="text-xs font-bold num" style={{ color: won ? 'var(--success)' : 'var(--ink)' }}>{r.pct.toFixed(r.pct < 10 ? 1 : 0)}%</span>
            </div>
          </div>
        )
      })}
      {n > 3 && <p className="text-[11px] pl-1" style={{ color: 'var(--subtle)' }}>+{n - 3} more options</p>}
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
