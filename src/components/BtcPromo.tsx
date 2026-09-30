import { Link } from 'react-router-dom'
import BtcLogo from './BtcLogo'
import BtcGauge from './BtcGauge'
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
  const chance = upChance(points, price, cur?.lockPrice ?? 0, secLeft)
  const fee = state?.feeBps ?? 200
  const pu = payout(next, true, fee), pd = payout(next, false, fee)
  const pool = next ? Number(formatUnits(next.upTotal + next.downTotal, 6)) : 0
  return (
    <Link to="/btc" className="rounded-2xl p-4 flex flex-col gap-3 theme-transition hover:brightness-110 transition" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)' }}>
      <div className="flex items-start gap-3">
        <BtcLogo size={44} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm underline underline-offset-2" style={{ color: 'var(--ink)' }}>{title} {Math.round(dur / 60)}m</div>
          <div className="num text-lg font-700 mt-0.5" style={{ color: 'var(--ink)' }}>{price ? usd(price) : '—'}</div>
          <div className="num text-[11px]" style={{ color: 'var(--muted)' }}>
            {cur?.lockPrice ? <>to beat {usd(cur.lockPrice)}</> : 'recording price…'} · {Math.floor(secLeft / 60)}:{String(Math.floor(secLeft % 60)).padStart(2, '0')} left
          </div>
        </div>
        <BtcGauge value={chance} />
      </div>
      <div className="-mx-1"><BtcChart compact points={points} price={price} target={cur?.lockPrice ?? 0} windowStart={0} windowEnd={0} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg py-2.5 text-center text-sm font-semibold" style={{ background: 'rgba(52,211,153,.16)', color: 'var(--success)' }}>
          Up{pu ? <span className="opacity-70 text-xs"> · {pu.toFixed(2)}x</span> : null}
        </div>
        <div className="rounded-lg py-2.5 text-center text-sm font-semibold" style={{ background: 'rgba(248,113,113,.16)', color: 'var(--danger)' }}>
          Down{pd ? <span className="opacity-70 text-xs"> · {pd.toFixed(2)}x</span> : null}
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--subtle)' }}>
        <span className="inline-flex items-center gap-1 font-semibold" style={{ color: live ? 'var(--danger)' : 'var(--subtle)' }}><span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} /> LIVE</span>
        <span>· Bitcoin</span>
        <span className="ml-auto num">next {utcHM((curId + 1) * dur)} UTC{pool > 0 ? ` · $${pool.toFixed(0)} pool` : ''}</span>
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
