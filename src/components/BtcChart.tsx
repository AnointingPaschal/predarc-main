import { useMemo } from 'react'
import type { PricePoint } from '../lib/btcRounds'
import { usd } from '../lib/btcRounds'

/** Live BTC line with the round's "price to beat" and a marker at the round's end. */
export default function BtcChart({ points, price, target, windowStart, windowEnd }: {
  points: PricePoint[]; price: number | null; target: number; windowStart: number; windowEnd: number
}) {
  const W = 720, H = 260, PADL = 8, PADR = 64, PADT = 14, PADB = 22
  const view = useMemo(() => {
    const from = windowStart - 60_000
    const pts = points.filter(p => p.t >= from)
    if (price != null) pts.push({ t: Date.now(), p: price })
    return pts
  }, [points, price, windowStart])

  if (view.length < 2) {
    return <div className="flex items-center justify-center text-xs" style={{ height: H, color: 'var(--subtle)' }}>Loading live BTC price…</div>
  }
  const vals = view.map(p => p.p).concat(target > 0 ? [target] : [])
  let lo = Math.min(...vals), hi = Math.max(...vals)
  const pad = Math.max((hi - lo) * 0.15, hi * 0.0002)
  lo -= pad; hi += pad
  const tMin = view[0].t, tMax = Math.max(windowEnd, view[view.length - 1].t)
  const x = (t: number) => PADL + ((t - tMin) / (tMax - tMin)) * (W - PADL - PADR)
  const y = (p: number) => PADT + (1 - (p - lo) / (hi - lo)) * (H - PADT - PADB)
  const last = view[view.length - 1]
  const path = view.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.p).toFixed(1)}`).join(' ')
  const up = target > 0 ? last.p >= target : true
  const color = up ? 'var(--success)' : 'var(--danger)'
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => lo + (hi - lo) * f)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Live BTC price chart">
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={PADL} x2={W - PADR} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray="2 4" />
          <text x={W - PADR + 6} y={y(v) + 3} fontSize="10" fill="var(--subtle)">{v.toLocaleString('en-US', { maximumFractionDigits: 0 })}</text>
        </g>
      ))}
      {windowStart >= tMin && <line x1={x(windowStart)} x2={x(windowStart)} y1={PADT} y2={H - PADB} stroke="var(--border)" />}
      <line x1={x(windowEnd)} x2={x(windowEnd)} y1={PADT} y2={H - PADB} stroke="var(--border)" strokeDasharray="4 4" />
      {target > 0 && (
        <g>
          <line x1={PADL} x2={W - PADR} y1={y(target)} y2={y(target)} stroke="#F7931A" strokeWidth="1.5" strokeDasharray="6 4" />
          <rect x={W - PADR + 2} y={y(target) - 8} width={60} height={16} rx={4} fill="#F7931A" />
          <text x={W - PADR + 32} y={y(target) + 4} fontSize="9.5" fontWeight="700" textAnchor="middle" fill="#fff">TO BEAT</text>
        </g>
      )}
      <path d={`${path} L${x(last.t)},${H - PADB} L${x(view[0].t)},${H - PADB} Z`} fill={color} opacity="0.08" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.t)} cy={y(last.p)} r="4" fill={color} />
      <circle cx={x(last.t)} cy={y(last.p)} r="9" fill={color} opacity="0.2">
        <animate attributeName="r" values="5;11;5" dur="1.6s" repeatCount="indefinite" />
      </circle>
      <text x={PADL + 2} y={H - 6} fontSize="10" fill="var(--subtle)">{new Date(tMin).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</text>
      <text x={x(windowEnd) - 4} y={H - 6} fontSize="10" textAnchor="end" fill="var(--subtle)">{usd(last.p)}</text>
    </svg>
  )
}
