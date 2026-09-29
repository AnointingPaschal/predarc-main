import { useState } from 'react'
import type { Holder } from '../../lib/marketMath'
import { explorerBase, outcomeColor, shortAddr, usd } from './format'
import type { Network } from '../../lib/adminConfig'

export default function Holders({ holders, outcomes, prices, me, network }: { holders: Holder[]; outcomes: string[]; prices: number[]; me?: string; network: Network }) {
  const [o, setO] = useState(0)
  const list = holders.filter(h => (h.shares[o] ?? 0) > 0.000001).sort((a, b) => b.shares[o] - a.shares[o]).slice(0, 25)
  const supply = holders.reduce((s, h) => s + (h.shares[o] ?? 0), 0)
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {outcomes.map((n, i) => (
          <button key={i} onClick={() => setO(i)} className="px-3 py-1 rounded-lg text-xs font-medium"
            style={{ background: o === i ? outcomeColor(i) : 'var(--surface-strong)', color: o === i ? '#0d1b2f' : 'var(--muted)' }}>{n}</button>
        ))}
      </div>
      {list.length === 0 ? <p className="text-sm py-6 text-center" style={{ color: 'var(--subtle)' }}>No one holds {outcomes[o]} shares yet.</p> : (
        <table className="w-full text-xs tabular-nums">
          <thead><tr style={{ color: 'var(--subtle)' }} className="text-left"><th className="py-1.5 font-medium">#</th><th className="font-medium">Holder</th><th className="font-medium text-right">Shares</th><th className="font-medium text-right">Value</th><th className="font-medium text-right">Share</th></tr></thead>
          <tbody>
            {list.map((h, i) => (
              <tr key={h.address} style={{ borderTop: '1px solid var(--border)', color: 'var(--ink-2)' }}>
                <td className="py-2" style={{ color: 'var(--subtle)' }}>{i + 1}</td>
                <td><a href={`${explorerBase(network)}/address/${h.address}`} target="_blank" rel="noopener noreferrer" style={{ color: me && h.address.toLowerCase() === me.toLowerCase() ? 'var(--accent)' : undefined }}>{shortAddr(h.address)}{me && h.address.toLowerCase() === me.toLowerCase() ? ' (you)' : ''}</a></td>
                <td className="text-right">{h.shares[o].toFixed(2)}</td>
                <td className="text-right">{usd(h.shares[o] * (prices[o] ?? 0))}</td>
                <td className="text-right">
                  <span className="inline-block align-middle mr-1.5 h-1.5 rounded-full" style={{ width: 34 * (h.shares[o] / (supply || 1)), background: outcomeColor(o) }} />
                  {supply ? ((h.shares[o] / supply) * 100).toFixed(1) : '0'}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs mt-3" style={{ color: 'var(--subtle)' }}>Value = shares × current price. Positions are computed from onchain trades.</p>
    </div>
  )
}
