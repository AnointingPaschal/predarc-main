// Betting panel for one PredarcSports line: pick an outcome, stake USDC, see the payout, cash out or claim.
import { useEffect, useMemo, useState } from 'react'
import { useAccount, useChainId, useConfig, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt, simulateContract } from 'wagmi/actions'
import { erc20Abi, parseUnits } from 'viem'
import { toast } from 'sonner'
import { Loader2, Wallet, TrendingUp } from 'lucide-react'
import { SPORTS_ABI } from '../../lib/sportsAbi'
import { sportsAddress, type SportsLine } from '../../lib/sportsChain'
import { activeChainId, activeUsdc } from '../../lib/adminConfig'
import { parseOnchainError } from '../../lib/errors'
import { decimalOdds } from './parts'

const usd = (v: bigint | number | undefined, d = 2) => (Number(v ?? 0) / 1e6).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d })
const CHIPS = [1, 5, 10, 25]

export default function BetPanel({ line, outcome, onOutcome, onDone }: { line: SportsLine; outcome: number; onOutcome: (i: number) => void; onDone?: () => void }) {
  const contract = sportsAddress() as `0x${string}`, chainId = activeChainId(), usdc = activeUsdc()
  const wagmi = useConfig()
  const { address } = useAccount()
  const walletChain = useChainId()
  const { switchChain } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState('')
  const id = line.id
  const open = line.status === 0 && Number(line.endTime) * 1000 > Date.now()
  const stake = useMemo(() => { try { return amount ? parseUnits(amount, 6) : 0n } catch { return 0n } }, [amount])
  const on = !!contract && !!address

  const q = { chainId, query: { enabled: on, refetchInterval: 15_000 } }
  const { data: balance, refetch: rBal } = useReadContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [address as `0x${string}`], ...q })
  const { data: allowance, refetch: rAllow } = useReadContract({ address: usdc, abi: erc20Abi, functionName: 'allowance', args: [address as `0x${string}`, contract], ...q })
  const { data: shares, refetch: rShares } = useReadContract({ address: contract, abi: SPORTS_ABI, functionName: 'getUserShares', args: [id, address as `0x${string}`], ...q })
  const { data: cost, refetch: rCost } = useReadContract({ address: contract, abi: SPORTS_ABI, functionName: 'netCost', args: [id, address as `0x${string}`], ...q })
  const { data: claimed, refetch: rClaimed } = useReadContract({ address: contract, abi: SPORTS_ABI, functionName: 'claimed', args: [id, address as `0x${string}`], ...q })
  const { data: minBet } = useReadContract({ address: contract, abi: SPORTS_ABI, functionName: 'minBet', chainId })
  const { data: quoteOut } = useReadContract({ address: contract, abi: SPORTS_ABI, functionName: 'quoteBuy', args: [id, BigInt(outcome), stake], chainId, query: { enabled: !!contract && stake > 0n } })
  const my = (shares as bigint[] | undefined) ?? []
  const mine = my[outcome] ?? 0n
  const { data: sellOut } = useReadContract({ address: contract, abi: SPORTS_ABI, functionName: 'quoteSell', args: [id, BigInt(outcome), mine], chainId, query: { enabled: !!contract && mine > 0n && open } })

  const refresh = () => { void rBal(); void rAllow(); void rShares(); void rCost(); void rClaimed(); onDone?.() }
  useEffect(() => { setAmount('') }, [id])

  const weights = line.pools.map(p => (p > 0n ? 1 / Number(p) : 0)), wsum = weights.reduce((a, b) => a + b, 0)
  const prob = (i: number) => (wsum ? weights[i] / wsum : 0)
  const shareOut = (quoteOut as bigint | undefined) ?? 0n
  const odds = stake > 0n && shareOut > 0n ? Number(shareOut) / Number(stake) : prob(outcome) > 0 ? 1 / prob(outcome) : 0
  const min = (minBet as bigint | undefined) ?? 100_000n

  const run = async (label: string, req: Record<string, unknown>, ok: string) => {
    setBusy(label)
    try {
      if (walletChain !== chainId) { switchChain({ chainId }); return }
      await simulateContract(wagmi, req as never)
      const hash = await writeContractAsync(req as never)
      const rc = await waitForTransactionReceipt(wagmi, { hash, chainId })
      if (rc.status !== 'success') throw new Error('Transaction reverted')
      toast.success(ok); refresh(); return true
    } catch (e) { toast.error(parseOnchainError(e)) } finally { setBusy('') }
  }

  const place = async () => {
    if (!address) return toast.error('Connect your wallet first.')
    if (stake < min) return toast.error(`Minimum bet is ${usd(min)} USDC.`)
    if (balance !== undefined && stake > (balance as bigint)) return toast.error('Not enough USDC in your wallet.')
    if (((allowance as bigint | undefined) ?? 0n) < stake) {
      const done = await run('approve', { address: usdc, chainId, abi: erc20Abi, functionName: 'approve', args: [contract, stake * 20n], account: address }, 'USDC approved. Now place your bet.')
      if (!done) return
    }
    const minShares = (shareOut * 97n) / 100n
    await run('buy', { address: contract, chainId, abi: SPORTS_ABI, functionName: 'buy', args: [id, BigInt(outcome), stake, minShares], account: address }, 'Bet placed!')
  }
  const cashOut = () => run('sell', { address: contract, chainId, abi: SPORTS_ABI, functionName: 'sell', args: [id, BigInt(outcome), mine, (((sellOut as bigint | undefined) ?? 0n) * 97n) / 100n], account: address }, 'Cashed out!')
  const claim = () => run('claim', { address: contract, chainId, abi: SPORTS_ABI, functionName: 'claim', args: [id], account: address }, 'Paid out to your wallet!')

  const winShares = line.status === 1 ? my[Number(line.winning)] ?? 0n : 0n
  const canClaim = !claimed && ((line.status === 1 && winShares > 0n) || (line.status === 2 && ((cost as bigint | undefined) ?? 0n) > 0n))
  const anyPosition = my.some(s => s > 0n)

  return (
    <div className="rounded-2xl p-4 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>Your bet</p>
        <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--ink)' }}>{line.question}</p>
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${line.outcomes.length}, minmax(0, 1fr))` }}>
        {line.outcomes.map((n, i) => {
          const sel = i === outcome
          return (
            <button key={i} onClick={() => onOutcome(i)} className="rounded-xl px-2 py-2 text-center theme-transition"
              style={{ background: sel ? 'var(--accent)' : 'var(--surface-muted)', color: sel ? 'var(--accent-text)' : 'var(--ink)', border: '1px solid ' + (sel ? 'var(--accent)' : 'var(--border)') }}>
              <span className="block text-[10.5px] truncate opacity-75">{n}</span>
              <span className="block text-sm font-bold tabular-nums">{decimalOdds(prob(i))}</span>
            </button>
          )
        })}
      </div>

      {line.status === 0 && (open ? (
        <>
          <div>
            <div className="flex items-center justify-between text-xs mb-1" style={{ color: 'var(--subtle)' }}>
              <span>Stake (USDC)</span>
              {address && <button className="inline-flex items-center gap-1 hover:opacity-80" onClick={() => balance !== undefined && setAmount((Number(balance) / 1e6).toString())}><Wallet size={11} />{usd(balance as bigint | undefined)}</button>}
            </div>
            <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0.00"
              className="w-full px-3 py-2.5 rounded-xl text-lg font-semibold tabular-nums outline-none bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--ink)]" />
            <div className="flex gap-2 mt-2">
              {CHIPS.map(c => <button key={c} onClick={() => setAmount(String(c))} className="flex-1 py-1 rounded-lg text-xs font-medium" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--muted)' }}>${c}</button>)}
            </div>
          </div>
          <div className="rounded-xl p-3 space-y-1.5 text-sm" style={{ background: 'var(--surface-muted)' }}>
            <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Odds</span><b className="tabular-nums">{odds ? odds.toFixed(2) : '—'}</b></div>
            <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Potential payout</span><b className="tabular-nums" style={{ color: 'var(--accent)' }}>{stake > 0n ? `$${usd(shareOut)}` : '—'}</b></div>
            {stake > 0n && shareOut > stake && <div className="flex justify-between text-xs"><span style={{ color: 'var(--subtle)' }}>Profit if it wins</span><span className="tabular-nums">+${usd(shareOut - stake)}</span></div>}
          </div>
          <button onClick={place} disabled={!!busy || stake === 0n} className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
            {busy ? <><Loader2 size={15} className="animate-spin" />{busy === 'approve' ? 'Approving…' : 'Placing bet…'}</> : !address ? 'Connect wallet to bet' : walletChain !== chainId ? 'Switch network' : ((allowance as bigint | undefined) ?? 0n) < stake ? 'Approve USDC & bet' : 'Place bet'}
          </button>
          <p className="text-[11px]" style={{ color: 'var(--subtle)' }}>Each winning share pays $1. Min bet ${usd(min)}. A small fee is taken on bets, none on cash-outs.</p>
        </>
      ) : <p className="text-sm rounded-xl p-3" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>Betting has closed. The result is settled automatically after the final whistle.</p>)}

      {line.status === 1 && <p className="text-sm rounded-xl p-3" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>Settled. Winning outcome: <b style={{ color: 'var(--ink)' }}>{line.outcomes[Number(line.winning)]}</b></p>}
      {line.status === 2 && <p className="text-sm rounded-xl p-3" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>This line was cancelled. Stakes are refunded.</p>}

      {address && anyPosition && (
        <div className="rounded-xl p-3 space-y-2" style={{ border: '1px solid var(--border)' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider inline-flex items-center gap-1" style={{ color: 'var(--subtle)' }}><TrendingUp size={11} />Your position</p>
          {line.outcomes.map((n, i) => (my[i] ?? 0n) > 0n && (
            <div key={i} className="flex justify-between text-sm"><span>{n}</span><span className="tabular-nums"><b>{usd(my[i])}</b> shares <span style={{ color: 'var(--subtle)' }}>· pays ${usd(my[i])}</span></span></div>
          ))}
          {open && mine > 0n && (
            <button onClick={cashOut} disabled={!!busy} className="w-full py-2 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              {busy === 'sell' ? 'Cashing out…' : `Cash out ${line.outcomes[outcome]} now · $${usd(sellOut as bigint | undefined)}`}
            </button>
          )}
        </div>
      )}
      {canClaim && (
        <button onClick={claim} disabled={!!busy} className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
          {busy === 'claim' ? 'Claiming…' : line.status === 1 ? `Claim winnings · $${usd(winShares)}` : 'Claim refund'}
        </button>
      )}
    </div>
  )
}
