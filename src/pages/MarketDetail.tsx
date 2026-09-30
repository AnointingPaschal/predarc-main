import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Clock, ExternalLink, CheckCircle, Share2, Newspaper, Pencil, Copy } from 'lucide-react'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import { useAllMarkets, useMarket, usePlatformFee, useUserShares } from '../hooks/useMarkets'
import { useMarketActivity } from '../hooks/useMarketActivity'
import { useAddLiquidity, useRedeemWinnings } from '../hooks/useEscrow'
import { parseOnchainError } from '../lib/errors'
import { parseUnits } from 'viem'
import { activeContract, isAdminAddress, useNetwork, useSiteConfig } from '../lib/adminConfig'
import { fetchMarketMeta, fetchNews, type MarketMeta, type NewsItem } from '../lib/api'
import { pricesFromPools } from '../lib/marketMath'
import { Market, MarketStatus, MarketType, formatUsdc, statusColor, statusLabel, timeUntil } from '../lib/contract'
import TradingPanel from '../components/TradingPanel'
import PriceChart from '../components/market/PriceChart'
import OrderBook from '../components/market/OrderBook'
import ActivityTable from '../components/market/ActivityTable'
import Holders from '../components/market/Holders'
import Comments from '../components/market/Comments'
import AIInsights from '../components/market/AIInsights'
import { compactUsd, explorerBase, outcomeColor, pct, shortAddr, timeAgo, usd } from '../components/market/format'
import MarketCard from '../components/MarketCard'
import MarketEditor from '../components/market/MarketEditor'

type TabKey = 'book' | 'activity' | 'holders' | 'comments'
const card = { background: 'var(--surface)', border: '1px solid var(--border)' } as const

export default function MarketDetail() {
  const { id } = useParams<{ id: string }>()
  const marketId = id && /^\d+$/.test(id) ? BigInt(id) : undefined
  return <MarketView key={id} marketId={marketId} />
}

/** The full market screen. `embedded` drops the page chrome so other pages (e.g. a soccer match) can host it. */
export function MarketView({ marketId, embedded = false, initialOutcome = 0 }: { marketId: bigint | undefined; embedded?: boolean; initialOutcome?: number }) {
  const network = useNetwork()
  const config = useSiteConfig()
  const { address } = useAccount()
  const isAdmin = isAdminAddress(address, config.adminWallet)

  const { data: rawMarket, isLoading, refetch } = useMarket(marketId, 6000)
  const market = rawMarket as Market | undefined
  const { data: feeRaw } = usePlatformFee()
  const feeBps = feeRaw !== undefined ? BigInt(feeRaw as bigint) : 200n
  const redeem = useRedeemWinnings()

  const [outcome, setOutcome] = useState(initialOutcome)
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (params.get('edit') === '1') setEditing(true) }, [params])
  const [tab, setTab] = useState<TabKey>('book')
  const [meta, setMeta] = useState<MarketMeta>({})
  const [metaLoaded, setMetaLoaded] = useState(false)
  const [news, setNews] = useState<NewsItem[]>([])

  // "More markets" needs the whole list, which is heavy once hundreds of soccer lines exist: skip it there
  const { data: allRaw } = useAllMarkets(!!market && market.category !== 'Soccer')
  const activity = useMarketActivity(marketId, market?.outcomes.length ?? 0, market?.outcomePools as bigint[] | undefined, market?.totalLiquidity, feeBps)
  const prices = useMemo(() => (market ? pricesFromPools(market.outcomePools) : []), [market])

  useEffect(() => {
    if (marketId === undefined) return
    setMetaLoaded(false)
    fetchMarketMeta(marketId).then(setMeta).catch(() => setMeta({})).finally(() => setMetaLoaded(true))
  }, [marketId])
  const question = market?.question
  useEffect(() => {
    if (!question) return
    const q = question.replace(/[^\w\s$%.-]/g, ' ').split(/\s+/).filter(w => w.length > 3).slice(0, 6).join(' ')
    void fetchNews({ q }).then(n => setNews(n.slice(0, 5)))
  }, [question])

  const myShares = [0, 1, 2, 3, 4, 5, 6, 7].map(i => useUserShares(marketId, address, i)) // eslint-disable-line react-hooks/rules-of-hooks

  if (isLoading) return <Skeleton />
  if (!market || marketId === undefined) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <p style={{ color: 'var(--muted)' }}>Market not found on {network === 'testnet' ? 'Arc Testnet' : 'Arc Mainnet'}.</p>
        <Link to="/" className="text-sm mt-2 block" style={{ color: 'var(--accent)' }}>Back to markets</Link>
      </div>
    )
  }

  const isScalar = market.marketType === MarketType.Scalar
  const isResolved = market.status === MarketStatus.Resolved
  const isCancelled = market.status === MarketStatus.Cancelled
  const tradable = market.status === MarketStatus.Open && Date.now() / 1000 < Number(market.endTime)
  const state = { pools: market.outcomePools as bigint[], total: market.totalLiquidity }
  const trades = activity.data?.trades ?? []
  const volume = trades.reduce((s, t) => s + Number(t.usdc) / 1e6, 0)
  const liquidity = Number(market.totalLiquidity) / 1e6
  const explorer = explorerBase(network)
  const created = activity.data?.createdTs

  // My position (value at current price; cost basis from my trades)
  const outN = market.outcomes.length
  const mine = myShares.slice(0, outN).map(s => Number((s.data as bigint | undefined) ?? 0n) / 1e18)
  const hasPosition = mine.some(v => v > 0.000001)
  const posValue = mine.reduce((s, v, i) => s + v * (prices[i] ?? 0), 0)
  const myTrades = address ? trades.filter(t => t.user.toLowerCase() === address.toLowerCase()) : []
  const invested = myTrades.reduce((s, t) => s + (t.kind === 'buy' ? 1 : -1) * Number(t.usdc) / 1e6, 0)

  const others = ((allRaw as Market[] | undefined) ?? []).filter(m => m.id !== market.id && m.status === MarketStatus.Open && (m.category === market.category)).slice(0, 3)

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'book', label: 'Order book' }, { key: 'activity', label: 'Activity', count: trades.length },
    { key: 'holders', label: 'Holders', count: activity.data?.holders.length }, { key: 'comments', label: 'Comments' },
  ]

  const share = async () => {
    const url = window.location.href
    try { if (navigator.share) await navigator.share({ title: market.question, url }); else { await navigator.clipboard.writeText(url); toast.success('Link copied') } } catch { /* cancelled */ }
  }

  return (
    <div className={embedded ? '' : 'max-w-7xl mx-auto px-4 sm:px-6 py-6'}>
      {!embedded && <Link to="/" className="flex items-center gap-2 text-sm mb-4 hover:opacity-80" style={{ color: 'var(--subtle)' }}><ArrowLeft size={14} />All Markets</Link>}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5">
        <div className="space-y-5 min-w-0">
          {/* Header */}
          <div className="rounded-xl p-5" style={card}>
            <div className="flex gap-4">
              {(market.imageUrl || meta.imageUrl) && !(market.imageUrl || '').startsWith('data:') && (
                <img src={market.imageUrl || meta.imageUrl} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" onError={e => { e.currentTarget.style.display = 'none' }} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-strong)', color: 'var(--muted)' }}>{market.category || 'General'}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-strong)', color: 'var(--muted)' }}>{market.marketType === MarketType.Binary ? 'Binary' : market.marketType === MarketType.MultipleChoice ? 'Multiple choice' : 'Scalar'}</span>
                  <span className={`text-xs font-medium ${statusColor(market.status)}`}>{statusLabel(market.status)}</span>
                  {isAdmin && market.status !== MarketStatus.Resolved && market.status !== MarketStatus.Cancelled && <button onClick={() => setEditing(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><Pencil size={11} />Edit</button>}
                  <button onClick={share} className="ml-auto p-1.5 rounded-lg hover:opacity-80" style={{ color: 'var(--subtle)' }} title="Share"><Share2 size={14} /></button>
                </div>
                <h1 className="display text-xl sm:text-2xl font-600 text-balance" style={{ color: 'var(--ink)' }}>{market.question}</h1>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
              <Stat label="Volume" value={activity.data ? compactUsd(volume) : '…'} />
              <Stat label="Liquidity" value={compactUsd(liquidity)} />
              <Stat label={tradable ? 'Closes in' : 'Closed'} value={tradable ? timeUntil(market.endTime) : new Date(Number(market.endTime) * 1000).toLocaleDateString()} icon={<Clock size={11} />} />
              <Stat label="Trades" value={activity.data ? String(trades.length) : '…'} />
            </div>
          </div>

          {/* Chart */}
          {!isScalar && (
            <div className="rounded-xl p-5" style={card}>
              <PriceChart outcomes={market.outcomes} snapshots={activity.data?.replay?.snapshots ?? null} times={activity.data?.snapshotTimes ?? []}
                livePrices={prices} createdTs={created ?? Math.floor(Date.now() / 1000) - 3600} selected={market.outcomes.length > 2 ? null : 0} live={tradable} />
              {activity.error && <p className="text-xs mt-2" style={{ color: 'var(--warning)' }}>History could not be loaded: {activity.error}</p>}
              {activity.data?.approximate && !activity.error && <p className="text-xs mt-2" style={{ color: 'var(--subtle)' }}>Some past events could not be reconciled, so history is hidden. Live prices are exact.</p>}
            </div>
          )}

          {/* Outcomes */}
          <div className="rounded-xl p-5" style={card}>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--ink-2)' }}>{isScalar ? 'Range' : 'Outcomes'}</h2>
            {isScalar ? <ScalarView market={market} prices={prices} /> : (
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {market.outcomes.map((name, i) => {
                  const win = isResolved && market.resolvedOutcome === BigInt(i)
                  return (
                    <div key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0" style={{ borderColor: 'var(--border)' }}>
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: outcomeColor(i) }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: win ? 'var(--success)' : 'var(--ink)' }}>{win && '✓ '}{name}</div>
                        <div className="text-xs" style={{ color: 'var(--subtle)' }}>Pool ${formatUsdc(market.outcomePools[i] ?? 0n)}{mine[i] > 0 ? ` · you hold ${mine[i].toFixed(2)}` : ''}</div>
                      </div>
                      <div className="text-lg font-semibold tabular-nums w-16 text-right" style={{ color: 'var(--ink)' }}>{pct(prices[i] ?? 0, 0)}</div>
                      {tradable && (
                        <button onClick={() => { setOutcome(i); document.getElementById('trade-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold tabular-nums" style={{ background: outcome === i ? 'var(--accent)' : 'var(--accent-bg)', color: outcome === i ? 'var(--accent-text)' : 'var(--accent)' }}>
                          Buy · {pct(prices[i] ?? 0, 0)}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Resolution / claim */}
          {(isResolved || isCancelled) && (
            <div className="rounded-xl p-5 flex items-start gap-3" style={card}>
              <CheckCircle size={18} style={{ color: isResolved ? 'var(--success)' : 'var(--danger)', flexShrink: 0 }} />
              <div className="flex-1">
                <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>{isCancelled ? 'Market cancelled' : 'Market resolved'}</h3>
                {isResolved && !isScalar && <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>Winner: <strong style={{ color: 'var(--success)' }}>{market.outcomes[Number(market.resolvedOutcome)]}</strong></p>}
                {isResolved && isScalar && <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>Resolved value: <strong style={{ color: 'var(--success)' }}>{market.resolvedScalarValue.toString()}</strong></p>}
                {isCancelled && <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>Cancelled markets refund what you paid.</p>}
                <button onClick={() => { if (!address) return toast.error('Connect wallet first.'); redeem.redeem(market.id) }} disabled={redeem.isPending || redeem.isConfirming}
                  className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--success)', color: '#0d1b2f' }}>
                  {redeem.isPending || redeem.isConfirming ? 'Claiming…' : isCancelled ? 'Claim refund' : 'Claim winnings'}
                </button>
              </div>
            </div>
          )}

          {/* AI insights + rules — always visible, no tabs */}
          <AIInsights marketId={marketId} outcomes={market.outcomes} prices={prices} meta={meta} metaLoaded={metaLoaded} isAdmin={isAdmin} active={!isResolved && !isCancelled} onMeta={setMeta} />
          <div className="rounded-xl p-5" style={card}>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--ink-2)' }}>Rules & details</h2>
            <Rules market={market} meta={meta} explorer={explorer} contract={activeContract()} created={created} feeBps={feeBps} />
          </div>

          {/* Tabs */}
          <div className="rounded-xl" style={card}>
            <div className="flex overflow-x-auto px-2" style={{ borderBottom: '1px solid var(--border)' }}>
              {tabs.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} className="px-3 py-3 text-sm font-medium whitespace-nowrap"
                  style={{ color: tab === t.key ? 'var(--ink)' : 'var(--subtle)', borderBottom: `2px solid ${tab === t.key ? 'var(--accent)' : 'transparent'}` }}>
                  {t.label}{t.count ? <span className="ml-1.5 text-xs" style={{ color: 'var(--subtle)' }}>{t.count}</span> : null}
                </button>
              ))}
            </div>
            <div className="p-5">
              {tab === 'book' && <OrderBook marketId={marketId} state={state} feeBps={feeBps} outcomes={market.outcomes} outcome={Math.min(outcome, outN - 1)} onOutcome={setOutcome} tradable={tradable}
                trades={trades} activityLoading={activity.loading} activityError={activity.error} onRetry={activity.retry} network={network} />}
              {tab === 'activity' && (!activity.data ? <ActivityState a={activity} /> : <ActivityTable trades={trades} outcomes={market.outcomes} me={address} network={network} />)}
              {tab === 'holders' && (!activity.data ? <ActivityState a={activity} /> : <Holders holders={activity.data?.holders ?? []} outcomes={market.outcomes} prices={prices} me={address} network={network} />)}
              {tab === 'comments' && <Comments marketId={marketId} admin={isAdmin} network={network} />}
            </div>
          </div>

          {/* News */}
          {news.length > 0 && (
            <div className="rounded-xl p-5" style={card}>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--ink-2)' }}><Newspaper size={14} />Related news</h2>
              <ul className="space-y-2.5">
                {news.map((n, i) => (
                  <li key={i}><a href={n.url} target="_blank" rel="noopener noreferrer" className="block hover:opacity-80">
                    <div className="text-sm" style={{ color: 'var(--ink)' }}>{n.title}</div>
                    <div className="text-xs" style={{ color: 'var(--subtle)' }}>{n.source}{n.published ? ` · ${timeAgo(Math.floor(new Date(n.published).getTime() / 1000))}` : ''}</div>
                  </a></li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div id="trade-panel" className="lg:sticky lg:top-20 space-y-4">
            {isAdmin && !isResolved && !isCancelled && <FundBox marketId={market.id} empty={market.totalLiquidity === 0n} onDone={() => { void refetch() }} />}
            <TradingPanel market={market} outcome={Math.min(outcome, outN - 1)} onOutcomeChange={setOutcome} onSuccess={() => { void refetch() }} />

            {address && hasPosition && (
              <div className="rounded-xl p-4 space-y-2" style={card}>
                <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>Your position</h3>
                {mine.map((v, i) => v > 0.000001 && (
                  <div key={i} className="flex justify-between text-xs tabular-nums"><span className="flex items-center gap-1.5" style={{ color: 'var(--muted)' }}><span className="w-2 h-2 rounded-full" style={{ background: outcomeColor(i) }} />{market.outcomes[i]}</span><span style={{ color: 'var(--ink-2)' }}>{v.toFixed(2)} sh · {usd(v * (prices[i] ?? 0))}</span></div>
                ))}
                <div className="flex justify-between text-xs pt-2 tabular-nums" style={{ borderTop: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--subtle)' }}>Value now</span><span className="font-semibold" style={{ color: 'var(--ink)' }}>{usd(posValue)}</span>
                </div>
                {myTrades.length > 0 && (
                  <div className="flex justify-between text-xs tabular-nums"><span style={{ color: 'var(--subtle)' }}>Net invested</span><span style={{ color: 'var(--ink-2)' }}>{usd(invested)}</span></div>
                )}
                {myTrades.length > 0 && (
                  <div className="flex justify-between text-xs tabular-nums"><span style={{ color: 'var(--subtle)' }}>Unrealized P/L</span>
                    <span className="font-semibold" style={{ color: posValue - invested >= 0 ? 'var(--success)' : 'var(--danger)' }}>{posValue - invested >= 0 ? '+' : ''}{usd(posValue - invested)}</span></div>
                )}
              </div>
            )}

            <div className="rounded-xl p-4 space-y-2.5" style={card}>
              <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>Market info</h3>
              <Info label="Trading ends" value={new Date(Number(market.endTime) * 1000).toLocaleString()} />
              <Info label="Resolution" value={new Date(Number(market.resolutionTime) * 1000).toLocaleString()} />
              <Info label="Pool" value={`$${formatUsdc(market.totalLiquidity)}`} />
              <Info label="Fees collected" value={`$${formatUsdc(market.feesCollected)}`} />
              <Info label="Market ID" value={`#${market.id}`} />
              <a href={`${explorer}/address/${market.creator}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs hover:opacity-70" style={{ color: 'var(--accent)' }}>Creator {shortAddr(market.creator)} <ExternalLink size={10} /></a>
            </div>
          </div>
        </div>
      </div>

      {editing && <MarketEditor market={market} meta={meta} onMeta={setMeta} onClose={() => { setEditing(false); if (params.get('edit')) { params.delete('edit'); setParams(params, { replace: true }) } }} onSaved={() => { void refetch() }} />}

      {others.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--ink-2)' }}>More in {market.category}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{others.map(m => <MarketCard key={String(m.id)} market={m} />)}</div>
        </div>
      )}
    </div>
  )
}

const Stat = ({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) => (
  <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-muted)' }}>
    <div className="text-xs" style={{ color: 'var(--subtle)' }}>{label}</div>
    <div className="text-sm font-semibold tabular-nums flex items-center gap-1" style={{ color: 'var(--ink)' }}>{icon}{value}</div>
  </div>
)
const Info = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3 text-xs"><span style={{ color: 'var(--subtle)' }}>{label}</span><span className="text-right" style={{ color: 'var(--muted)' }}>{value}</span></div>
)
function ActivityState({ a }: { a: { loading: boolean; error: string | null; retry: () => void } }) {
  if (a.error) return (
    <div className="text-center py-6">
      <p className="text-sm mb-2" style={{ color: 'var(--warning)' }}>{a.error}</p>
      <button onClick={a.retry} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>Try again</button>
    </div>
  )
  return <p className="text-sm py-6 text-center" style={{ color: 'var(--subtle)' }}>{a.loading ? 'Loading onchain activity…' : 'No activity found.'}</p>
}

function Skeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
        <div className="space-y-4">{[140, 340, 200].map((h, i) => <div key={i} className="rounded-xl animate-pulse" style={{ height: h, background: 'var(--surface)' }} />)}</div>
        <div className="h-96 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />
      </div>
    </div>
  )
}

function ScalarView({ market, prices }: { market: Market; prices: number[] }) {
  const lo = Number(market.scalarLow), hi = Number(market.scalarHigh), range = hi - lo
  const resolved = market.status === MarketStatus.Resolved
  const implied = lo + (prices[1] ?? 0.5) * range // short/long price mapped onto the range
  const at = (v: number) => Math.max(2, Math.min(98, range > 0 ? ((v - lo) / range) * 100 : 50))
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-sm" style={{ color: 'var(--muted)' }}><span>Low {lo}</span><span>High {hi}</span></div>
      <div className="relative h-3 rounded-full" style={{ background: 'linear-gradient(to right, var(--danger), var(--success))', opacity: 0.35 }} />
      <div className="relative h-0">
        <div className="absolute -top-6 w-4 h-4 rounded-full border-2" style={{ left: `${at(resolved ? Number(market.resolvedScalarValue) : implied)}%`, transform: 'translateX(-50%)', background: resolved ? 'var(--success)' : 'var(--accent)', borderColor: 'var(--bg)' }} />
      </div>
      <p className="text-sm text-center tabular-nums pt-2" style={{ color: 'var(--ink)' }}>{resolved ? `Resolved: ${market.resolvedScalarValue}` : `Market-implied value ≈ ${implied.toFixed(2)}`}</p>
    </div>
  )
}

function Rules({ market, meta, explorer, contract, created, feeBps }: {
  market: Market; meta: MarketMeta; explorer: string; contract: string; created?: number; feeBps: bigint
}) {
  return (
    <div className="space-y-5">
      {meta.description && <Section title="About"><p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink-2)' }}>{meta.description}</p></Section>}
      <Section title="Resolution criteria">
        <p className="text-sm whitespace-pre-wrap" style={{ color: meta.resolutionCriteria ? 'var(--ink-2)' : 'var(--subtle)' }}>
          {meta.resolutionCriteria || `Resolved by the market admin after ${new Date(Number(market.resolutionTime) * 1000).toLocaleString()} using publicly verifiable information. If the outcome cannot be determined the market may be cancelled and participants refunded.`}
        </p>
      </Section>
      {!!meta.sources?.length && (
        <Section title="Sources">
          <ul className="space-y-1">{meta.sources.map((s, i) => <li key={i}><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sm inline-flex items-center gap-1 hover:opacity-80" style={{ color: 'var(--accent)' }}>{s.title || s.url}<ExternalLink size={11} /></a></li>)}</ul>
        </Section>
      )}
      <Section title="Timeline">
        <ul className="text-sm space-y-1" style={{ color: 'var(--ink-2)' }}>
          {!!created && <li>Created · {new Date(created * 1000).toLocaleString()}</li>}
          <li>Trading ends · {new Date(Number(market.endTime) * 1000).toLocaleString()}</li>
          <li>Resolution · {new Date(Number(market.resolutionTime) * 1000).toLocaleString()}</li>
        </ul>
      </Section>
      <Section title="Contract">
        <div className="text-xs space-y-1.5" style={{ color: 'var(--muted)' }}>
          <div className="flex items-center gap-2 flex-wrap">Market contract <a href={`${explorer}/address/${contract}`} target="_blank" rel="noopener noreferrer" className="font-mono" style={{ color: 'var(--accent)' }}>{shortAddr(contract)}</a>
            <button onClick={() => { void navigator.clipboard.writeText(contract); toast.success('Address copied') }} style={{ color: 'var(--subtle)' }}><Copy size={11} /></button></div>
          <div>Trading fee {(Number(feeBps) / 100).toFixed(2)}% · pricing: constant-product AMM</div>
        </div>
      </Section>
    </div>
  )
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div><h3 className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--subtle)' }}>{title}</h3>{children}</div>
)

function FundBox({ marketId, empty, onDone }: { marketId: bigint; empty: boolean; onDone: () => void }) {
  const fund = useAddLiquidity()
  const [amount, setAmount] = useState('')
  const go = async () => {
    let raw = 0n
    try { raw = parseUnits(amount || '0', 6) } catch { /* invalid */ }
    if (raw <= 0n) return toast.error('Enter an amount greater than 0.')
    try { await fund.run(marketId, raw); toast.success('Market funded'); setAmount(''); onDone() } catch (e) { toast.error(parseOnchainError(e)) }
  }
  return (
    <div className="rounded-xl p-4 space-y-2" style={{ ...card, borderColor: empty ? 'var(--warning)' : 'var(--border)' }}>
      <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: empty ? 'var(--warning)' : 'var(--subtle)' }}>{empty ? 'Fund this market to open trading' : 'Add liquidity (admin)'}</h3>
      <div className="flex gap-2">
        <input type="number" min="0" step="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="USDC amount" className="flex-1 rounded-lg px-3 py-2 text-sm outline-none tabular-nums" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }} />
        <button onClick={go} disabled={fund.busy} className="px-4 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>{fund.step === 'approving' ? 'Approving…' : fund.step === 'adding' ? 'Adding…' : 'Fund'}</button>
      </div>
    </div>
  )
}
