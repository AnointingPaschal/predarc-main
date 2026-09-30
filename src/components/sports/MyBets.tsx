import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, useConfig } from 'wagmi'
import { readContract } from 'wagmi/actions'
import { SPORTS_ABI } from '../../lib/sportsAbi'
import { sportsAddress, type SportsLine } from '../../lib/sportsChain'
import { activeChainId } from '../../lib/adminConfig'
import type { SportsRecord } from '../../lib/sportsCore'

type Row = { line: SportsLine; shares: bigint[]; claimed: boolean; cost: bigint }
const usd = (v: bigint) => (Number(v) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })

export default function MyBets({ records }: { records: SportsRecord[] }) {
  const { address } = useAccount()
  const wagmi = useConfig()
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => {
    const contract = sportsAddress(); const chainId = activeChainId()
    if (!address || !contract) { setRows([]); return }
    let dead = false
    ;(async () => {
      try {
        const ids = (await readContract(wagmi, { address: contract, chainId, abi: SPORTS_ABI, functionName: 'getUserLines', args: [address] })) as bigint[]
        const out: Row[] = []
        for (let i = 0; i < ids.length; i += 40) {
          const chunk = ids.slice(i, i + 40)
          const lines = (await readContract(wagmi, { address: contract, chainId, abi: SPORTS_ABI, functionName: 'getLines', args: [chunk] })) as unknown as SportsLine[]
          for (const l of lines) {
            const [shares, claimed, cost] = await Promise.all([
              readContract(wagmi, { address: contract, chainId, abi: SPORTS_ABI, functionName: 'getUserShares', args: [l.id, address] }),
              readContract(wagmi, { address: contract, chainId, abi: SPORTS_ABI, functionName: 'claimed', args: [l.id, address] }),
              readContract(wagmi, { address: contract, chainId, abi: SPORTS_ABI, functionName: 'netCost', args: [l.id, address] }),
            ])
            out.push({ line: l, shares: [...(shares as bigint[])], claimed: claimed as boolean, cost: cost as bigint })
          }
        }
        if (!dead) setRows(out.reverse())
      } catch { if (!dead) setRows([]) }
    })()
    return () => { dead = true }
  }, [address, wagmi])

  const where = (id: bigint) => records.find(r => Object.values(r.markets).includes(id.toString()))
  if (!address) return <p className="py-16 text-center text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to see your bets.</p>
  if (!rows) return <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-16 rounded-xl skeleton" />)}</div>
  if (!rows.length) return <p className="py-16 text-center text-sm" style={{ color: 'var(--muted)' }}>You have not placed any sports bets yet.</p>
  return (
    <div className="space-y-2">
      {rows.map(({ line, shares, claimed, cost }) => {
        const rec = where(line.id)
        const won = line.status === 1 && (shares[Number(line.winning)] ?? 0n) > 0n
        const state = line.status === 2 ? 'Cancelled' : line.status === 1 ? (won ? (claimed ? 'Won · paid' : 'Won · claim it') : 'Lost') : 'Open'
        const tone = won ? 'var(--accent)' : line.status === 1 ? 'var(--subtle)' : 'var(--muted)'
        return (
          <Link key={line.id.toString()} to={rec ? `/sports/${rec.eventId}` : '/sports'} className="flex items-center gap-3 rounded-xl px-4 py-3 hover:opacity-90" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{line.question}</p>
              <p className="text-xs truncate" style={{ color: 'var(--subtle)' }}>{line.outcomes.map((o, i) => (shares[i] ?? 0n) > 0n ? `${o}: ${usd(shares[i])} shares` : '').filter(Boolean).join(' · ') || `Staked $${usd(cost)}`}</p>
            </div>
            <span className="text-xs font-semibold whitespace-nowrap" style={{ color: tone }}>{state}</span>
          </Link>
        )
      })}
    </div>
  )
}
