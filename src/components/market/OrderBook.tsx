import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import { PREDARC_ABI } from '../../lib/contract'
import { activeChainId, activeContract, type Network } from '../../lib/adminConfig'
import { applyBuy, applySell, pricesFromPools, SHARE_DEN, type PoolState, type TradeEvent } from '../../lib/marketMath'
import { explorerBase, outcomeColor, pct, perShare, shortAddr, timeAgo, usd } from './format'

const BUY_SIZES = [1, 5, 10, 25, 50, 100, 250, 500]
const SELL_SIZES = [1, 5, 10, 25, 50, 100, 250, 500]

type T = TradeEvent & { ts: number }

/**
 * Real data only. Predarc is an AMM, so there are no resting limit orders: the "book" is the pool's
 * live depth, quoted by the contract itself (getSharesOut / getUsdcOut), next to the actual order flow.
 */
export default function OrderBook({ marketId, state, feeBps, outcomes, outcome, onOutcome, tradable, trades, activityLoading, activityError, onRetry, network }: {
  marketId: bigint; state: PoolState; feeBps: bigint; outcomes: string[]; outcome: number; onOutcome: (i: number) => void; tradable: boolean
  trades: T[]; activityLoading: boolean; activityError: string | null; onRetry: () => void; network: Network
}) {
  const price = pricesFromPools(state.pools)[outcome] ?? 0
  const base = { address: activeContract(), abi: PREDARC_ABI, chainId: activeChainId() } as const
  const { data, isLoading, isError, refetch } = useReadContracts({
    contracts: [
      ...BUY_SIZES.map(s => ({ ...base, functionName: 'getSharesOut' as const, args: [marketId, BigInt(outcome), BigInt(s) * 1_000_000n] as const })),
      ...SELL_SIZES.map(s => ({ ...base, functionName: 'getUsdcOut' as const, args: [marketId, BigInt(outcome), BigInt(s) * 10n ** 18n] as const })),
    ],
    query: { refetchInterval: 8000 },
  })

  const { asks, bids } = useMemo(() => {
    const asks: { spend: number; shares: number; per: number; after: number }[] = []
    const bids: { shares: number; receive: number; per: number; after: number }[] = []
    if (!data) return { asks, bids }
    BUY_SIZES.forEach((size, i) => {
      const r = data[i]; if (r?.status !== 'success') return
      const out = r.result as bigint; if (out === 0n) return
      const after = applyBuy(state, outcome, BigInt(size) * 1_000_000n, out, feeBps)
      const shares = Number(out) / 1e18
      asks.push({ spend: size, shares, per: size / shares, after: pricesFromPools(after.pools)[outcome] })
    })
    SELL_SIZES.forEach((size, i) => {
      const r = data[BUY_SIZES.length + i]; if (r?.status !== 'success') return
      const out = r.result as bigint; if (out === 0n) return
      const after = applySell(state, outcome, BigInt(size) * SHARE_DEN * 1_000_000n)
      bids.push({ shares: size, receive: Number(out) / 1e6, per: Number(out) / 1e6 / size, after: pricesFromPools(after.pools)[outcome] })
    })
    return { asks, bids }
  }, [data, state, outcome, feeBps])

  const maxA = Math.max(...asks.map(a => a.spend), 1), maxB = Math.max(...bids.map(b => b.shares), 1)
  const recent = trades.slice(0, 8)

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {outcomes.map((o, i) => (
          <button key={i} onClick={() => onOutcome(i)} className="px-3 py-1 rounded-lg text-xs font-medium"
            style={{ background: outcome === i ? outcomeColor(i) : 'var(--surface-strong)', color: outcome === i ? '#0d1b2f' : 'var(--muted)' }}>{o}</button>
        ))}
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--subtle)' }}>
        Predarc is an automated market maker: orders fill instantly against the pool. These are live quotes read from the contract for {outcomes[outcome]}
        {' '}— what you would actually get right now at each size (fee {(Number(feeBps) / 100).toFixed(2)}% included).
      </p>
      {!tradable && <p className="text-xs mb-3" style={{ color: 'var(--warning)' }}>Trading is closed for this market.</p>}
      {isError && <p className="text-xs mb-3" style={{ color: 'var(--danger)' }}>Could not read quotes from the contract. <button className="underline" onClick={() => { void refetch() }}>Retry</button></p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Side title="Buy" color="var(--danger)" head={['Spend', 'Shares', '$/share', 'Price after']} loading={isLoading}
          rows={asks.map(a => ({ w: a.spend / maxA, cells: [`$${a.spend}`, a.shares.toFixed(2), perShare(a.per), pct(a.after, 1)] }))} />
        <Side title="Sell" color="var(--success)" head={['Shares', 'Receive', '$/share', 'Price after']} loading={isLoading}
          rows={bids.map(b => ({ w: b.shares / maxB, cells: [String(b.shares), usd(b.receive), perShare(b.per), pct(b.after, 1)] }))} />
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4 text-center">
        {[['Implied chance', pct(price, 1)], ['Pool liquidity', usd(Number(state.total) / 1e6)], ['Outcome pool', usd(Number(state.pools[outcome] ?? 0n) / 1e6)]].map(([l, v]) => (
          <div key={l} className="rounded-lg py-2" style={{ background: 'var(--surface-muted)' }}>
            <div className="text-xs" style={{ color: 'var(--subtle)' }}>{l}</div>
            <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{v}</div>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-2)' }}>Recent orders</div>
        {activityError && !trades.length ? (
          <p className="text-xs" style={{ color: 'var(--warning)' }}>Could not load orders: {activityError} <button className="underline" onClick={onRetry}>Retry</button></p>
        ) : activityLoading && !trades.length ? (
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>Loading orders from the chain…</p>
        ) : recent.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>No orders yet.</p>
        ) : (
          <div className="space-y-1">
            {recent.map(t => {
              const shares = Number(t.shares) / 1e18, amt = Number(t.usdc) / 1e6
              return (
                <a key={`${t.txHash}-${t.logIndex}`} href={`${explorerBase(network)}/tx/${t.txHash}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs tabular-nums px-2 py-1.5 rounded" style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
                  <span className="font-semibold uppercase w-8" style={{ color: t.kind === 'buy' ? 'var(--success)' : 'var(--danger)' }}>{t.kind}</span>
                  <span className="flex items-center gap-1 flex-1 truncate"><span className="w-2 h-2 rounded-full" style={{ background: outcomeColor(t.outcome) }} />{shares.toFixed(2)} {outcomes[t.outcome]} · {usd(amt)}</span>
                  <span style={{ color: 'var(--subtle)' }}>{shortAddr(t.user)} · {timeAgo(t.ts)}</span>
                </a>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Side({ title, color, head, rows, loading }: { title: string; color: string; head: string[]; rows: { w: number; cells: string[] }[]; loading: boolean }) {
  return (
    <div>
      <div className="text-xs font-semibold mb-1.5" style={{ color }}>{title}</div>
      <div className="grid grid-cols-4 text-xs px-2 pb-1" style={{ color: 'var(--subtle)' }}>{head.map((h, k) => <span key={h} className={k === 0 ? 'text-left' : 'text-right'}>{h}</span>)}</div>
      <div className="space-y-0.5">
        {loading && <p className="text-xs px-2 py-3" style={{ color: 'var(--subtle)' }}>Reading quotes from the contract…</p>}
        {!loading && rows.length === 0 && <p className="text-xs px-2 py-3" style={{ color: 'var(--subtle)' }}>No liquidity to fill orders at these sizes.</p>}
        {rows.map((r, i) => (
          <div key={i} className="relative grid grid-cols-4 text-xs px-2 py-1.5 rounded tabular-nums" style={{ color: 'var(--ink-2)' }}>
            <div className="absolute inset-y-0 right-0 rounded" style={{ width: `${Math.max(4, r.w * 100)}%`, background: color, opacity: 0.1 }} />
            {r.cells.map((c, k) => <span key={k} className={`relative ${k === 0 ? 'text-left' : 'text-right'}`}>{c}</span>)}
          </div>
        ))}
      </div>
    </div>
  )
}
