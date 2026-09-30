/** Semicircle gauge showing the chance of "Up" (Polymarket-style). */
export default function BtcGauge({ value, size = 84, label = 'Up' }: { value: number | null; size?: number; label?: string }) {
  const pct = value == null ? null : Math.round(value * 100)
  const r = 38, cx = 50, cy = 50
  const arc = (from: number, to: number) => {
    const a = (v: number) => Math.PI * (1 - v)
    const pt = (v: number) => `${cx + r * Math.cos(a(v))},${cy - r * Math.sin(a(v))}`
    return `M${pt(from)} A${r},${r} 0 0 1 ${pt(to)}`
  }
  const v = value ?? 0.5
  const color = v >= 0.5 ? 'var(--success)' : 'var(--danger)'
  return (
    <div style={{ width: size, textAlign: 'center', lineHeight: 1 }}>
      <svg viewBox="0 0 100 56" width={size} role="img" aria-label={`${pct ?? '—'}% chance ${label}`}>
        <path d={arc(0, 1)} fill="none" stroke="var(--border)" strokeWidth="7" strokeLinecap="round" />
        {value != null && <path d={arc(0, Math.max(0.02, v))} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" />}
        <text x="50" y="46" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--ink)">{pct == null ? '—' : `${pct}%`}</text>
      </svg>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -4 }}>{label}</div>
    </div>
  )
}
