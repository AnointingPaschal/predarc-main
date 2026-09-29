import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUp, ArrowDown, ChevronRight } from 'lucide-react'
import BtcLogo from './BtcLogo'
import BtcChart from './BtcChart'
import { useBtcAvailable, useBtcState, useLiveBtcPrice, usd, RoundStatus } from '../lib/btcRounds'
import { useSiteConfig } from '../lib/adminConfig'

/** Live Bitcoin Up/Down card for the home page. */
export default function BtcPromo() {
  const cfg = useSiteConfig()
  const on = useBtcAvailable()
  if (!on || !cfg.btcShowOnHome) return null
  return <Inner title={cfg.btcTitle || 'Bitcoin Up or Down'} />
}

function Inner({ title }: { title: string }) {
  const { data: state } = useBtcState(undefined, 6000)
  const { price, points } = useLiveBtcPrice()
  const [, setT] = useState(0)
  useEffect(() => { const i = setInterval(() => setT(t => t + 1), 1000); return () => clearInterval(i) }, [])
  const skew = state ? state.chainNow * 1000 - Date.now() : 0
  const dur = state?.duration ?? 300
  const now = (Date.now() + skew) / 1000
  const curId = Math.floor(now / dur)
  const cur = state?.rounds.find(r => r.id === curId)
  const left = Math.max(0, (curId + 1) * dur - now)
  const lock = cur?.lockPrice ?? 0
  const up = price && lock ? price >= lock : true
  const recent = (state?.rounds ?? []).filter(r => r.id < curId).slice(-8)
  return (
    <Link to="/btc" className="block rounded-2xl p-4 mb-8 theme-transition group" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)' }}>
      <div className="flex items-center gap-3 mb-2">
        <BtcLogo size={36} />
        <div className="min-w-0">
          <div className="display font-700 truncate" style={{ color: 'var(--ink)' }}>{title}</div>
          <div className="text-[11px]" style={{ color: 'var(--muted)' }}>{Math.round(dur / 60)}-minute rounds · auto-settle</div>
        </div>
        <div className="ml-auto text-right">
          <div className="num text-lg font-700" style={{ color: 'var(--ink)' }}>{price ? usd(price) : '—'}</div>
          <div className="num text-[11px]" style={{ color: up ? 'var(--success)' : 'var(--danger)' }}>
            {lock && price ? `${up ? '▲' : '▼'} ${usd(Math.abs(price - lock))} vs ${usd(lock)}` : 'live'}
          </div>
        </div>
      </div>
      <BtcChart points={points} price={price} target={lock} windowStart={curId * dur * 1000 - skew} windowEnd={(curId + 1) * dur * 1000 - skew} />
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className="num text-sm font-semibold" style={{ color: 'var(--ink)' }}>{Math.floor(left / 60)}:{String(Math.floor(left % 60)).padStart(2, '0')} left</span>
        <div className="flex gap-1 ml-2">
          {recent.map(r => (
            <span key={r.id} className="text-[10px] font-bold" style={{ color: r.status === RoundStatus.SettledUp ? 'var(--success)' : r.status === RoundStatus.SettledDown ? 'var(--danger)' : 'var(--subtle)' }}>
              {r.status === RoundStatus.SettledUp ? <ArrowUp size={12} /> : r.status === RoundStatus.SettledDown ? <ArrowDown size={12} /> : '•'}
            </span>
          ))}
        </div>
        <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--accent)' }}>Bet now <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" /></span>
      </div>
    </Link>
  )
}
