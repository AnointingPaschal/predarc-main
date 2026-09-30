import { Link } from 'react-router-dom'
import BtcLogo from './BtcLogo'
import BtcRing from './BtcRing'
import BtcChart from './BtcChart'
import { useBtcAvailable, useBtcState, useLiveBtcPrice, useBtcClock, upChance, usd, utcHM, RoundStatus, type RoundData } from '../lib/btcRounds'
import { useSiteConfig } from '../lib/adminConfig'
import { formatUnits } from 'viem'

const payout = (r: RoundData | undefined, up: boolean, feeBps: number) => {
  if (!r) return null
  const side = Number(formatUnits(up ? r.upTotal : r.downTotal, 6)), total = Number(formatUnits(r.upTotal + r.downTotal, 6))
  if (side <= 0) return null
  return (total * (1 - feeBps / 10000)) / side
}

/** Polymarket-style compact card for the market grid. */
export function BtcCard() {
  const cfg = useSiteConfig()
  const on = useBtcAvailable()
  if (!on || !cfg.btcShowOnHome) return null
  return <CardInner title={cfg.btcTitle || 'Bitcoin Up or Down'} />
}

function CardInner({ title }: { title: string }) {
  const { data: state } = useBtcState(undefined, 6000)
  const { price, points, live } = useLiveBtcPrice()
  const { curId, dur, secLeft } = useBtcClock(state)
  const cur = state?.rounds.find(r => r.id === curId)
  const next = state?.rounds.find(r => r.id === curId + 1)
  const lock = cur?.lockPrice ?? 0
  const chance = upChance(points, price, lock, secLeft)
  const fee = state?.feeBps ?? 200
  const pu = payout(next, true, fee), pd = payout(next, false, fee)
  const up = next ? Number(formatUnits(next.upTotal, 6)) : 0, down = next ? Number(formatUnits(next.downTotal, 6)) : 0
  const upPct = up + down > 0 ? (up / (up + down)) * 100 : 50
  const gap = price && lock ? price - lock : null
  return (
    <Link to="/btc" className="rounded-2xl p-4 flex flex-col gap-3 theme-transition hover:-translate-y-0.5 transition" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)' }}>
      <div className="flex items-center gap-3">
        <BtcRing progress={1 - secLeft / dur} size={56}><BtcLogo size={34} /></BtcRing>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate" style={{ color: 'var(--ink)' }}>{title} · {Math.round(dur / 60)}m</div>
          <div className="num text-xl font-700 leading-tight" style={{ color: 'var(--ink)' }}>{price ? usd(price) : '—'}</div>
        </div>
        <div className="text-right">
          <div className="num text-sm font-semibold" style={{ color: 'var(--ink)' }}>{Math.floor(secLeft / 60)}:{String(Math.floor(secLeft % 60)).padStart(2, '0')}</div>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>left</div>
        </div>
      </div>
      <div className="rounded-xl overflow-hidden -mx-1" style={{ background: 'var(--surface-muted)' }}>
        <BtcChart compact points={points} price={price} target={lock} windowStart={0} windowEnd={0} />
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="px-2 py-1 rounded-md num font-semibold" style={{ background: gap == null ? 'var(--surface-muted)' : gap >= 0 ? 'rgba(52,211,153,.15)' : 'rgba(248,113,113,.15)', color: gap == null ? 'var(--subtle)' : gap >= 0 ? 'var(--success)' : 'var(--danger)' }}>
          {gap == null ? 'awaiting target' : `${gap >= 0 ? '▲' : '▼'} ${usd(Math.abs(gap))} vs target`}
        </span>
        <span className="ml-auto num" style={{ color: 'var(--muted)' }}>{chance == null ? '' : `${Math.round(chance * 100)}% Up`}</span>
      </div>
      <div>
        <div className="h-1.5 rounded-full overflow-hidden flex mb-2" style={{ background: 'var(--surface-strong)' }}>
          <div style={{ width: `${upPct}%`, background: 'var(--success)' }} /><div style={{ width: `${100 - upPct}%`, background: 'var(--danger)' }} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg py-2 text-center text-sm font-semibold" style={{ background: 'rgba(52,211,153,.16)', color: 'var(--success)' }}>▲ Up{pu ? <span className="opacity-70 text-xs"> {pu.toFixed(2)}x</span> : null}</div>
          <div className="rounded-lg py-2 text-center text-sm font-semibold" style={{ background: 'rgba(248,113,113,.16)', color: 'var(--danger)' }}>▼ Down{pd ? <span className="opacity-70 text-xs"> {pd.toFixed(2)}x</span> : null}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--subtle)' }}>
        <span className="inline-flex items-center gap-1 font-semibold" style={{ color: live ? 'var(--danger)' : 'var(--subtle)' }}><span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} /> LIVE</span>
        <span>Bitcoin</span>
        <span className="ml-auto num">next {utcHM((curId + 1) * dur)} UTC{up + down > 0 ? ` · $${(up + down).toFixed(0)}` : ''}</span>
      </div>
    </Link>
  )
}

/** Recent results strip for the home-page sidebar. */
export function BtcResultsCard() {
  const on = useBtcAvailable()
  const cfg = useSiteConfig()
  const { data: state } = useBtcState(undefined, 8000)
  const { curId, dur } = useBtcClock(state)
  if (!on || !cfg.btcShowOnHome) return null
  const rows = (state?.rounds ?? []).filter(r => r.id < curId).slice(-8).reverse()
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)' }}>
      <div className="flex items-center gap-2 mb-3"><BtcLogo size={20} /><span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Recent BTC rounds</span><span className="ml-auto text-[10px]" style={{ color: 'var(--subtle)' }}>UTC</span></div>
      <div className="space-y-1.5">
        {rows.length === 0 && <div className="text-xs" style={{ color: 'var(--subtle)' }}>No rounds yet.</div>}
        {rows.map(r => {
          const up = r.status === RoundStatus.SettledUp, down = r.status === RoundStatus.SettledDown
          return (
            <div key={r.id} className="flex items-center text-xs gap-2">
              <span className="num" style={{ color: 'var(--muted)' }}>{utcHM(r.id * dur)}</span>
              <span className="num flex-1 truncate" style={{ color: 'var(--subtle)' }}>{r.lockPrice ? usd(r.lockPrice) : '—'}</span>
              <span className="font-semibold" style={{ color: up ? 'var(--success)' : down ? 'var(--danger)' : 'var(--subtle)' }}>{up ? '▲ Up' : down ? '▼ Down' : r.status === RoundStatus.Void ? 'Refund' : '…'}</span>
            </div>
          )
        })}
      </div>
      <Link to="/btc" className="block mt-3 text-xs font-semibold" style={{ color: 'var(--accent)' }}>Open Bitcoin rounds →</Link>
    </div>
  )
}
