import { useEffect, useMemo, useState } from 'react'
import { useAccount, useConfig, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt, readContract } from 'wagmi/actions'
import { erc20Abi, formatUnits, parseUnits } from 'viem'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Clock, Trophy, Loader2, Wifi } from 'lucide-react'
import BtcLogo from '../components/BtcLogo'
import BtcChart from '../components/BtcChart'
import { BTC_ROUNDS_ABI, RoundStatus, useBtcState, useLiveBtcPrice, pingKeeper, usd, btcRoundsAddress, type RoundData } from '../lib/btcRounds'
import { useSiteConfig, useNetwork, activeChainId, activeUsdc, CHAIN_IDS } from '../lib/adminConfig'
import { parseOnchainError } from '../lib/errors'
import { ConnectKitButton } from 'connectkit'
import { useSwitchChain } from 'wagmi'

const fmt = (v: bigint) => Number(formatUnits(v, 6)).toLocaleString('en-US', { maximumFractionDigits: 2 })
const mmss = (s: number) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

export default function BtcRounds() {
  const cfg = useSiteConfig()
  const network = useNetwork()
  const { address, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const wagmiCfg = useConfig()
  const { writeContractAsync } = useWriteContract()
  const { data: state, isLoading, refetch } = useBtcState(address)
  const { price, points, live } = useLiveBtcPrice()
  const [tick, setTick] = useState(0)
  const [skew, setSkew] = useState(0)
  const [target, setTarget] = useState<number | null>(null) // round being bet on
  const [amount, setAmount] = useState('5')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => { const i = setInterval(() => setTick(t => t + 1), 500); return () => clearInterval(i) }, [])
  useEffect(() => { if (state) setSkew(state.chainNow * 1000 - Date.now()) }, [state?.chainNow]) // eslint-disable-line react-hooks/exhaustive-deps
  void tick

  const nowMs = Date.now() + skew
  const dur = state?.duration ?? 300
  const curId = Math.floor(nowMs / 1000 / dur)
  const round = (id: number): RoundData | undefined => state?.rounds.find(r => r.id === id)
  const cur = round(curId)
  const secLeft = (curId + 1) * dur - nowMs / 1000
  const betId = target ?? curId + 1
  const betRound = round(betId)

  // Keep rounds moving: ping the keeper right after each boundary (and on load)
  useEffect(() => {
    if (!cfg.btcAutoKeeper || !state) return
    const since = nowMs / 1000 - curId * dur
    if (since < Math.max(20, state.buffer) ) { pingKeeper(network); const t = setTimeout(() => { pingKeeper(network); refetch() }, 6000); return () => clearTimeout(t) }
  }, [curId, !!state]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (state) refetch() }, [curId]) // eslint-disable-line react-hooks/exhaustive-deps

  const lockPrice = cur?.lockPrice ?? 0
  const diff = price && lockPrice ? price - lockPrice : 0
  const winning = diff >= 0
  const history = useMemo(() => (state?.rounds ?? []).filter(r => r.id < curId && r.status !== RoundStatus.Upcoming).slice(-12), [state, curId])
  const claimables = (state?.rounds ?? []).filter(r => r.claimable > 0n && !r.claimed)
  const mine = (state?.rounds ?? []).filter(r => (r.myUp > 0n || r.myDown > 0n) && r.id >= curId - 6).reverse()

  const ensureChain = async () => {
    if (chainId !== CHAIN_IDS[network]) await switchChainAsync({ chainId: CHAIN_IDS[network] })
  }

  const place = async (up: boolean) => {
    if (!state || !address) return
    let amt: bigint
    try { amt = parseUnits(amount || '0', 6) } catch { toast.error('Enter a valid amount'); return }
    if (amt < state.minBet) { toast.error(`Minimum bet is $${fmt(state.minBet)}`); return }
    if (state.maxBet > 0n && amt > state.maxBet) { toast.error(`Maximum bet is $${fmt(state.maxBet)}`); return }
    setBusy(up ? 'up' : 'down')
    try {
      await ensureChain()
      const allowance = await readContract(wagmiCfg, { address: activeUsdc(), abi: erc20Abi, functionName: 'allowance', args: [address, state.address], chainId: activeChainId() })
      if (allowance < amt) {
        const h = await writeContractAsync({ address: activeUsdc(), abi: erc20Abi, functionName: 'approve', args: [state.address, amt * 20n], chainId: activeChainId() })
        await waitForTransactionReceipt(wagmiCfg, { hash: h, chainId: activeChainId() })
      }
      const h = await writeContractAsync({ address: state.address, abi: BTC_ROUNDS_ABI, functionName: 'bet', args: [BigInt(betId), up, amt], chainId: activeChainId() })
      await waitForTransactionReceipt(wagmiCfg, { hash: h, chainId: activeChainId() })
      toast.success(`Bet placed: ${up ? 'Up' : 'Down'} $${fmt(amt)}`)
      refetch()
    } catch (e) { toast.error(parseOnchainError(e)) } finally { setBusy(null) }
  }

  const claim = async (id: number) => {
    if (!state) return
    setBusy('claim' + id)
    try {
      await ensureChain()
      const h = await writeContractAsync({ address: state.address, abi: BTC_ROUNDS_ABI, functionName: 'claim', args: [BigInt(id)], chainId: activeChainId() })
      await waitForTransactionReceipt(wagmiCfg, { hash: h, chainId: activeChainId() })
      toast.success('Claimed')
      refetch()
    } catch (e) { toast.error(parseOnchainError(e)) } finally { setBusy(null) }
  }

  if (!cfg.btcEnabled) return <Notice title="Bitcoin rounds are switched off" body="Check back soon." />
  if (!btcRoundsAddress()) return <Notice title="Bitcoin rounds aren't set up on this network yet" body="The admin needs to deploy the rounds contract and add its address under Admin → BTC Rounds." />
  if (isLoading || !state) return <div className="max-w-5xl mx-auto px-4 py-16 flex justify-center"><Loader2 className="animate-spin" style={{ color: 'var(--accent)' }} /></div>

  const pool = (r?: RoundData) => (r ? r.upTotal + r.downTotal : 0n)
  const mult = (r: RoundData | undefined, up: boolean) => {
    if (!r) return '—'
    const mine = Number(formatUnits(parseUnits(amount || '0', 6), 6)) || 0
    const side = Number(formatUnits(up ? r.upTotal : r.downTotal, 6)) + mine
    const total = Number(formatUnits(pool(r), 6)) + mine
    if (side <= 0 || total <= 0) return '—'
    return `${((total * (1 - state.feeBps / 10000)) / side).toFixed(2)}x`
  }
  const bettable = state.enabled && betId > curId && betId <= curId + 3

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-4">
        <BtcLogo size={40} />
        <div className="min-w-0">
          <h1 className="display text-xl sm:text-2xl font-700 truncate" style={{ color: 'var(--ink)' }}>{cfg.btcTitle || 'Bitcoin Up or Down'}</h1>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>{Math.round(dur / 60)}-minute rounds · settles and restarts automatically · {state.feeBps / 100}% fee</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: live ? 'var(--success)' : 'var(--subtle)' }}>
          <Wifi size={11} /> {live ? 'Live' : 'Connecting'}
        </span>
      </div>

      {!state.enabled && <div className="rounded-xl p-3 mb-4 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--warning)', color: 'var(--warning)' }}>New bets are paused. Open rounds still settle and pay out.</div>}

      {claimables.length > 0 && (
        <div className="rounded-xl p-3 mb-4 flex items-center gap-3 flex-wrap" style={{ background: 'var(--surface)', border: '1px solid var(--success)' }}>
          <Trophy size={16} style={{ color: 'var(--success)' }} />
          <span className="text-sm" style={{ color: 'var(--ink)' }}>
            You have ${fmt(claimables.reduce((a, r) => a + r.claimable, 0n))} to claim from {claimables.length} round{claimables.length > 1 ? 's' : ''}.
          </span>
          <div className="flex gap-2 ml-auto flex-wrap">
            {claimables.map(r => (
              <button key={r.id} onClick={() => claim(r.id)} disabled={!!busy} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--success)', color: '#04140d' }}>
                {busy === 'claim' + r.id ? 'Claiming…' : `Claim $${fmt(r.claimable)}${r.refund ? ' (refund)' : ''}`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl p-4 theme-transition" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)' }}>
          <div className="flex items-end justify-between gap-4 flex-wrap mb-2">
            <div>
              <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>Price to beat</div>
              <div className="num text-xl font-700" style={{ color: '#F7931A' }}>{lockPrice ? usd(lockPrice) : cur && cur.status === RoundStatus.Void ? 'Not recorded' : 'Recording…'}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>Current price {lockPrice > 0 && price ? <span style={{ color: winning ? 'var(--success)' : 'var(--danger)' }}>{winning ? '▲' : '▼'} {usd(Math.abs(diff))}</span> : null}</div>
              <div className="num text-3xl font-700" style={{ color: 'var(--ink)' }}>{price ? usd(price) : '—'}</div>
            </div>
          </div>
          <BtcChart points={points} price={price} target={lockPrice} windowStart={curId * dur * 1000 - skew} windowEnd={(curId + 1) * dur * 1000 - skew} />
          <div className="flex items-center gap-3 mt-3">
            <Clock size={14} style={{ color: 'var(--accent)' }} />
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-strong)' }}>
              <div className="h-full" style={{ width: `${Math.min(100, ((dur - secLeft) / dur) * 100)}%`, background: 'var(--accent)', transition: 'width .5s linear' }} />
            </div>
            <span className="num text-sm font-semibold" style={{ color: 'var(--ink)' }}>{mmss(secLeft)}</span>
          </div>
          <div className="flex gap-1.5 mt-4 items-center flex-wrap">
            <span className="text-[11px] uppercase tracking-wider mr-1" style={{ color: 'var(--subtle)' }}>Past rounds</span>
            {history.length === 0 && <span className="text-xs" style={{ color: 'var(--subtle)' }}>none yet</span>}
            {history.map(r => <HistoryDot key={r.id} r={r} />)}
          </div>
        </div>

        <div className="rounded-2xl p-4 theme-transition" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)' }}>
          <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--subtle)' }}>Place a bet</div>
          <div className="flex gap-1.5 mb-3">
            {[1, 2, 3].map(n => {
              const id = curId + n, r = round(id)
              const on = betId === id
              return (
                <button key={id} onClick={() => setTarget(id)} className="flex-1 rounded-lg px-2 py-1.5 text-left" style={{ border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--surface-strong)' : 'transparent' }}>
                  <div className="num text-xs font-semibold" style={{ color: 'var(--ink)' }}>{new Date(id * dur * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  <div className="text-[10px]" style={{ color: 'var(--subtle)' }}>{n === 1 ? 'Next' : `In ${n * Math.round(dur / 60)}m`} · ${fmt(pool(r))}</div>
                </button>
              )
            })}
          </div>
          <label className="text-[11px]" style={{ color: 'var(--subtle)' }}>Amount (USDC) · min ${fmt(state.minBet)}{state.maxBet > 0n ? ` · max $${fmt(state.maxBet)}` : ''}</label>
          <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className="w-full rounded-lg px-3 py-2 my-1.5 num text-lg outline-none" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', color: 'var(--ink)' }} />
          <div className="flex gap-1.5 mb-3">
            {['1', '5', '10', '25', '100'].map(v => <button key={v} onClick={() => setAmount(v)} className="flex-1 text-xs py-1 rounded-md" style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}>${v}</button>)}
          </div>
          {!address ? (
            <ConnectKitButton.Custom>{({ show }) => <button onClick={show} className="w-full py-3 rounded-xl font-semibold" style={{ background: 'var(--accent)', color: '#fff' }}>Connect wallet</button>}</ConnectKitButton.Custom>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button disabled={!bettable || !!busy} onClick={() => place(true)} className="py-3 rounded-xl font-semibold flex flex-col items-center disabled:opacity-40" style={{ background: 'var(--success)', color: '#04140d' }}>
                <span className="inline-flex items-center gap-1">{busy === 'up' ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={15} />} Up</span>
                <span className="text-[11px] opacity-80">{mult(betRound, true)} payout</span>
              </button>
              <button disabled={!bettable || !!busy} onClick={() => place(false)} className="py-3 rounded-xl font-semibold flex flex-col items-center disabled:opacity-40" style={{ background: 'var(--danger)', color: '#1a0505' }}>
                <span className="inline-flex items-center gap-1">{busy === 'down' ? <Loader2 size={15} className="animate-spin" /> : <ArrowDown size={15} />} Down</span>
                <span className="text-[11px] opacity-80">{mult(betRound, false)} payout</span>
              </button>
            </div>
          )}
          {betRound && (
            <div className="mt-3 text-xs space-y-1" style={{ color: 'var(--muted)' }}>
              <div className="flex justify-between"><span>Up pool</span><span className="num">${fmt(betRound.upTotal)}</span></div>
              <div className="flex justify-between"><span>Down pool</span><span className="num">${fmt(betRound.downTotal)}</span></div>
              {(betRound.myUp > 0n || betRound.myDown > 0n) && <div className="flex justify-between" style={{ color: 'var(--ink)' }}><span>Your stake</span><span className="num">Up ${fmt(betRound.myUp)} · Down ${fmt(betRound.myDown)}</span></div>}
            </div>
          )}
          <p className="text-[11px] mt-3" style={{ color: 'var(--subtle)' }}>Winners split the pool. Price up at round end = Up wins. Ties, one-sided pools or a missed price feed refund everyone.</p>
        </div>
      </div>

      {mine.length > 0 && (
        <div className="mt-4 rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--subtle)' }}>Your rounds</div>
          <div className="space-y-2">
            {mine.map(r => <MyRow key={r.id} r={r} dur={dur} busy={busy} onClaim={claim} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function statusLabel(r: RoundData) {
  switch (r.status) {
    case RoundStatus.Upcoming: return 'Upcoming'
    case RoundStatus.Live: return 'Live'
    case RoundStatus.Pending: return 'Settling…'
    case RoundStatus.SettledUp: return 'Up won'
    case RoundStatus.SettledDown: return 'Down won'
    default: return 'Refunded'
  }
}

function HistoryDot({ r }: { r: RoundData }) {
  const c = r.status === RoundStatus.SettledUp ? 'var(--success)' : r.status === RoundStatus.SettledDown ? 'var(--danger)' : 'var(--subtle)'
  const t = r.status === RoundStatus.SettledUp ? '▲' : r.status === RoundStatus.SettledDown ? '▼' : '•'
  return (
    <span title={`${new Date(r.start * 1000).toLocaleTimeString()} · ${statusLabel(r)}${r.lockPrice ? ` · ${usd(r.lockPrice)} → ${r.closePrice ? usd(r.closePrice) : '…'}` : ''}`}
      className="inline-flex items-center justify-center rounded-full text-[10px] font-bold" style={{ width: 22, height: 22, border: `1.5px solid ${c}`, color: c }}>{t}</span>
  )
}

function MyRow({ r, dur, busy, onClaim }: { r: RoundData; dur: number; busy: string | null; onClaim: (id: number) => void }) {
  const won = (r.status === RoundStatus.SettledUp && r.myUp > 0n) || (r.status === RoundStatus.SettledDown && r.myDown > 0n)
  const finished = r.status >= RoundStatus.SettledUp
  return (
    <div className="flex items-center gap-3 text-sm flex-wrap">
      <span className="num" style={{ color: 'var(--ink)' }}>{new Date(r.id * dur * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      <span style={{ color: 'var(--muted)' }}>{r.myUp > 0n ? `Up $${fmt(r.myUp)} ` : ''}{r.myDown > 0n ? `Down $${fmt(r.myDown)}` : ''}</span>
      <span className="text-xs px-2 py-0.5 rounded-full" style={{ border: '1px solid var(--border)', color: finished ? (won ? 'var(--success)' : r.status === RoundStatus.Void ? 'var(--muted)' : 'var(--danger)') : 'var(--muted)' }}>
        {finished ? (r.status === RoundStatus.Void ? 'Refund' : won ? 'Won' : 'Lost') : statusLabel(r)}
      </span>
      {r.claimable > 0n && !r.claimed && (
        <button onClick={() => onClaim(r.id)} disabled={!!busy} className="ml-auto px-3 py-1 rounded-lg text-xs font-semibold" style={{ background: 'var(--success)', color: '#04140d' }}>Claim ${fmt(r.claimable)}</button>
      )}
      {r.claimed && <span className="ml-auto text-xs" style={{ color: 'var(--subtle)' }}>Claimed</span>}
    </div>
  )
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center">
      <div className="flex justify-center mb-4"><BtcLogo size={48} /></div>
      <h1 className="display text-xl font-700 mb-2" style={{ color: 'var(--ink)' }}>{title}</h1>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>{body}</p>
    </div>
  )
}
