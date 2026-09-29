import type { TradeEvent } from '../../lib/marketMath'
import { explorerBase, outcomeColor, perShare, shortAddr, timeAgo, usd } from './format'
import type { Network } from '../../lib/adminConfig'
import { useState } from 'react'

type T = TradeEvent & { ts: number }

export default function ActivityTable({ trades, outcomes, me, network }: { trades: T[]; outcomes: string[]; me?: string; network: Network }) {
  const [filter, setFilter] = useState<'all' | 'mine'>('all')
  const rows = (filter === 'mine' && me ? trades.filter(t => t.user.toLowerCase() === me.toLowerCase()) : trades).slice(0, 100)
  return (
    <div>
      <div className="flex gap-1.5 mb-3">
        {(['all', 'mine'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} disabled={f === 'mine' && !me} className="px-3 py-1 rounded-lg text-xs font-medium disabled:opacity-40"
            style={{ background: filter === f ? 'var(--accent-bg)' : 'var(--surface-strong)', color: filter === f ? 'var(--accent)' : 'var(--muted)' }}>
            {f === 'all' ? 'All trades' : 'My trades'}
          </button>
        ))}
        <span className="ml-auto text-xs self-center" style={{ color: 'var(--subtle)' }}>{trades.length} total</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: 'var(--subtle)' }}>No trades yet — be the first.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr style={{ color: 'var(--subtle)' }} className="text-left">
                <th className="py-1.5 font-medium">Trader</th><th className="font-medium">Side</th><th className="font-medium">Outcome</th>
                <th className="font-medium text-right">Shares</th><th className="font-medium text-right">$/share</th><th className="font-medium text-right">Amount</th><th className="font-medium text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(t => {
                const shares = Number(t.shares) / 1e18, amt = Number(t.usdc) / 1e6
                return (
                  <tr key={`${t.txHash}-${t.logIndex}`} style={{ borderTop: '1px solid var(--border)', color: 'var(--ink-2)' }}>
                    <td className="py-2"><a href={`${explorerBase(network)}/address/${t.user}`} target="_blank" rel="noopener noreferrer" style={{ color: me && t.user.toLowerCase() === me.toLowerCase() ? 'var(--accent)' : undefined }}>{shortAddr(t.user)}</a></td>
                    <td style={{ color: t.kind === 'buy' ? 'var(--success)' : 'var(--danger)' }} className="font-semibold uppercase">{t.kind}</td>
                    <td><span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: outcomeColor(t.outcome) }} />{outcomes[t.outcome]}</span></td>
                    <td className="text-right">{shares.toFixed(2)}</td>
                    <td className="text-right">{shares > 0 ? perShare(amt / shares) : '—'}</td>
                    <td className="text-right">{usd(amt)}</td>
                    <td className="text-right"><a href={`${explorerBase(network)}/tx/${t.txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--subtle)' }}>{timeAgo(t.ts)}</a></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
