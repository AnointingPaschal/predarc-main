import { useMemo } from 'react'
import { buyLadder, sellLadder, pricesFromPools, type PoolState } from '../../lib/marketMath'
import { outcomeColor, pct, perShare } from './format'

const BUY_SIZES = [5, 10, 25, 50, 100, 250, 500, 1000]

/**
 * Predarc is an AMM, so there are no resting orders. The "order book" shows the pool's depth:
 * what the pool would fill right now at each size, and how far that trade would move the price.
 */
export default function OrderBook({ state, feeBps, outcomes, outcome, onOutcome, tradable }: {
  state: PoolState; feeBps: bigint; outcomes: string[]; outcome: number; onOutcome: (i: number) => void; tradable: boolean
}) {
  const price = pricesFromPools(state.pools)[outcome] ?? 0
  const liquidityUsd = Number(state.total) / 1e6
  const asks = useMemo(() => buyLadder(state, outcome, feeBps, BUY_SIZES.filter(s => s <= Math.max(50, liquidityUsd * 25))), [state, outcome, feeBps, liquidityUsd])
  const sizes = useMemo(() => [1, 5, 10, 25, 50, 100, 250, 500], [])
  const bids = useMemo(() => sellLadder(state, outcome, feeBps, sizes), [state, outcome, feeBps, sizes])
  const maxAsk = Math.max(...asks.map(a => a.usdc), 1)
  const maxBid = Math.max(...bids.map(b => b.size), 1)
  const bestAsk = asks[0]?.avgPrice, bestBid = bids[0]?.avgPrice

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {outcomes.map((o, i) => (
          <button key={i} onClick={() => onOutcome(i)} className="px-3 py-1 rounded-lg text-xs font-medium"
            style={{ background: outcome === i ? outcomeColor(i) : 'var(--surface-strong)', color: outcome === i ? '#0d1b2f' : 'var(--muted)' }}>{o}</button>
        ))}
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--subtle)' }}>
        Predarc uses an automated market maker, so trades fill instantly against the pool instead of waiting for a counterparty.
        This ladder shows the average price you would get at each size.
      </p>
      {!tradable && <p className="text-xs mb-3" style={{ color: 'var(--warning)' }}>Trading is closed — depth shown for reference.</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Side title="Buy (asks)" color="var(--danger)" head={['Spend', 'Shares', '$/share', 'Impact']}
          rows={asks.map(a => ({ w: a.usdc / maxAsk, cells: [`$${a.usdc}`, a.shares.toFixed(2), perShare(a.avgPrice), `+${a.impactPct.toFixed(1)}pt`] }))} />
        <Side title="Sell (bids)" color="var(--success)" head={['Shares', 'Receive', '$/share', 'Impact']}
          rows={bids.map(b => ({ w: b.size / maxBid, cells: [String(b.size), `$${b.usdc.toFixed(2)}`, perShare(b.avgPrice), `${b.impactPct.toFixed(1)}pt`] }))} />
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4 text-center">
        {[['Implied chance', pct(price, 1)], ['Best buy $/share', bestAsk ? perShare(bestAsk) : '—'], ['Best sell $/share', bestBid ? perShare(bestBid) : '—']].map(([l, v]) => (
          <div key={l} className="rounded-lg py-2" style={{ background: 'var(--surface-muted)' }}>
            <div className="text-xs" style={{ color: 'var(--subtle)' }}>{l}</div>
            <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{v}</div>
          </div>
        ))}
      </div>
      <p className="text-xs mt-3" style={{ color: 'var(--subtle)' }}>
        Pool depth ${liquidityUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })} · fee {(Number(feeBps) / 100).toFixed(2)}% · {outcomes[outcome]} at {pct(price)}
      </p>
    </div>
  )
}

function Side({ title, color, head, rows }: { title: string; color: string; head: string[]; rows: { w: number; cells: string[] }[] }) {
  return (
    <div>
      <div className="text-xs font-semibold mb-1.5" style={{ color }}>{title}</div>
      <div className="grid grid-cols-4 text-xs px-2 pb-1" style={{ color: 'var(--subtle)' }}>{head.map(h => <span key={h} className="text-right first:text-left">{h}</span>)}</div>
      <div className="space-y-0.5">
        {rows.length === 0 && <p className="text-xs px-2 py-3" style={{ color: 'var(--subtle)' }}>No depth available.</p>}
        {rows.map((r, i) => (
          <div key={i} className="relative grid grid-cols-4 text-xs px-2 py-1.5 rounded tabular-nums" style={{ color: 'var(--ink-2)' }}>
            <div className="absolute inset-y-0 right-0 rounded" style={{ width: `${Math.max(4, r.w * 100)}%`, background: color, opacity: 0.1 }} />
            {r.cells.map((c, k) => <span key={k} className="relative text-right first:text-left">{c}</span>)}
          </div>
        ))}
      </div>
    </div>
  )
}
