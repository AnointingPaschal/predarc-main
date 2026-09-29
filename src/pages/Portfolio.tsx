import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, useConfig, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { ConnectKitButton } from 'connectkit'
import { erc20Abi, isAddress, parseUnits } from 'viem'
import { toast } from 'sonner'
import { Award, ArrowUpRight, Copy, Download, ExternalLink, RefreshCw, Send, TrendingUp, Wallet } from 'lucide-react'
import { useUsdcBalance } from '../hooks/useMarkets'
import { usePortfolio } from '../hooks/usePortfolio'
import { PREDARC_ABI, MarketStatus } from '../lib/contract'
import { activeChainId, activeContract, activeUsdc, useNetwork } from '../lib/adminConfig'
import { parseOnchainError } from '../lib/errors'
import type { Position } from '../lib/portfolio'
import { explorerBase, outcomeColor, pct, perShare, shortAddr, timeAgo, usd } from '../components/market/format'

const card = { background: 'var(--surface)', border: '1px solid var(--border)' } as const
type Filter = 'active' | 'claimable' | 'closed' | 'all'

export default function Portfolio() {
  const { address } = useAccount()
  const network = useNetwork()
  const { data: balanceRaw, refetch: refetchBalance } = useUsdcBalance(address)
  const pf = usePortfolio(address)
  const [filter, setFilter] = useState<Filter>('active')
  const wagmiConfig = useConfig()
  const { writeContractAsync } = useWriteContract()
  const [claiming, setClaiming] = useState(false)

  const balance = balanceRaw !== undefined ? Number(balanceRaw as bigint) / 1e6 : undefined
  const explorer = explorerBase(network)

  const stats = useMemo(() => {
    const value = pf.positions.reduce((s, p) => s + p.value, 0)
    const claimable = pf.positions.reduce((s, p) => s + p.claimable, 0)
    const atRisk = pf.positions.filter(p => p.status === 'active' || p.status === 'closed').reduce((s, p) => s + p.costBasis, 0)
    // Lifetime P/L per market from trade history: what you hold/can claim + what you took out − what you put in
    let invested = 0, pnl: number | null = null
    let wins = 0, losses = 0
    if (pf.trades) {
      const byMarket = new Map<string, { in: number; out: number }>()
      pf.trades.forEach(t => {
        const k = String(t.marketId); const m = byMarket.get(k) ?? { in: 0, out: 0 }
        if (t.kind === 'buy') m.in += Number(t.usdc) / 1e6; else m.out += Number(t.usdc) / 1e6
        byMarket.set(k, m)
      })
      pnl = 0
      const posBy = new Map(pf.positions.map(p => [String(p.market.id), p]))
      byMarket.forEach((m, k) => {
        const p = posBy.get(k); const holding = p ? p.value + p.claimable : 0
        invested += m.in
        const mp = holding + m.out - m.in
        pnl! += mp
        const settled = p ? p.status === 'claimable' || p.status === 'settled' : true
        if (settled) { if (mp >= 0) wins++; else losses++ }
      })
    }
    return { value, claimable, atRisk, invested, pnl, wins, losses, netWorth: (balance ?? 0) + value + claimable }
  }, [pf.positions, pf.trades, balance])

  if (!address) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <Award size={40} className="mx-auto mb-4 opacity-30" style={{ color: 'var(--muted)' }} />
        <h1 className="display text-2xl font-600 mb-2" style={{ color: 'var(--ink)' }}>Your Portfolio</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--subtle)' }}>Connect your wallet to see your balance, positions and history.</p>
        <ConnectKitButton />
      </div>
    )
  }

  const claimables = pf.positions.filter(p => p.status === 'claimable')
  const shown = pf.positions.filter(p => filter === 'all' ? true : filter === 'active' ? p.status === 'active' : filter === 'closed' ? p.status === 'closed' || p.status === 'settled' : p.status === 'claimable')
  const counts = { active: pf.positions.filter(p => p.status === 'active').length, claimable: claimables.length, closed: pf.positions.filter(p => p.status === 'closed' || p.status === 'settled').length, all: pf.positions.length }

  const claimAll = async () => {
    setClaiming(true); let done = 0
    try {
      for (const p of claimables) {
        const hash = await writeContractAsync({ address: activeContract(), chainId: activeChainId(), abi: PREDARC_ABI, functionName: 'redeemWinnings', args: [p.market.id] })
        const r = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: activeChainId() })
        if (r.status !== 'success') throw new Error('A claim reverted onchain.')
        done++
      }
      toast.success(`Claimed ${done} market${done === 1 ? '' : 's'}`)
    } catch (e) { toast.error(`${done ? `Claimed ${done}, then stopped: ` : ''}${parseOnchainError(e)}`) }
    finally { setClaiming(false); void refetchBalance(); pf.refetch() }
  }

  const exportCsv = () => {
    const q = new Map(pf.positions.map(p => [String(p.market.id), p.market.question]))
    const rows = [['time', 'type', 'market_id', 'market', 'outcome', 'shares', 'usdc'], ...(pf.trades ?? []).map(t => [
      t.ts ? new Date(t.ts * 1000).toISOString() : '', t.kind, String(t.marketId), `"${(q.get(String(t.marketId)) ?? '').replace(/"/g, '""')}"`,
      t.outcome >= 0 ? String(t.outcome) : '', (Number(t.shares) / 1e18).toFixed(6), (Number(t.usdc) / 1e6).toFixed(6)])]
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' })); a.download = `predarc-${network}-trades.csv`; a.click()
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="display text-2xl sm:text-3xl font-700" style={{ color: 'var(--ink)' }}>Portfolio</h1>
        <button onClick={() => { pf.refetch(); void refetchBalance() }} className="p-2 rounded-lg" style={{ background: 'var(--surface-strong)', color: 'var(--muted)' }} title="Refresh"><RefreshCw size={14} className={pf.loading ? 'animate-spin' : ''} /></button>
      </div>

      {/* Net worth */}
      <div className="rounded-2xl p-5" style={{ ...card, background: 'linear-gradient(135deg, var(--accent-bg), var(--surface))' }}>
        <div className="text-xs mb-1" style={{ color: 'var(--subtle)' }}>Net worth on Arc {network === 'testnet' ? 'Testnet' : 'Mainnet'}</div>
        <div className="text-3xl sm:text-4xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{balance === undefined ? '…' : usd(stats.netWorth)}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <Stat label="Wallet USDC" value={balance === undefined ? '…' : usd(balance)} />
          <Stat label="In positions" value={usd(stats.value)} />
          <Stat label="Claimable" value={usd(stats.claimable)} tone={stats.claimable > 0 ? 'good' : undefined} />
          <Stat label="Lifetime P/L" value={stats.pnl === null ? '…' : `${stats.pnl >= 0 ? '+' : ''}${usd(stats.pnl)}`} tone={stats.pnl === null ? undefined : stats.pnl >= 0 ? 'good' : 'bad'}
            sub={stats.pnl !== null && stats.invested > 0 ? `${((stats.pnl / stats.invested) * 100).toFixed(1)}% on ${usd(stats.invested, 0)}` : undefined} />
        </div>
        {(stats.wins + stats.losses > 0) && <p className="text-xs mt-3" style={{ color: 'var(--subtle)' }}>Settled markets: {stats.wins} won · {stats.losses} lost · {Math.round((stats.wins / (stats.wins + stats.losses)) * 100)}% win rate</p>}
        {pf.positions.some(p => p.value > 0) && (
          <div className="mt-4">
            <div className="flex h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
              {pf.positions.filter(p => p.value > 0).map((p, i) => <div key={String(p.market.id)} title={`${p.market.question} — ${usd(p.value)}`} style={{ width: `${(p.value / stats.value) * 100}%`, background: outcomeColor(i) }} />)}
            </div>
            <p className="text-[11px] mt-1" style={{ color: 'var(--subtle)' }}>Allocation across {pf.positions.filter(p => p.value > 0).length} open market{pf.positions.filter(p => p.value > 0).length === 1 ? '' : 's'}</p>
          </div>
        )}
      </div>

      {claimables.length > 0 && (
        <div className="rounded-xl p-4 flex items-center justify-between gap-3" style={{ ...card, borderColor: 'var(--success)' }}>
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--success)' }}>{usd(stats.claimable)} ready to claim</div>
            <div className="text-xs" style={{ color: 'var(--subtle)' }}>{claimables.length} settled market{claimables.length === 1 ? '' : 's'}</div>
          </div>
          <button onClick={() => { void claimAll() }} disabled={claiming} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60" style={{ background: 'var(--success)', color: '#0d1b2f' }}>{claiming ? 'Claiming…' : 'Claim all'}</button>
        </div>
      )}

      <WalletCard address={address} balance={balance} network={network} explorer={explorer} onSent={() => { void refetchBalance() }} />

      {/* Positions */}
      <div>
        <div className="flex gap-1.5 mb-3 overflow-x-auto">
          {(['active', 'claimable', 'closed', 'all'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap capitalize"
              style={{ background: filter === f ? 'var(--accent-bg)' : 'var(--surface-strong)', color: filter === f ? 'var(--accent)' : 'var(--muted)' }}>{f} <span className="opacity-60">{counts[f]}</span></button>
          ))}
        </div>
        {pf.loading && !pf.positions.length ? <p className="text-sm py-8 text-center" style={{ color: 'var(--subtle)' }}>Loading your positions…</p>
          : shown.length === 0 ? (
            <div className="text-center py-12 rounded-xl" style={card}>
              <TrendingUp size={28} className="mx-auto mb-2 opacity-30" style={{ color: 'var(--muted)' }} />
              <p className="text-sm" style={{ color: 'var(--muted)' }}>{pf.positions.length ? `No ${filter} positions.` : 'No positions yet.'}</p>
              <Link to="/" className="text-sm mt-1 inline-block" style={{ color: 'var(--accent)' }}>Browse markets</Link>
            </div>
          ) : <div className="space-y-3">{shown.map(p => <PositionCard key={String(p.market.id)} p={p} onClaimed={() => { void refetchBalance(); pf.refetch() }} />)}</div>}
      </div>

      {/* History */}
      <div className="rounded-xl p-4" style={card}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>History</h2>
          {!!pf.trades?.length && <button onClick={exportCsv} className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}><Download size={12} />CSV</button>}
        </div>
        {pf.tradesError ? <p className="text-sm" style={{ color: 'var(--warning)' }}>{pf.tradesError} <button className="underline" onClick={pf.retryTrades}>Try again</button></p>
          : pf.trades === null ? <p className="text-sm" style={{ color: 'var(--subtle)' }}>Loading your onchain history…</p>
          : pf.trades.length === 0 ? <p className="text-sm" style={{ color: 'var(--subtle)' }}>No trades yet.</p>
          : (
            <div className="space-y-1.5">
              {pf.trades.slice(0, 40).map(t => {
                const p = pf.positions.find(x => x.market.id === t.marketId)
                const shares = Number(t.shares) / 1e18, amt = Number(t.usdc) / 1e6
                return (
                  <a key={`${t.txHash}-${t.logIndex}`} href={`${explorer}/tx/${t.txHash}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs px-2.5 py-2 rounded-lg" style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
                    <span className="font-semibold uppercase w-11 flex-shrink-0" style={{ color: t.kind === 'sell' ? 'var(--danger)' : 'var(--success)' }}>{t.kind === 'redeem' ? 'claim' : t.kind}</span>
                    <span className="flex-1 min-w-0 truncate">{p ? p.market.question : `Market #${t.marketId}`}{t.kind !== 'redeem' && p ? ` · ${shares.toFixed(2)} ${p.market.outcomes[t.outcome] ?? ''}` : ''}</span>
                    <span className="tabular-nums flex-shrink-0">{usd(amt)}</span>
                    <span className="flex-shrink-0 w-14 text-right" style={{ color: 'var(--subtle)' }}>{timeAgo(t.ts)}</span>
                  </a>
                )
              })}
            </div>
          )}
      </div>
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-muted)' }}>
      <div className="text-[11px]" style={{ color: 'var(--subtle)' }}>{label}</div>
      <div className="text-sm font-semibold tabular-nums" style={{ color: tone === 'good' ? 'var(--success)' : tone === 'bad' ? 'var(--danger)' : 'var(--ink)' }}>{value}</div>
      {sub && <div className="text-[10px]" style={{ color: 'var(--subtle)' }}>{sub}</div>}
    </div>
  )
}

function PositionCard({ p, onClaimed }: { p: Position; onClaimed: () => void }) {
  const wagmiConfig = useConfig()
  const { writeContractAsync } = useWriteContract()
  const [busy, setBusy] = useState(false)
  const m = p.market
  const pl = p.status === 'claimable' ? p.claimable - p.costBasis : p.value - p.costBasis
  const claim = async () => {
    setBusy(true)
    try {
      const hash = await writeContractAsync({ address: activeContract(), chainId: activeChainId(), abi: PREDARC_ABI, functionName: 'redeemWinnings', args: [m.id] })
      const r = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: activeChainId() })
      if (r.status !== 'success') throw new Error('The claim reverted onchain.')
      toast.success('Claimed'); onClaimed()
    } catch (e) { toast.error(parseOnchainError(e)) } finally { setBusy(false) }
  }
  const label = m.status === MarketStatus.Open ? 'Open' : m.status === MarketStatus.Closed ? 'Closed' : m.status === MarketStatus.Resolved ? 'Resolved' : 'Cancelled'
  return (
    <div className="rounded-xl p-4" style={card}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <Link to={`/market/${m.id}`} className="text-sm font-medium hover:underline block" style={{ color: 'var(--ink)' }}>{m.question}</Link>
          <div className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>#{String(m.id)} · {m.category} · {label}</div>
        </div>
        {p.status === 'claimable' && (
          <button onClick={() => { void claim() }} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 disabled:opacity-50" style={{ background: 'var(--success)', color: '#0d1b2f' }}>{busy ? 'Claiming…' : `Claim ${usd(p.claimable)}`}</button>
        )}
      </div>
      <div className="mt-3 space-y-1.5">
        {p.holdings.map(h => (
          <div key={h.index} className="flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5" style={{ background: 'var(--surface-muted)' }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: outcomeColor(h.index) }} />
            <span className="font-medium truncate" style={{ color: h.won ? 'var(--success)' : 'var(--ink-2)' }}>{h.won ? '✓ ' : ''}{h.name}</span>
            <span className="ml-auto tabular-nums" style={{ color: 'var(--muted)' }}>{h.shares.toFixed(2)} sh</span>
            {m.status === MarketStatus.Open || m.status === MarketStatus.Closed
              ? <span className="tabular-nums w-24 text-right" style={{ color: 'var(--ink-2)' }}>{pct(h.price, 0)} · {usd(h.value)}</span>
              : null}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 mt-3 text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
        <span>At risk {usd(p.costBasis)}{p.holdings.length === 1 && p.holdings[0].shares > 0 && p.costBasis > 0 ? ` · avg ${perShare(p.costBasis / p.holdings[0].shares)}/sh` : ''}</span>
        {p.status !== 'settled' && <span style={{ color: pl >= 0 ? 'var(--success)' : 'var(--danger)' }}>{pl >= 0 ? '+' : ''}{usd(pl)} {p.status === 'claimable' ? 'if claimed' : 'unrealized'}</span>}
      </div>
    </div>
  )
}

function WalletCard({ address, balance, network, explorer, onSent }: { address: `0x${string}`; balance?: number; network: 'mainnet' | 'testnet'; explorer: string; onSent: () => void }) {
  const wagmiConfig = useConfig()
  const { writeContractAsync } = useWriteContract()
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async () => {
    if (!isAddress(to)) return toast.error('Enter a valid wallet address (0x…).')
    let raw = 0n; try { raw = parseUnits(amount || '0', 6) } catch { /* invalid */ }
    if (raw <= 0n) return toast.error('Enter an amount greater than 0.')
    if (balance !== undefined && Number(raw) / 1e6 > balance) return toast.error('That is more than your USDC balance.')
    setBusy(true)
    try {
      const hash = await writeContractAsync({ address: activeUsdc(), chainId: activeChainId(), abi: erc20Abi, functionName: 'transfer', args: [to as `0x${string}`, raw] })
      const r = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: activeChainId() })
      if (r.status !== 'success') throw new Error('The transfer reverted onchain.')
      toast.success(`Sent ${amount} USDC to ${shortAddr(to)}`); setTo(''); setAmount(''); setOpen(false); onSent()
    } catch (e) { toast.error(parseOnchainError(e)) } finally { setBusy(false) }
  }
  const field = { background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' } as const

  return (
    <div className="rounded-xl p-4" style={card}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><Wallet size={18} /></div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--ink)' }}>Wallet <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface-strong)', color: 'var(--muted)' }}>Arc {network === 'testnet' ? 'Testnet' : 'Mainnet'}</span></div>
          <div className="text-xs font-mono truncate" style={{ color: 'var(--subtle)' }}>{address}</div>
        </div>
        <button onClick={() => { void navigator.clipboard.writeText(address); toast.success('Address copied') }} className="p-2 rounded-lg" style={{ background: 'var(--surface-strong)', color: 'var(--muted)' }} title="Copy address"><Copy size={14} /></button>
        <a href={`${explorer}/address/${address}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg" style={{ background: 'var(--surface-strong)', color: 'var(--muted)' }} title="View on explorer"><ExternalLink size={14} /></a>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}><Send size={12} />Send USDC</button>
        {network === 'testnet' && <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--surface-strong)', color: 'var(--ink-2)' }}><ArrowUpRight size={12} />Get testnet USDC</a>}
        <span className="text-[11px] self-center" style={{ color: 'var(--subtle)' }}>Gas on Arc is paid in USDC — keep a little in your wallet.</span>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <input value={to} onChange={e => setTo(e.target.value.trim())} placeholder="Recipient address 0x…" className="w-full rounded-lg px-3 py-2 text-sm outline-none font-mono" style={field} />
          <div className="flex gap-2">
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (USDC)" className="flex-1 rounded-lg px-3 py-2 text-sm outline-none tabular-nums" style={field} />
            <button onClick={() => balance !== undefined && setAmount(Math.max(0, balance - 0.5).toFixed(2))} className="px-3 rounded-lg text-xs" style={{ background: 'var(--surface-strong)', color: 'var(--muted)' }}>Max</button>
          </div>
          <button onClick={() => { void send() }} disabled={busy} className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>{busy ? 'Confirm in wallet…' : 'Send'}</button>
          <p className="text-[11px]" style={{ color: 'var(--subtle)' }}>Double-check the address — onchain transfers cannot be undone. “Max” leaves 0.50 USDC for gas.</p>
        </div>
      )}
    </div>
  )
}
