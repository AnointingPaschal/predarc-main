import { useEffect, useMemo, useState } from 'react'
import { useAccount, useConfig, useWriteContract, useSwitchChain } from 'wagmi'
import { waitForTransactionReceipt, readContract } from 'wagmi/actions'
import { erc20Abi, formatUnits, parseUnits } from 'viem'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Clock, Trophy, Loader2, Wifi } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import BtcLogo from '../components/BtcLogo'
import BtcChart from '../components/BtcChart'
import BtcRing from '../components/BtcRing'
import {
  BTC_ROUNDS_ABI, RoundStatus, useBtcState, useLiveBtcPrice, useBtcClock, useBtcDayStats, useBtcBets, upChance, btcMetrics,
  pingKeeper, usd, utcHM, utcHMS, utcRange, btcRoundsAddress, type RoundData,
} from '../lib/btcRounds'
import { useSiteConfig, useNetwork, activeChainId, activeUsdc, CHAIN_IDS } from '../lib/adminConfig'
import { parseOnchainError } from '../lib/errors'

const fmt = (v: bigint) => Number(formatUnits(v, 6)).toLocaleString('en-US', { maximumFractionDigits: 2 })
const mmss = (s: number) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const panel = { background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)' } as const

export default function BtcRounds() {
  const cfg = useSiteConfig()
  const network = useNetwork()
  const { address, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const wagmiCfg = useConfig()
  const { writeContractAsync } = useWriteContract()
  const { data: state, isLoading, refetch } = useBtcState(address)
  const { price, points, live } = useLiveBtcPrice()
  const { data: day } = useBtcDayStats()
  const { data: bets } = useBtcBets()
  const { nowSec, skew, dur, curId, secLeft } = useBtcClock(state)
  const [target, setTarget] = useState<number | null>(null)
  const [amount, setAmount] = useState('5')
  const [busy, setBusy] = useState<string | null>(null)

  const round = (id: number): RoundData | undefined => state?.rounds.find(r => r.id === id)
  const cur = round(curId)
  const betId = target ?? curId + 1
  const betRound = round(betId)

  // Keep rounds moving: ping the keeper right after each boundary (and on load)
  useEffect(() => {
    if (!cfg.btcAutoKeeper || !state) return
    const since = Date.now() / 1000 + skew / 1000 - curId * dur
    if (since < Math.max(20, state.buffer)) { pingKeeper(network); const t = setTimeout(() => { pingKeeper(network); refetch() }, 6000); return () => clearTimeout(t) }
  }, [curId, !!state]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (state) refetch() }, [curId]) // eslint-disable-line react-hooks/exhaustive-deps

  const lockPrice = cur?.lockPrice ?? 0
  const diff = price && lockPrice ? price - lockPrice : 0
  const winning = diff >= 0
  const chance = upChance(points, price, lockPrice, secLeft)
  const finished = useMemo(() => (state?.rounds ?? []).filter(r => r.id < curId && r.status !== RoundStatus.Upcoming).slice().reverse(), [state, curId])
  const settled = finished.filter(r => r.status === RoundStatus.SettledUp || r.status === RoundStatus.SettledDown)
  const upWins = settled.filter(r => r.status === RoundStatus.SettledUp).length
  let streak = 0, streakUp = true
  for (const r of settled) {
    const u = r.status === RoundStatus.SettledUp
    if (streak === 0) { streakUp = u; streak = 1 } else if (u === streakUp) streak++; else break
  }
  const volume = finished.reduce((a, r) => a + r.upTotal + r.downTotal, 0n)
  const claimables = (state?.rounds ?? []).filter(r => r.claimable > 0n && !r.claimed)
  const mine = (state?.rounds ?? []).filter(r => (r.myUp > 0n || r.myDown > 0n) && r.id >= curId - 6).reverse()

  const ensureChain = async () => { if (chainId !== CHAIN_IDS[network]) await switchChainAsync({ chainId: CHAIN_IDS[network] }) }

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
  if (isLoading || !state) return <div className="max-w-7xl mx-auto px-4 py-16 flex justify-center"><Loader2 className="animate-spin" style={{ color: 'var(--accent)' }} /></div>

  const pool = (r?: RoundData) => (r ? r.upTotal + r.downTotal : 0n)
  const mult = (r: RoundData | undefined, up: boolean) => {
    if (!r) return '—'
    const mineAmt = Number(amount) || 0
    const other = Number(formatUnits(up ? r.downTotal : r.upTotal, 6))
    if (other <= 0) return 'no opposing bets yet'
    const side = Number(formatUnits(up ? r.upTotal : r.downTotal, 6)) + mineAmt
    const total = Number(formatUnits(pool(r), 6)) + mineAmt
    return `${((total * (1 - state.feeBps / 10000)) / side).toFixed(2)}x payout`
  }
  const bettable = state.enabled && betId > curId && betId <= curId + 3
  const crowdUp = (r?: RoundData) => (r && pool(r) > 0n ? Number((r.upTotal * 1000n) / pool(r)) / 1000 : null)

  const metrics = btcMetrics(points, price, lockPrice, secLeft, curId * dur * 1000 - skew)
  const ladderUp = [3, 2, 1].map(n => round(curId + n)).filter(Boolean) as RoundData[]
  const heat = finished.slice(0, 24).reverse()
  const maxMove = Math.max(0.0001, ...heat.map(r => (r.lockPrice && r.closePrice ? Math.abs(r.closePrice - r.lockPrice) / r.lockPrice : 0)))

  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <BtcRing progress={1 - secLeft / dur} size={60} stroke={4}><BtcLogo size={38} /></BtcRing>
        <div className="min-w-0">
          <h1 className="display text-xl sm:text-2xl font-700 truncate" style={{ color: 'var(--ink)' }}>{cfg.btcTitle || 'Bitcoin Up or Down'}</h1>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>{Math.round(dur / 60)}-minute rounds · one UTC clock for everyone · settles and restarts automatically · {state.feeBps / 100}% fee</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="num text-xs px-2.5 py-1 rounded-full" style={{ ...panel, color: 'var(--ink)' }}>{utcHMS(nowSec)}</span>
          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full" style={{ ...panel, color: live ? 'var(--success)' : 'var(--subtle)' }}><Wifi size={11} /> {live ? 'Live' : 'Connecting'}</span>
        </div>
      </div>

      {!state.enabled && <div className="rounded-xl p-3 mb-4 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--warning)', color: 'var(--warning)' }}>New bets are paused. Open rounds still settle and pay out.</div>}

      {claimables.length > 0 && (
        <div className="rounded-xl p-3 mb-4 flex items-center gap-3 flex-wrap" style={{ background: 'var(--surface)', border: '1px solid var(--success)' }}>
          <Trophy size={16} style={{ color: 'var(--success)' }} />
          <span className="text-sm" style={{ color: 'var(--ink)' }}>You have ${fmt(claimables.reduce((a, r) => a + r.claimable, 0n))} to claim from {claimables.length} round{claimables.length > 1 ? 's' : ''}.</span>
          <div className="flex gap-2 ml-auto flex-wrap">
            {claimables.map(r => (
              <button key={r.id} onClick={() => claim(r.id)} disabled={!!busy} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--success)', color: '#04140d' }}>
                {busy === 'claim' + r.id ? 'Claiming…' : `Claim $${fmt(r.claimable)}${r.refund ? ' (refund)' : ''}`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[300px_minmax(0,1fr)_340px] gap-4 items-start">

        {/* ── Left: round ladder ── */}
        <div className="order-3 xl:order-1 lg:col-span-2 xl:col-span-1 space-y-4">
          <section className="rounded-2xl p-3" style={panel}>
            <Title>Round ladder <span className="normal-case tracking-normal font-normal">· UTC</span></Title>
            <div className="space-y-2">
              {ladderUp.map(r => {
                const on = betId === r.id
                return (
                  <button key={r.id} onClick={() => setTarget(r.id)} className="w-full text-left rounded-xl p-2.5 transition" style={{ border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--surface-strong)' : 'transparent' }}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="num font-semibold" style={{ color: 'var(--ink)' }}>{utcRange(r.id * dur, dur)}</span>
                      <span style={{ color: 'var(--subtle)' }}>in {mmss(r.id * dur - nowSec)}</span>
                    </div>
                    <div className="mt-1.5"><SplitBar up={r.upTotal} down={r.downTotal} /></div>
                    <div className="flex justify-between text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
                      <span className="num" style={{ color: 'var(--success)' }}>▲ ${fmt(r.upTotal)}</span>
                      <span className="num" style={{ color: 'var(--danger)' }}>${fmt(r.downTotal)} ▼</span>
                    </div>
                  </button>
                )
              })}
              {cur && (
                <div className="rounded-xl p-2.5" style={{ border: '1.5px solid #F7931A', background: 'rgba(247,147,26,.08)' }}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: '#F7931A' }}><span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#F7931A' }} /> LIVE {utcRange(curId * dur, dur)}</span>
                    <span className="num" style={{ color: 'var(--ink)' }}>{mmss(secLeft)}</span>
                  </div>
                  <div className="text-[11px] mt-1 num" style={{ color: 'var(--muted)' }}>{lockPrice ? `Target ${usd(lockPrice)}` : 'Recording target…'}</div>
                  <div className="mt-1.5"><SplitBar up={cur.upTotal} down={cur.downTotal} /></div>
                  <div className="flex justify-between text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
                    <span className="num">▲ ${fmt(cur.upTotal)}</span><span className="num">${fmt(cur.downTotal)} ▼</span>
                  </div>
                </div>
              )}
              <div className="pt-1 space-y-1.5">
                {finished.slice(0, 12).map(r => {
                  const up = r.status === RoundStatus.SettledUp, down = r.status === RoundStatus.SettledDown
                  const pct = r.lockPrice && r.closePrice ? ((r.closePrice - r.lockPrice) / r.lockPrice) * 100 : null
                  return (
                    <div key={r.id} className="flex items-center gap-2 text-xs rounded-lg px-2 py-1.5" style={{ background: 'var(--surface-muted)' }}>
                      <span className="num" style={{ color: 'var(--muted)' }}>{utcHM(r.id * dur)}</span>
                      <span className="font-semibold w-12" style={{ color: up ? 'var(--success)' : down ? 'var(--danger)' : 'var(--subtle)' }}>{up ? '▲ Up' : down ? '▼ Down' : r.status === RoundStatus.Void ? 'Refund' : '…'}</span>
                      <span className="num ml-auto" style={{ color: pct == null ? 'var(--subtle)' : pct >= 0 ? 'var(--success)' : 'var(--danger)' }}>{pct == null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(3)}%`}</span>
                      <span className="num w-14 text-right" style={{ color: 'var(--subtle)' }}>${fmt(pool(r))}</span>
                    </div>
                  )
                })}
                {finished.length === 0 && <div className="text-xs px-1" style={{ color: 'var(--subtle)' }}>Finished rounds appear here.</div>}
              </div>
            </div>
          </section>
        </div>

        {/* ── Center: chart + analytics ── */}
        <div className="order-1 xl:order-2 space-y-4 min-w-0">
          <section className="rounded-2xl p-4 theme-transition" style={panel}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
              <Big label={`Target · ${utcHM(curId * dur)} UTC`} value={lockPrice ? usd(lockPrice) : cur && cur.status === RoundStatus.Void ? 'Not recorded' : 'Recording…'} color="#F7931A" />
              <Big label="Price now" value={price ? usd(price) : '—'} />
              <Big label="Gap to target" value={metrics.gapBps == null ? '—' : `${metrics.gapBps >= 0 ? '+' : ''}${metrics.gapBps.toFixed(1)} bps`} color={metrics.gapBps == null ? undefined : metrics.gapBps >= 0 ? 'var(--success)' : 'var(--danger)'} />
              <Big label="Chance Up (model)" value={chance == null ? '—' : `${Math.round(chance * 100)}%`} color={chance == null ? undefined : chance >= 0.5 ? 'var(--success)' : 'var(--danger)'} />
            </div>
            <BtcChart points={points} price={price} target={lockPrice} windowStart={curId * dur * 1000 - skew} windowEnd={(curId + 1) * dur * 1000 - skew} />
            <div className="flex items-center gap-3 mt-3">
              <Clock size={14} style={{ color: 'var(--accent)' }} />
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-strong)' }}>
                <div className="h-full" style={{ width: `${Math.min(100, ((dur - secLeft) / dur) * 100)}%`, background: 'var(--accent)', transition: 'width .5s linear' }} />
              </div>
              <span className="num text-sm font-semibold" style={{ color: 'var(--ink)' }}>{mmss(secLeft)}</span>
            </div>
          </section>

          <section className="rounded-2xl p-4" style={panel}>
            <Title>Momentum &amp; volatility</Title>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              <Pct label="1 min" v={metrics.m1} /><Pct label="5 min" v={metrics.m5} /><Pct label="15 min" v={metrics.m15} />
              <Stat label="Volatility" value={metrics.volBpsMin == null ? '—' : `${metrics.volBpsMin.toFixed(1)} bps/min`} />
              <Stat label="Round high" value={metrics.roundHigh ? usd(metrics.roundHigh) : '—'} />
              <Stat label="Round low" value={metrics.roundLow ? usd(metrics.roundLow) : '—'} />
              <Stat label="To flip result" value={metrics.needPerMin == null ? '—' : `${metrics.needPerMin > 0 ? '+' : '−'}${usd(Math.abs(metrics.needPerMin))}/min`} />
              <Stat label="24h" value={day ? `${day.change >= 0 ? '+' : ''}${day.changePct.toFixed(2)}%` : '—'} tone={day ? (day.change >= 0 ? 'up' : 'down') : undefined} />
            </div>
          </section>

          <section className="rounded-2xl p-4" style={panel}>
            <Title>Round heat strip <span className="normal-case tracking-normal font-normal">· last {heat.length || 24} rounds, bar height = size of move</span></Title>
            <div className="flex items-end gap-1 h-24">
              {heat.length === 0 && <div className="text-xs" style={{ color: 'var(--subtle)' }}>Waiting for finished rounds…</div>}
              {heat.map(r => {
                const up = r.status === RoundStatus.SettledUp, down = r.status === RoundStatus.SettledDown
                const mv = r.lockPrice && r.closePrice ? Math.abs(r.closePrice - r.lockPrice) / r.lockPrice : 0
                const h = 8 + (mv / maxMove) * 88
                return <div key={r.id} title={`${utcHM(r.id * dur)} UTC · ${up ? 'Up' : down ? 'Down' : 'Refund'} · ${(mv * 100).toFixed(3)}%`} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: up ? 'var(--success)' : down ? 'var(--danger)' : 'var(--subtle)', opacity: 0.85 }} />
              })}
            </div>
            <div className="grid grid-cols-3 gap-4 mt-3">
              <Stat label="Up wins" value={settled.length ? `${upWins}/${settled.length}` : '—'} />
              <Stat label="Streak" value={settled.length ? `${streak} ${streakUp ? 'Up' : 'Down'}` : '—'} tone={settled.length ? (streakUp ? 'up' : 'down') : undefined} />
              <Stat label="Volume (24 rounds)" value={`$${fmt(volume)}`} />
            </div>
          </section>
        </div>

        {/* ── Right: bet + flow ── */}
        <div className="order-2 xl:order-3 space-y-4">
          <section className="rounded-2xl p-4 theme-transition" style={panel}>
            <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--subtle)' }}>Place a bet · {betRound ? utcRange(betId * dur, dur) : ''}</div>
            <div className="flex gap-1.5 mb-3">
              {[1, 2, 3].map(n => {
                const id = curId + n, r = round(id), on = betId === id
                return (
                  <button key={id} onClick={() => setTarget(id)} className="flex-1 rounded-lg px-2 py-1.5 text-left" style={{ border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--surface-strong)' : 'transparent' }}>
                    <div className="num text-xs font-semibold" style={{ color: 'var(--ink)' }}>{utcHM(id * dur)}</div>
                    <div className="text-[10px]" style={{ color: 'var(--subtle)' }}>${fmt(pool(r))}</div>
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
                  <span className="text-[11px] opacity-80">{mult(betRound, true)}</span>
                </button>
                <button disabled={!bettable || !!busy} onClick={() => place(false)} className="py-3 rounded-xl font-semibold flex flex-col items-center disabled:opacity-40" style={{ background: 'var(--danger)', color: '#1a0505' }}>
                  <span className="inline-flex items-center gap-1">{busy === 'down' ? <Loader2 size={15} className="animate-spin" /> : <ArrowDown size={15} />} Down</span>
                  <span className="text-[11px] opacity-80">{mult(betRound, false)}</span>
                </button>
              </div>
            )}
            {betRound && (
              <div className="mt-3 text-xs space-y-1.5" style={{ color: 'var(--muted)' }}>
                <SplitBar up={betRound.upTotal} down={betRound.downTotal} />
                <div className="flex justify-between"><span>Up pool</span><span className="num">${fmt(betRound.upTotal)}</span></div>
                <div className="flex justify-between"><span>Down pool</span><span className="num">${fmt(betRound.downTotal)}</span></div>
                {(betRound.myUp > 0n || betRound.myDown > 0n) && <div className="flex justify-between" style={{ color: 'var(--ink)' }}><span>Your stake</span><span className="num">Up ${fmt(betRound.myUp)} · Down ${fmt(betRound.myDown)}</span></div>}
              </div>
            )}
            <p className="text-[11px] mt-3" style={{ color: 'var(--subtle)' }}>Winners split the pool. Price higher at the end than the target = Up wins. Ties, one-sided pools or a missed price refund everyone. Payout shown is if the round ended now with your bet included.</p>
          </section>

          <section className="rounded-2xl p-4" style={panel}>
            <Title>Live bets</Title>
            <div className="space-y-1.5 max-h-64 overflow-auto">
              {!bets && <div className="text-xs" style={{ color: 'var(--subtle)' }}>Loading…</div>}
              {bets && bets.length === 0 && <div className="text-xs" style={{ color: 'var(--subtle)' }}>No bets yet — be the first.</div>}
              {bets?.map(b => (
                <div key={`${b.block}-${b.index}`} className="flex items-center gap-2 text-xs">
                  <span className="mono" style={{ color: 'var(--muted)' }}>{short(b.user)}</span>
                  <span className="font-semibold" style={{ color: b.up ? 'var(--success)' : 'var(--danger)' }}>{b.up ? '▲ Up' : '▼ Down'}</span>
                  <span className="num ml-auto" style={{ color: 'var(--ink)' }}>${fmt(b.amount)}</span>
                  <span className="num" style={{ color: 'var(--subtle)' }}>{utcHM(b.roundId * dur)}</span>
                </div>
              ))}
            </div>
          </section>

          {mine.length > 0 && (
            <section className="rounded-2xl p-4" style={panel}>
              <Title>Your rounds</Title>
              <div className="space-y-2">{mine.map(r => <MyRow key={r.id} r={r} dur={dur} busy={busy} onClaim={claim} />)}</div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function Big({ label, value, color }: { label: string; value: string; color?: string }) {
  return <div className="min-w-0"><div className="text-[11px] uppercase tracking-wider truncate" style={{ color: 'var(--subtle)' }}>{label}</div><div className="num text-lg sm:text-xl font-700 truncate" style={{ color: color ?? 'var(--ink)' }}>{value}</div></div>
}
function Pct({ label, v }: { label: string; v: number | null }) {
  return <Stat label={label} value={v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(3)}%`} tone={v == null ? undefined : v >= 0 ? 'up' : 'down'} />
}

const Title = ({ children }: { children: React.ReactNode }) => <div className="text-[11px] uppercase tracking-wider mb-3" style={{ color: 'var(--subtle)' }}>{children}</div>
function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return <div><dt className="text-[11px]" style={{ color: 'var(--subtle)' }}>{label}</dt><dd className="num font-semibold" style={{ color: tone === 'up' ? 'var(--success)' : tone === 'down' ? 'var(--danger)' : 'var(--ink)' }}>{value}</dd></div>
}
function SplitBar({ up, down }: { up: bigint; down: bigint }) {
  const total = up + down
  const pct = total > 0n ? Number((up * 1000n) / total) / 10 : 50
  return (
    <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'var(--surface-strong)' }}>
      <div style={{ width: `${pct}%`, background: 'var(--success)' }} /><div style={{ width: `${100 - pct}%`, background: 'var(--danger)' }} />
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

function HistoryDot({ r, dur }: { r: RoundData; dur: number }) {
  const c = r.status === RoundStatus.SettledUp ? 'var(--success)' : r.status === RoundStatus.SettledDown ? 'var(--danger)' : 'var(--subtle)'
  const t = r.status === RoundStatus.SettledUp ? '▲' : r.status === RoundStatus.SettledDown ? '▼' : '•'
  return (
    <span title={`${utcHM(r.id * dur)} UTC · ${statusLabel(r)}${r.lockPrice ? ` · ${usd(r.lockPrice)} → ${r.closePrice ? usd(r.closePrice) : '…'}` : ''}`}
      className="inline-flex items-center justify-center rounded-full text-[10px] font-bold" style={{ width: 22, height: 22, border: `1.5px solid ${c}`, color: c }}>{t}</span>
  )
}

function MyRow({ r, dur, busy, onClaim }: { r: RoundData; dur: number; busy: string | null; onClaim: (id: number) => void }) {
  const won = (r.status === RoundStatus.SettledUp && r.myUp > 0n) || (r.status === RoundStatus.SettledDown && r.myDown > 0n)
  const finished = r.status >= RoundStatus.SettledUp
  return (
    <div className="flex items-center gap-3 text-sm flex-wrap">
      <span className="num" style={{ color: 'var(--ink)' }}>{utcHM(r.id * dur)} UTC</span>
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
