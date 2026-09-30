import { useState } from 'react'
import { Market, MarketStatus, getMarketPrice } from '../../lib/contract'
import type { Team } from '../../lib/sportsCore'

export const fmtKick = (ms: number) => {
  const d = new Date(ms)
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })} · ${d.toISOString().slice(11, 16)} UTC`
}

export function TeamLogo({ team, size = 28 }: { team: Team; size?: number }) {
  const [bad, setBad] = useState(false)
  if (!team.logo || bad) {
    return <span className="inline-flex items-center justify-center rounded-full text-[10px] font-bold shrink-0" style={{ width: size, height: size, background: 'var(--surface-muted)', color: 'var(--muted)', border: '1px solid var(--border)' }}>{(team.abbr || team.name).slice(0, 3).toUpperCase()}</span>
  }
  return <img src={team.logo} alt="" width={size} height={size} loading="lazy" onError={() => setBad(true)} className="object-contain shrink-0" style={{ width: size, height: size }} />
}

/** Decimal odds from the market probability (1 / p). */
export const decimalOdds = (p: number) => (p > 0.005 ? (1 / p).toFixed(2) : '—')

export function OddsButton({ market, index, label, selected, onClick, compact }: {
  market?: Market; index: number; label: string; selected?: boolean; onClick?: () => void; compact?: boolean
}) {
  const open = market?.status === MarketStatus.Open && market.totalLiquidity > 0n && Number(market.endTime) * 1000 > Date.now()
  const won = market?.status === MarketStatus.Resolved && Number(market.resolvedOutcome) === index
  const lost = market?.status === MarketStatus.Resolved && !won
  const p = market ? getMarketPrice(market, index) : 0
  return (
    <button
      disabled={!market || !onClick}
      onClick={onClick}
      className={`flex flex-col items-center justify-center rounded-xl ${compact ? 'px-1.5 py-1.5' : 'px-3 py-2.5'} min-w-0 theme-transition disabled:cursor-default ${market && !selected ? 'hover:brightness-95' : ''}`}
      style={{
        background: selected ? 'var(--accent)' : won ? 'color-mix(in srgb, var(--accent) 25%, var(--surface))' : 'var(--surface-muted)',
        color: selected ? 'var(--accent-text)' : lost ? 'var(--subtle)' : 'var(--ink)',
        border: '1px solid ' + (selected || won ? 'var(--accent)' : 'var(--border)'),
        opacity: market && !open && !won && !lost ? 0.6 : 1,
      }}
    >
      <span className="text-[10.5px] font-medium truncate max-w-full" style={{ opacity: .7 }}>{label}</span>
      <span className={`${compact ? 'text-[13px]' : 'text-[15px]'} font-bold tabular-nums`}>{won ? '✓' : market ? decimalOdds(p) : '—'}</span>
    </button>
  )
}
