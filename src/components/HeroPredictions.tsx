import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Flame, Briefcase, TrendingUp, Clock } from 'lucide-react'
import PriceChart from './market/PriceChart'
import BtcLogo from './BtcLogo'
import { outcomeColor } from './MarketCard'
import { useMarketActivity } from '../hooks/useMarketActivity'
import { usePlatformFee } from '../hooks/useMarkets'
import { Market, MarketStatus, MarketType, formatUsdc, getMarketPrice, timeUntil } from '../lib/contract'
import { pricesFromPools } from '../lib/marketMath'
import { useBtcAvailable, useLiveBtcPrice, usd } from '../lib/btcRounds'
import { useSiteConfig } from '../lib/adminConfig'

const SLIDES = 6

/** Featured-market carousel: big card with outcome leaders and a live multi-line chart, plus promo and "hot markets" rail. */
export default function HeroPredictions({ markets, images }: { markets: Market[]; images: Record<string, string> }) {
  const open = markets.filter(m => m.status === MarketStatus.Open && m.marketType !== MarketType.Scalar)
  const slides = useMemo(() => {
    const byPool = [...open].sort((a, b) => (b.totalLiquidity > a.totalLiquidity ? 1 : b.totalLiquidity < a.totalLiquidity ? -1 : Number(b.id - a.id)))
    const featured = byPool.filter(m => m.featured)
    return [...featured, ...byPool.filter(m => !m.featured)].slice(0, SLIDES)
  }, [open.map(m => m.id + ':' + m.totalLiquidity).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => { if (i >= slides.length) setI(0) }, [slides.length, i])
  useEffect(() => {
    if (paused || slides.length < 2) return
    const t = setInterval(() => setI(x => (x + 1) % slides.length), 9000)
    return () => clearInterval(t)
  }, [paused, slides.length])
  if (slides.length === 0) return null
  const m = slides[Math.min(i, slides.length - 1)]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 mb-6">
      <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <Slide key={m.id.toString()} market={m} image={images[m.id.toString()]} />
        <div className="flex items-center gap-3 mt-3">
          <div className="flex items-center gap-1.5">
            {slides.map((s, k) => (
              <button key={s.id.toString()} onClick={() => setI(k)} aria-label={`Show market ${k + 1}`} className="h-1.5 rounded-full transition-all" style={{ width: k === i ? 26 : 6, background: k === i ? 'var(--accent)' : 'var(--border)' }} />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setI(x => (x - 1 + slides.length) % slides.length)} aria-label="Previous" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}><ChevronLeft size={15} /></button>
            <button onClick={() => setI(x => (x + 1) % slides.length)} aria-label="Next" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}><ChevronRight size={15} /></button>
          </div>
        </div>
      </div>
      <Rail markets={markets} />
    </div>
  )
}

function Slide({ market, image }: { market: Market; image?: string }) {
  const { data: fee } = usePlatformFee()
  const activity = useMarketActivity(market.id, market.outcomes.length, market.outcomePools as bigint[], market.totalLiquidity, fee as bigint | undefined, 2500)
  const prices = useMemo(() => pricesFromPools([...market.outcomePools]), [market])
  const rows = market.outcomes.map((name, k) => ({ name, k, p: getMarketPrice(market, k) })).sort((a, b) => b.p - a.p).slice(0, 4)
  const [bad, setBad] = useState(false)
  const created = activity.data?.snapshotTimes?.[0]
  return (
    <div className="rounded-2xl p-4 sm:p-5 theme-transition" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)' }}>
      <Link to={`/market/${market.id}`} className="flex items-start gap-3 mb-3">
        {image && !bad ? <img src={image} alt="" onError={() => setBad(true)} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" style={{ border: '1px solid var(--border)' }} />
          : <div className="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center text-lg font-bold" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>{(market.category || 'M').slice(0, 1)}</div>}
        <div className="min-w-0">
          <div className="text-xs mb-0.5 flex items-center gap-2" style={{ color: 'var(--muted)' }}>
            <span>{market.category || 'General'}</span><span>·</span><span>{market.marketType === MarketType.Binary ? 'Binary' : 'Multiple choice'}</span>
          </div>
          <h2 className="display text-lg sm:text-xl font-700 leading-snug text-balance" style={{ color: 'var(--ink)' }}>{market.question}</h2>
        </div>
      </Link>
      <div className="grid grid-cols-1 md:grid-cols-[minmax(180px,240px)_minmax(0,1fr)] gap-4">
        <div className="space-y-1.5">
          {rows.map(r => (
            <Link key={r.k} to={`/market/${market.id}`} className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ background: 'var(--surface-muted)' }}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: outcomeColor(r.name, r.k, market.outcomes.length) }} />
              <span className="text-sm font-medium truncate flex-1" style={{ color: 'var(--ink)' }}>{r.name}</span>
              <span className="display text-base font-700 num" style={{ color: 'var(--ink)' }}>{Math.round(r.p * 100)}%</span>
            </Link>
          ))}
          {market.outcomes.length > 4 && <div className="text-[11px] pl-1" style={{ color: 'var(--subtle)' }}>+{market.outcomes.length - 4} more</div>}
        </div>
        <div className="min-w-0">
          <PriceChart outcomes={market.outcomes} snapshots={activity.data?.replay?.snapshots ?? null} times={activity.data?.snapshotTimes ?? []} livePrices={prices}
            createdTs={created ?? Math.floor(Date.now() / 1000) - 3600} selected={market.outcomes.length > 2 ? null : 0} live height={190} />
        </div>
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: 'var(--muted)' }}>
        <span className="inline-flex items-center gap-1 num"><TrendingUp size={12} /> ${formatUsdc(market.totalLiquidity)} pool</span>
        <span className="inline-flex items-center gap-1"><Clock size={12} /> ends in {timeUntil(market.endTime)}</span>
        <Link to={`/market/${market.id}`} className="ml-auto font-semibold" style={{ color: 'var(--accent)' }}>Trade →</Link>
      </div>
    </div>
  )
}

function Rail({ markets }: { markets: Market[] }) {
  const cfg = useSiteConfig()
  const btcOn = useBtcAvailable()
  const { price } = useLiveBtcPrice()
  const hot = [...markets].filter(m => m.status === MarketStatus.Open).sort((a, b) => (b.totalLiquidity > a.totalLiquidity ? 1 : -1)).slice(0, 5)
  const promo = { background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)' } as const
  return (
    <div className="hidden lg:flex flex-col gap-3">
      {btcOn && cfg.btcShowOnHome && (
        <Link to="/btc" className="rounded-2xl p-4 flex items-center gap-3" style={promo}>
          <BtcLogo size={36} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{cfg.btcTitle || 'Bitcoin Up or Down'}</div>
            <div className="text-xs num" style={{ color: 'var(--muted)' }}>5-minute rounds · {price ? usd(price) : 'live'}</div>
          </div>
          <span className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>Bet</span>
        </Link>
      )}
      <Link to="/portfolio" className="rounded-2xl p-4 flex items-center gap-3" style={promo}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><Briefcase size={17} /></div>
        <div className="min-w-0 flex-1"><div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Your portfolio</div><div className="text-xs" style={{ color: 'var(--muted)' }}>Positions, P&amp;L, claims</div></div>
        <ChevronRight size={15} style={{ color: 'var(--subtle)' }} />
      </Link>
      <div className="rounded-2xl p-4" style={promo}>
        <div className="flex items-center gap-1.5 mb-2 text-sm font-semibold" style={{ color: 'var(--ink)' }}><Flame size={14} style={{ color: 'var(--danger)' }} /> Hot markets</div>
        <div className="space-y-0.5">
          {hot.map((m, k) => (
            <Link key={m.id.toString()} to={`/market/${m.id}`} className="flex items-center gap-2 py-1.5 text-xs">
              <span className="w-4 num" style={{ color: 'var(--subtle)' }}>{k + 1}</span>
              <span className="truncate flex-1" style={{ color: 'var(--ink)' }}>{m.question}</span>
              <span className="num" style={{ color: 'var(--muted)' }}>${formatUsdc(m.totalLiquidity)}</span>
            </Link>
          ))}
          {hot.length === 0 && <div className="text-xs" style={{ color: 'var(--subtle)' }}>No open markets yet.</div>}
        </div>
      </div>
    </div>
  )
}
