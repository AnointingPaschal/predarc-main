import { useEffect, useMemo, useRef, useState } from 'react'
import type { Snapshot } from '../../lib/marketMath'
import { outcomeColor, pct } from './format'

interface Props {
  outcomes: string[]
  snapshots: Snapshot[] | null   // history from onchain replay
  times: number[]                // unix seconds per snapshot
  livePrices: number[]           // current prices (adds the "now" point)
  createdTs: number
  selected: number | null        // highlighted outcome (null = all)
  onSelect?: (i: number) => void
  live?: boolean
  height?: number
}

const RANGES = [
  { key: '1H', secs: 3600 }, { key: '6H', secs: 6 * 3600 }, { key: '1D', secs: 86400 },
  { key: '1W', secs: 7 * 86400 }, { key: 'ALL', secs: 0 },
] as const

interface Pt { t: number; p: number[] }

export default function PriceChart({ outcomes, snapshots, times, livePrices, createdTs, selected, onSelect, live, height }: Props) {
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('ALL')
  const [hover, setHover] = useState<number | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(700)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const H = height ?? 300, PL = 8, PR = 44, PT = 14, PB = 26

  useEffect(() => {
    const el = wrap.current; if (!el) return
    const ro = new ResizeObserver(() => setW(Math.max(280, el.clientWidth)))
    ro.observe(el); setW(Math.max(280, el.clientWidth))
    return () => ro.disconnect()
  }, [])
  useEffect(() => { const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 5000); return () => clearInterval(id) }, [])

  const all: Pt[] = useMemo(() => {
    const pts: Pt[] = (snapshots ?? []).map((s, i) => ({ t: times[i] || createdTs, p: s.prices })).filter(p => p.t > 0)
    if (!pts.length && createdTs) pts.push({ t: createdTs, p: livePrices })
    pts.sort((a, b) => a.t - b.t)
    return pts
  }, [snapshots, times, createdTs, livePrices])

  const data = useMemo(() => {
    const secs = RANGES.find(r => r.key === range)!.secs
    const end = Math.max(now, all.length ? all[all.length - 1].t : now)
    const start = secs ? end - secs : (all[0]?.t ?? end - 3600)
    let pts = all.filter(p => p.t >= start)
    const before = [...all].reverse().find(p => p.t < start)
    if (before) pts = [{ t: start, p: before.p }, ...pts]
    else if (!pts.length) pts = [{ t: start, p: livePrices }]
    pts = [...pts, { t: end, p: livePrices }]
    return { pts, start: Math.min(start, pts[0].t), end }
  }, [all, range, now, livePrices])

  const shown = selected === null ? outcomes.map((_, i) => i) : [selected]
  const vals = data.pts.flatMap(p => shown.map(i => p.p[i] ?? 0))
  let lo = Math.min(...vals), hi = Math.max(...vals)
  if (!isFinite(lo)) { lo = 0; hi = 1 }
  const padding = Math.max(0.05, (hi - lo) * 0.15)
  lo = Math.max(0, lo - padding); hi = Math.min(1, hi + padding)
  if (hi - lo < 0.2) { const mid = (hi + lo) / 2; lo = Math.max(0, mid - 0.1); hi = Math.min(1, mid + 0.1) }

  const span = Math.max(1, data.end - data.start)
  const x = (t: number) => PL + ((t - data.start) / span) * (w - PL - PR)
  const y = (p: number) => PT + (1 - (p - lo) / (hi - lo)) * (H - PT - PB)

  const step = (i: number) => {
    let d = ''
    data.pts.forEach((pt, k) => {
      const px = x(pt.t), py = y(pt.p[i] ?? 0)
      d += k === 0 ? `M${px.toFixed(1)},${py.toFixed(1)}` : `H${px.toFixed(1)}V${py.toFixed(1)}`
    })
    return d
  }

  const ticks = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * k) / 4)
  const xticks = Array.from({ length: 4 }, (_, k) => data.start + (span * k) / 3)
  const fmtX = (t: number) => {
    const d = new Date(t * 1000)
    return span <= 86400 * 1.5 ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const hoverPt = (() => {
    if (hover === null) return null
    const t = data.start + ((hover - PL) / (w - PL - PR)) * span
    let cur = data.pts[0]
    for (const p of data.pts) { if (p.t <= t) cur = p; else break }
    return { t: Math.min(Math.max(t, data.start), data.end), p: cur.p }
  })()

  const last = data.pts[data.pts.length - 1].p
  const first = data.pts[0].p
  const single = shown.length === 1 ? shown[0] : outcomes.length === 2 ? 0 : null

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {outcomes.map((o, i) => (
            <button key={i} onClick={() => onSelect?.(i)} className="flex items-center gap-1.5 text-xs" style={{ opacity: selected === null || selected === i ? 1 : 0.4 }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: outcomeColor(i) }} />
              <span style={{ color: 'var(--muted)' }}>{o}</span>
              <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{pct(last[i] ?? 0, 0)}</span>
              {(() => { const d = ((last[i] ?? 0) - (first[i] ?? 0)) * 100; return Math.abs(d) >= 0.1 ? <span className="tabular-nums" style={{ color: d >= 0 ? 'var(--success)' : 'var(--danger)' }}>{d >= 0 ? '▲' : '▼'}{Math.abs(d).toFixed(1)}</span> : null })()}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {live && <span className="flex items-center gap-1 text-xs mr-2" style={{ color: 'var(--success)' }}><span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--success)' }} />Live</span>}
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)} className="px-2 py-1 rounded text-xs font-medium"
              style={{ background: range === r.key ? 'var(--accent-bg)' : 'transparent', color: range === r.key ? 'var(--accent)' : 'var(--subtle)' }}>{r.key}</button>
          ))}
        </div>
      </div>

      <div ref={wrap} className="relative w-full select-none" style={{ height: H }}>
        <svg width={w} height={H} onMouseLeave={() => setHover(null)}
          onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); setHover(e.clientX - r.left) }}
          onTouchMove={e => { const r = e.currentTarget.getBoundingClientRect(); setHover(e.touches[0].clientX - r.left) }}
          onTouchEnd={() => setHover(null)}>
          {ticks.map((t, k) => (
            <g key={k}>
              <line x1={PL} x2={w - PR} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="3 4" />
              <text x={w - PR + 6} y={y(t) + 4} fontSize="10" fill="var(--subtle)">{Math.round(t * 100)}%</text>
            </g>
          ))}
          {xticks.map((t, k) => <text key={k} x={Math.min(Math.max(x(t), 20), w - PR - 20)} y={H - 8} fontSize="10" fill="var(--subtle)" textAnchor="middle">{fmtX(t)}</text>)}
          {single !== null && (
            <path d={`${step(single)}V${y(lo)}H${x(data.pts[0].t)}Z`} fill={outcomeColor(single)} opacity="0.08" />
          )}
          {shown.map(i => <path key={i} d={step(i)} fill="none" stroke={outcomeColor(i)} strokeWidth="2" strokeLinejoin="round" />)}
          {shown.map(i => <circle key={i} cx={x(data.end)} cy={y(last[i] ?? 0)} r="3.5" fill={outcomeColor(i)} />)}
          {hoverPt && (
            <g>
              <line x1={x(hoverPt.t)} x2={x(hoverPt.t)} y1={PT} y2={H - PB} stroke="var(--border-strong)" />
              {shown.map(i => <circle key={i} cx={x(hoverPt.t)} cy={y(hoverPt.p[i] ?? 0)} r="4" fill={outcomeColor(i)} stroke="var(--bg)" strokeWidth="2" />)}
            </g>
          )}
        </svg>
        {hoverPt && (
          <div className="absolute top-2 pointer-events-none rounded-lg px-2.5 py-2 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(x(hoverPt.t) + 10, 4), w - 160), background: 'var(--surface-muted)', border: '1px solid var(--border-strong)', minWidth: 130 }}>
            <div className="mb-1" style={{ color: 'var(--subtle)' }}>{new Date(hoverPt.t * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            {shown.map(i => (
              <div key={i} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5" style={{ color: 'var(--muted)' }}><span className="w-2 h-2 rounded-full" style={{ background: outcomeColor(i) }} />{outcomes[i]}</span>
                <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{pct(hoverPt.p[i] ?? 0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {!snapshots && <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>Full price history is unavailable right now — showing the live price only.</p>}
    </div>
  )
}
