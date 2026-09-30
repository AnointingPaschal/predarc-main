import { useEffect, useMemo, useRef, useState } from 'react'
import { useConfig, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt, simulateContract, readContract } from 'wagmi/actions'
import { erc20Abi, parseUnits, decodeEventLog, isAddress } from 'viem'
import { toast } from 'sonner'
import { Trophy, Search, RefreshCw, Zap, Square, CheckCircle2, AlertTriangle, Save } from 'lucide-react'
import { SPORTS_ABI } from '../../lib/sportsAbi'
import { sportsAddress } from '../../lib/sportsChain'
import { activeChainId, activeUsdc, loadConfig, saveConfig, useNetwork, type SiteConfig } from '../../lib/adminConfig'
import { saveMarketMeta } from '../../lib/api'
import { parseOnchainError } from '../../lib/errors'
import {
  KINDS, KIND_BY_ID, DEFAULT_KINDS, LEAGUES, SPORTS_CATEGORY, outcomesFor, questionFor, descriptionFor, criteriaFor,
  endTimeFor, resolutionTimeFor, type Fixture, type SportsRecord,
} from '../../lib/sportsCore'
import {
  fetchFixtures, fetchOdds, fetchRegistry, fetchDue, fetchSportsKeeper, registerFixtures, recordSettled,
  type DueMatch, type KeeperStatus,
} from '../../lib/sports'

const card = { background: 'var(--surface)', border: '1px solid var(--border)' } as const
const inputCls = 'px-3 py-2 rounded-lg text-sm outline-none bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--ink)]'
const fmt = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(5, 16) + ' UTC'

export default function SportsAdmin() {
  const network = useNetwork()
  const wagmi = useConfig()
  const { writeContractAsync } = useWriteContract()
  const [cfg, setCfg] = useState<SiteConfig>(loadConfig)

  const [leagues, setLeagues] = useState<string[]>(['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'uefa.champions'])
  const [custom, setCustom] = useState('')
  const [filter, setFilter] = useState('')
  const [days, setDays] = useState(21)
  const [kinds, setKinds] = useState<string[]>(DEFAULT_KINDS)
  const [liq, setLiq] = useState(String(cfg.sportsLiquidityUsdc ?? 10))
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [registry, setRegistry] = useState<SportsRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState<{ done: number; total: number; label: string } | null>(null)
  const stop = useRef(false)

  const [due, setDue] = useState<DueMatch[] | null>(null)
  const [settling, setSettling] = useState(false)
  const [keeper, setKeeper] = useState<KeeperStatus | null>(null)
  const [manual, setManual] = useState<Record<string, { h: string; a: string }>>({})

  const reloadRegistry = async () => { try { setRegistry(await fetchRegistry()) } catch { /* not configured yet */ } }
  useEffect(() => { void reloadRegistry(); fetchSportsKeeper().then(setKeeper).catch(() => setKeeper(null)) }, [network])

  const known = useMemo(() => new Set(registry.map(r => r.eventId)), [registry])
  const shownLeagues = LEAGUES.filter(l => !filter || `${l.name} ${l.region} ${l.id}`.toLowerCase().includes(filter.toLowerCase()))
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])

  const load = async () => {
    const ids = [...new Set([...leagues, ...custom.split(/[\s,]+/).filter(Boolean)])]
    if (!ids.length) return toast.error('Pick at least one league')
    setLoading(true)
    try {
      const results: { id: string; fixtures: Fixture[]; reachable: boolean }[] = []
      for (let i = 0; i < ids.length; i += 6) {
        results.push(...await Promise.all(ids.slice(i, i + 6).map(async id => {
          try { const r = await fetchFixtures(id, days); return { id, ...r } } catch { return { id, fixtures: [] as Fixture[], reachable: false } }
        })))
      }
      const all = results.flatMap(r => r.fixtures)
      const unreachable = results.filter(r => !r.reachable).length
      const fresh = all.filter(f => !known.has(f.eventId)).sort((a, b) => a.kickoff - b.kickoff)
      setFixtures(fresh); setPicked(new Set(fresh.map(f => f.eventId)))
      const extra = `${all.length > fresh.length ? ` (${all.length - fresh.length} already generated)` : ''}${unreachable ? `; ${unreachable} league${unreachable === 1 ? '' : 's'} not available from ESPN` : ''}`
      if (fresh.length) toast.success(`${fresh.length} new fixture${fresh.length === 1 ? '' : 's'} found${extra}`)
      else if (unreachable === results.length) toast.error('Could not reach the fixtures feed. Try again in a moment.')
      else toast.warning(`No fixtures in the next ${days} days${extra}. Leagues pause for international breaks: try more days (up to 30).`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not load fixtures') } finally { setLoading(false) }
  }

  const chosen = fixtures.filter(f => picked.has(f.eventId))
  const liqNum = Math.max(0, Number(liq) || 0)
  const totalMarkets = chosen.length * kinds.length
  const totalUsdc = totalMarkets * liqNum

  const generate = async () => {
    const contract = sportsAddress(), chainId = activeChainId()
    if (!contract) return toast.error('Set the Sports contract address for this network first (box at the top).')
    if (!chosen.length || !kinds.length) return
    if (liqNum < 1) return toast.error('Liquidity must be at least 1 USDC per line. It backs the payouts and you get it back after the match.')
    stop.current = false
    setRunning({ done: 0, total: chosen.length, label: 'Fetching bookmaker odds…' })
    let created = 0, failed = 0
    try {
      const odds = new Map<string, { source: string; bps: Record<string, number[]> }>()
      for (let i = 0; i < chosen.length; i += 6) {
        await Promise.all(chosen.slice(i, i + 6).map(async f => { try { odds.set(f.eventId, await fetchOdds(f.league, f.eventId)) } catch { /* generic odds for this one */ } }))
      }
      const liquidity = parseUnits(String(liqNum), 6)
      setRunning({ done: 0, total: chosen.length, label: 'Approving USDC…' })
      const need = liquidity * BigInt(totalMarkets)
      const h = await writeContractAsync({ address: activeUsdc(), chainId, abi: erc20Abi, functionName: 'approve', args: [contract, need] })
      const r = await waitForTransactionReceipt(wagmi, { hash: h, chainId })
      if (r.status !== 'success') throw new Error('USDC approval reverted')
      let done = 0
      for (const f of chosen) {
        if (stop.current) break
        setRunning({ done, total: chosen.length, label: `${f.home.name} vs ${f.away.name}` })
        try {
          const ks = kinds.map(k => KIND_BY_ID[k])
          const outs = ks.map(k => outcomesFor(k, f))
          const probs = ks.map((k, i) => {
            const p = odds.get(f.eventId)?.bps[k.id]
            return (p && p.length === outs[i].length ? p : outs[i].map(() => Math.round(10000 / outs[i].length))).map(BigInt)
          })
          const args = [BigInt(f.eventId), BigInt(endTimeFor(f)), BigInt(resolutionTimeFor(f)), ks.map(k => k.id), ks.map(k => questionFor(k, f)), outs, probs, liquidity] as never
          await simulateContract(wagmi, { address: contract, chainId, abi: SPORTS_ABI, functionName: 'createMatch', args } as never)
          const hash = await writeContractAsync({ address: contract, chainId, abi: SPORTS_ABI, functionName: 'createMatch', args } as never)
          const rc = await waitForTransactionReceipt(wagmi, { hash, chainId })
          if (rc.status !== 'success') throw new Error('reverted')
          const markets: Record<string, string> = {}
          for (const log of rc.logs) {
            if (log.address.toLowerCase() !== contract.toLowerCase()) continue
            try {
              const ev = decodeEventLog({ abi: SPORTS_ABI, data: log.data, topics: log.topics })
              if (ev.eventName === 'LineCreated') { const a = ev.args as unknown as { lineId: bigint; kind: string }; markets[a.kind] = a.lineId.toString() }
            } catch { /* other event */ }
          }
          created += Object.keys(markets).length
          for (const [kid, id] of Object.entries(markets)) void saveMarketMeta(id, { description: descriptionFor(f), resolutionCriteria: criteriaFor(KIND_BY_ID[kid]) }).catch(() => undefined)
          if (Object.keys(markets).length) {
            try { await registerFixtures([{ ...f, markets }]) } catch (e) { toast.error(`Lines were created but could not be registered (${e instanceof Error ? e.message : e}). Use “Recover” below.`, { duration: 15000 }) }
          }
        } catch (e) {
          const msg = parseOnchainError(e)
          if (/reject|denied|cancel/i.test(msg)) { stop.current = true; toast.error('Signature rejected: stopped.'); break }
          failed++; toast.error(`${f.home.name} vs ${f.away.name}: ${msg}`)
        }
        done++
      }
    } catch (e) { toast.error(parseOnchainError(e)) } finally {
      setRunning(null)
      toast[failed ? 'warning' : 'success'](`${created} line${created === 1 ? '' : 's'} created${failed ? `, ${failed} match${failed === 1 ? '' : 'es'} failed` : ''}`)
      try { const reg = await fetchRegistry(); setRegistry(reg); setFixtures(fs => fs.filter(f => !reg.some(r => r.eventId === f.eventId))) } catch { /* ignore */ }
    }
  }

  // ── Recovery: rebuild the registry from markets that exist on chain ──
  const [orphans, setOrphans] = useState<{ eventId: string; lines: Record<string, string> }[]>([])
  const [recovering, setRecovering] = useState(false)
  const scanChain = async () => {
    const contract = sportsAddress(); if (!contract) { setOrphans([]); return }
    try {
      const chainId = activeChainId()
      const matchIds = (await readContract(wagmi, { address: contract, chainId, abi: SPORTS_ABI, functionName: 'getMatchIds' })) as bigint[]
      const have = new Set(registry.map(r => r.eventId))
      const out: { eventId: string; lines: Record<string, string> }[] = []
      for (const mid of matchIds.filter(m => !have.has(m.toString()))) {
        const ids = (await readContract(wagmi, { address: contract, chainId, abi: SPORTS_ABI, functionName: 'getMatchLines', args: [mid] })) as bigint[]
        const lines = (await readContract(wagmi, { address: contract, chainId, abi: SPORTS_ABI, functionName: 'getLines', args: [ids] })) as unknown as { id: bigint; kind: string }[]
        out.push({ eventId: mid.toString(), lines: Object.fromEntries(lines.map(l => [l.kind, l.id.toString()])) })
      }
      setOrphans(out)
    } catch { /* contract not set yet */ }
  }
  useEffect(() => { void scanChain() }, [network, registry.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const recover = async () => {
    setRecovering(true)
    try {
      const ids = [...new Set([...leagues, ...custom.split(/[\s,]+/).filter(Boolean)])]
      const fx: Fixture[] = []
      for (let i = 0; i < ids.length; i += 6) {
        const got = await Promise.all(ids.slice(i, i + 6).map(id => fetchFixtures(id, 30).then(r => r.fixtures).catch(() => [] as Fixture[])))
        fx.push(...got.flat())
      }
      const records: unknown[] = []
      for (const g of orphans) {
        const f = fx.find(x => x.eventId === g.eventId)
        if (f) records.push({ ...f, markets: g.lines })
      }
      if (!records.length) { toast.error('No matching fixtures found. Select the leagues these matches belong to (above) and try again.'); return }
      await registerFixtures(records)
      toast.success(`Recovered ${records.length} match${records.length === 1 ? '' : 'es'}`)
      await reloadRegistry()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Recovery failed') } finally { setRecovering(false) }
  }

  // ── Settlement ──
  const check = async () => { try { setDue(await fetchDue()) } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not check results') } }
  const settleActions = async (items: { m: DueMatch; actions: DueMatch['actions']; score?: { home: number; away: number } }[]) => {
    const contract = sportsAddress(), chainId = activeChainId()
    if (!contract) return toast.error('Set the Sports contract address first.')
    setSettling(true)
    const marks: unknown[] = []
    let ok = 0
    try {
      const flat = items.flatMap(it => it.actions.map(a => ({ a, score: it.score })))
      for (let i = 0; i < flat.length; i += 30) {
        const batch = flat.slice(i, i + 30)
        const lines = (await readContract(wagmi, { address: contract, chainId, abi: SPORTS_ABI, functionName: 'getLines', args: [batch.map(x => BigInt(x.a.marketId))] })) as unknown as { status: number }[]
        const rIds: bigint[] = [], rWin: bigint[] = [], cIds: bigint[] = [], rMarks: unknown[] = [], cMarks: unknown[] = []
        batch.forEach((x, k) => {
          const st = Number(lines[k]?.status)
          if (st === 1 || st === 2) { marks.push({ eventId: x.a.eventId, marketId: x.a.marketId, how: st === 1 ? 'resolved' : 'cancelled', score: x.score }); return }
          if (x.a.action === 'resolve') { rIds.push(BigInt(x.a.marketId)); rWin.push(BigInt(x.a.outcome ?? 0)); rMarks.push({ eventId: x.a.eventId, marketId: x.a.marketId, how: 'resolved', score: x.score }) }
          else { cIds.push(BigInt(x.a.marketId)); cMarks.push({ eventId: x.a.eventId, marketId: x.a.marketId, how: 'cancelled', score: x.score }) }
        })
        const send = async (fn: 'resolveMany' | 'cancelMany', args: unknown[], m: unknown[]) => {
          const req = { address: contract, chainId, abi: SPORTS_ABI, functionName: fn, args } as never
          await simulateContract(wagmi, req)
          const hash = await writeContractAsync(req)
          const rc = await waitForTransactionReceipt(wagmi, { hash, chainId })
          if (rc.status !== 'success') throw new Error('reverted')
          ok += m.length; marks.push(...m)
        }
        if (rIds.length) await send('resolveMany', [rIds, rWin], rMarks)
        if (cIds.length) await send('cancelMany', [cIds], cMarks)
      }
    } catch (e) {
      const msg = parseOnchainError(e)
      toast.error(/reject|denied/i.test(msg) ? 'Signature rejected: stopped.' : msg)
    } finally {
      if (marks.length) { try { await recordSettled(marks) } catch { /* retried on next check */ } }
      setSettling(false)
      if (ok) toast.success(`${ok} line${ok === 1 ? '' : 's'} settled`)
      await reloadRegistry(); await check()
    }
  }
  const settleAll = () => {
    if (!due) return
    void settleActions(due.filter(m => m.actions.length).map(m => ({ m, actions: m.actions, score: m.score ? { home: Number(m.score.split('-')[0]), away: Number(m.score.split('-')[1]) } : undefined })))
  }
  const settleManual = (m: DueMatch) => {
    const rec = registry.find(r => r.eventId === m.eventId); const s = manual[m.eventId]
    if (!rec || !s || s.h === '' || s.a === '') return toast.error('Enter the 90-minute score')
    const h = Math.max(0, Math.floor(Number(s.h))), a = Math.max(0, Math.floor(Number(s.a)))
    if (!Number.isFinite(h) || !Number.isFinite(a)) return
    const actions = Object.entries(rec.markets).filter(([, id]) => !rec.settled[id]).map(([kind, marketId]) => ({ eventId: rec.eventId, marketId, kind, action: 'resolve' as const, outcome: KIND_BY_ID[kind]?.settle(h, a) ?? 0 }))
    void settleActions([{ m, actions, score: { home: h, away: a } }])
  }
  const cancelMatch = (m: DueMatch) => {
    const rec = registry.find(r => r.eventId === m.eventId); if (!rec) return
    if (!confirm(`Cancel every open market for ${m.title}? Stakes are refunded.`)) return
    const actions = Object.entries(rec.markets).filter(([, id]) => !rec.settled[id]).map(([kind, marketId]) => ({ eventId: rec.eventId, marketId, kind, action: 'cancel' as const }))
    void settleActions([{ m, actions }])
  }

  const [resolverAddr, setResolverAddr] = useState('')
  const setResolver = async (allowed: boolean) => {
    const contract = sportsAddress(), chainId = activeChainId(), who = resolverAddr || keeper?.address || ''
    if (!contract) return toast.error('Save the Sports contract address first.')
    if (!isAddress(who)) return toast.error('Enter the settlement wallet address.')
    try {
      const req = { address: contract, chainId, abi: SPORTS_ABI, functionName: 'setResolver', args: [who, allowed] } as never
      await simulateContract(wagmi, req)
      const hash = await writeContractAsync(req)
      const rc = await waitForTransactionReceipt(wagmi, { hash, chainId })
      if (rc.status !== 'success') throw new Error('reverted')
      toast.success(allowed ? 'Settlement wallet authorised' : 'Settlement wallet removed')
      fetchSportsKeeper().then(setKeeper).catch(() => undefined)
    } catch (e) { toast.error(parseOnchainError(e)) }
  }

  const saveSettings = async () => {
    try { await saveConfig({ ...cfg, sportsLiquidityUsdc: liqNum }); setCfg(loadConfig()); toast.success('Sports settings saved') } catch (e) { toast.error(e instanceof Error ? e.message : 'Save failed') }
  }

  const open = registry.filter(r => Object.values(r.markets).some(id => !r.settled[id])).sort((a, b) => a.kickoff - b.kickoff)
  const groups = [...new Set(KINDS.map(k => k.group))]

  return (
    <div className="space-y-5">
      {/* Contract */}
      <div className="rounded-2xl p-4 space-y-3" style={card}>
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-sm">Sports contract ({network})</b>
          <input className={`${inputCls} flex-1 min-w-64 font-mono`} placeholder="0x… PredarcSports address (deploy docs/remix/PredarcSportsRemix.sol)" value={cfg[network].sportsAddress ?? ''}
            onChange={e => setCfg(c => ({ ...c, [network]: { ...c[network], sportsAddress: e.target.value.trim() } }))} />
          <button onClick={saveSettings} className="px-3 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>Save</button>
        </div>
        {!!(cfg[network].sportsAddress) && !isAddress(cfg[network].sportsAddress ?? '') && <p className="text-xs" style={{ color: 'var(--danger, #dc2626)' }}>That is not a valid address.</p>}
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
          <span>Settlement wallet:</span>
          <input className={`${inputCls} w-80 font-mono`} placeholder="0x… keeper wallet address" value={resolverAddr || keeper?.address || ''} onChange={e => setResolverAddr(e.target.value.trim())} />
          <button onClick={() => void setResolver(true)} className="px-3 py-1.5 rounded-lg font-medium" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>Authorise</button>
          <button onClick={() => void setResolver(false)} className="px-3 py-1.5 rounded-lg" style={{ border: '1px solid var(--border)' }}>Remove</button>
          <span>(only the contract owner can do this; the keeper wallet is the one whose key is in <code>SPORTS_RESOLVER_PRIVATE_KEY</code>)</span>
        </div>
      </div>

      {/* Settings */}
      <div className="rounded-2xl p-4 flex flex-wrap items-center gap-4" style={card}>
        <div className="flex items-center gap-2 font-semibold"><Trophy size={16} style={{ color: 'var(--accent)' }} /> Soccer betting</div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.sportsEnabled !== false} onChange={e => setCfg(c => ({ ...c, sportsEnabled: e.target.checked }))} /> Show Sports to visitors</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.sportsAutoSettle !== false} onChange={e => setCfg(c => ({ ...c, sportsAutoSettle: e.target.checked }))} /> Auto-settle finished matches</label>
        <button onClick={saveSettings} className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}><Save size={14} /> Save</button>
      </div>

      {/* Generate */}
      <div className="rounded-2xl p-4 space-y-4" style={card}>
        <h3 className="font-semibold">1 · Generate markets from real fixtures</h3>
        <div>
          <div className="flex flex-wrap gap-2 items-center mb-2">
            <div className="relative"><Search size={13} className="absolute left-2.5 top-2.5" style={{ color: 'var(--subtle)' }} />
              <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Find a league or country" className={`${inputCls} pl-8`} /></div>
            <button className="text-xs underline" onClick={() => setLeagues(LEAGUES.map(l => l.id))}>all</button>
            <button className="text-xs underline" onClick={() => setLeagues([])}>none</button>
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>{leagues.length} selected</span>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
            {shownLeagues.map(l => {
              const on = leagues.includes(l.id)
              return <button key={l.id} onClick={() => setLeagues(x => toggle(x, l.id))} className="px-2.5 py-1 rounded-full text-xs"
                style={{ background: on ? 'var(--accent)' : 'var(--surface-muted)', color: on ? 'var(--accent-text)' : 'var(--muted)', border: '1px solid var(--border)' }}>
                {l.name} <span style={{ opacity: .6 }}>· {l.region}</span></button>
            })}
          </div>
          <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="Other ESPN league codes, e.g. ned.2, por.2 (comma separated)" className={`${inputCls} w-full mt-2`} />
        </div>

        <div>
          <p className="text-xs mb-1.5" style={{ color: 'var(--subtle)' }}>Betting lines per match</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {groups.map(g => (
              <div key={g}>
                <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'var(--subtle)' }}>{g}</p>
                <div className="flex flex-wrap gap-1.5">
                  {KINDS.filter(k => k.group === g).map(k => {
                    const on = kinds.includes(k.id)
                    return <button key={k.id} title={k.label} onClick={() => setKinds(x => toggle(x, k.id))} className="px-2.5 py-1 rounded-lg text-xs font-medium"
                      style={{ background: on ? 'var(--accent)' : 'var(--surface-muted)', color: on ? 'var(--accent-text)' : 'var(--muted)', border: '1px solid var(--border)' }}>{k.short}</button>
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-2 text-xs">
            <button className="underline" onClick={() => setKinds(DEFAULT_KINDS)}>Standard set</button>
            <button className="underline" onClick={() => setKinds(['1x2'])}>1X2 only</button>
            <button className="underline" onClick={() => setKinds(KINDS.map(k => k.id))}>Everything</button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs" style={{ color: 'var(--subtle)' }}>Days ahead
            <select value={days} onChange={e => setDays(Number(e.target.value))} className={`${inputCls} block mt-1`}>{[1, 2, 3, 5, 7, 10, 14, 21, 30].map(d => <option key={d} value={d}>{d}</option>)}</select></label>
          <label className="text-xs" style={{ color: 'var(--subtle)' }}>Liquidity per market (USDC)
            <input value={liq} onChange={e => setLiq(e.target.value)} className={`${inputCls} block mt-1 w-32`} inputMode="decimal" /></label>
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Load fixtures</button>
        </div>

        {fixtures.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-2 text-xs">
              <b>{chosen.length}/{fixtures.length} matches</b>
              <button className="underline" onClick={() => setPicked(new Set(fixtures.map(f => f.eventId)))}>all</button>
              <button className="underline" onClick={() => setPicked(new Set())}>none</button>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-xl divide-y" style={{ border: '1px solid var(--border)', borderColor: 'var(--border)' }}>
              {fixtures.map(f => (
                <label key={f.eventId} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={picked.has(f.eventId)} onChange={() => setPicked(s => { const n = new Set(s); n.has(f.eventId) ? n.delete(f.eventId) : n.add(f.eventId); return n })} />
                  <span className="flex-1 truncate">{f.home.name} <span style={{ color: 'var(--subtle)' }}>vs</span> {f.away.name}</span>
                  <span className="text-xs hidden sm:inline" style={{ color: 'var(--subtle)' }}>{f.leagueName}</span>
                  <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>{fmt(f.kickoff)}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button onClick={generate} disabled={!!running || !chosen.length || !kinds.length} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
                <Zap size={14} /> Create {chosen.length} match{chosen.length === 1 ? '' : 'es'} ({totalMarkets} lines)</button>
              {running && <button onClick={() => { stop.current = true }} className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg" style={{ border: '1px solid var(--border)' }}><Square size={12} /> Stop after this one</button>}
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                One approval, then one signature per match (all its lines at once). Liquidity backs the payouts: {totalUsdc.toLocaleString()} USDC total ({liqNum}/line, min 1). You get it back (plus leftovers) after each match via Withdraw.
              </span>
            </div>
            {running && (
              <div className="mt-3">
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}><div className="h-full" style={{ width: `${(running.done / Math.max(1, running.total)) * 100}%`, background: 'var(--accent)' }} /></div>
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{running.done}/{running.total} · {running.label}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {orphans.length > 0 && (
        <div className="rounded-2xl p-4 flex flex-wrap items-center gap-3 text-sm" style={{ background: 'color-mix(in srgb, var(--warning) 12%, var(--surface))', border: '1px solid var(--warning)' }}>
          <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />
          <span className="flex-1 min-w-48"><b>{orphans.length} match{orphans.length === 1 ? '' : 'es'}</b> ({orphans.reduce((n, g) => n + Object.keys(g.lines).length, 0)} markets) exist on chain but aren't on the Sports page yet. Select their leagues above, then recover them.</span>
          <button onClick={recover} disabled={recovering} className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>{recovering ? 'Recovering…' : 'Recover'}</button>
        </div>
      )}

      {/* Settle */}
      <div className="rounded-2xl p-4 space-y-3" style={card}>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-semibold">2 · Results &amp; settlement</h3>
          <button onClick={check} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}><RefreshCw size={12} /> Check results</button>
          {due?.some(m => m.actions.length) && (
            <button onClick={settleAll} disabled={settling} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
              <CheckCircle2 size={12} /> Settle {due.reduce((n, m) => n + m.actions.length, 0)} markets now</button>
          )}
        </div>
        <div className="text-xs rounded-lg p-3" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
          {!keeper?.configured
            ? <>Automatic settlement is <b>off</b>: add the secret <code>SPORTS_RESOLVER_PRIVATE_KEY</code> in Cloudflare (Pages → Settings → Variables and Secrets) and redeploy. Use a dedicated wallet (not your owner key), fund it with a little gas and authorise it below. Until then, press the button above after matches end.</>
            : keeper.authorised === false
              ? <><AlertTriangle size={12} className="inline mr-1" style={{ color: 'var(--warning)' }} />Resolver wallet <code>{keeper.address}</code> is <b>not authorised</b> on the Sports contract yet. Press “Authorise” below with the owner wallet.</>
              : <>Auto-settle is <b>on</b> via <code>{keeper.address}</code> (gas balance {Number(keeper.balance || 0).toFixed(3)}). Finished matches are settled within a minute or two of any visitor being on the site; add a free cron ping to <code>POST /api/sports-keeper?network={network}</code> every 5 minutes so it never depends on visitors.</>}
        </div>
        {due && due.length === 0 && <p className="text-sm" style={{ color: 'var(--subtle)' }}>Nothing is waiting to be settled.</p>}
        {due?.map(m => (
          <div key={m.eventId} className="flex flex-wrap items-center gap-3 text-sm rounded-lg px-3 py-2" style={{ border: '1px solid var(--border)' }}>
            <span className="flex-1 min-w-40">{m.title}</span>
            {m.state === 'final' && <span className="font-mono">{m.score} · {m.actions.length} to settle</span>}
            {m.state === 'cancelled' && <><span style={{ color: 'var(--warning)' }}>Cancelled by the league</span><span>{m.actions.length} to refund</span></>}
            {m.state === 'pending' && <span style={{ color: 'var(--subtle)' }}>Not finished yet</span>}
            {m.state === 'manual' && (<>
              <span className="text-xs" style={{ color: 'var(--warning)' }}>{m.reason}</span>
              <input placeholder="H" className={`${inputCls} w-14 text-center`} value={manual[m.eventId]?.h ?? ''} onChange={e => setManual(x => ({ ...x, [m.eventId]: { h: e.target.value, a: x[m.eventId]?.a ?? '' } }))} />
              <input placeholder="A" className={`${inputCls} w-14 text-center`} value={manual[m.eventId]?.a ?? ''} onChange={e => setManual(x => ({ ...x, [m.eventId]: { a: e.target.value, h: x[m.eventId]?.h ?? '' } }))} />
              <button disabled={settling} onClick={() => settleManual(m)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>Settle</button>
              <button disabled={settling} onClick={() => cancelMatch(m)} className="px-3 py-1.5 rounded-lg text-xs" style={{ border: '1px solid var(--border)' }}>Cancel all</button>
            </>)}
          </div>
        ))}
      </div>

      {/* Registry */}
      <div className="rounded-2xl p-4" style={card}>
        <h3 className="font-semibold mb-2">3 · Generated matches ({open.length} open, {registry.length - open.length} settled)</h3>
        {open.length === 0 ? <p className="text-sm" style={{ color: 'var(--subtle)' }}>No open matches yet.</p> : (
          <div className="max-h-80 overflow-y-auto divide-y" style={{ borderColor: 'var(--border)' }}>
            {open.map(r => (
              <div key={r.eventId} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1 truncate">{r.home.name} vs {r.away.name}</span>
                <span className="text-xs hidden sm:inline" style={{ color: 'var(--subtle)' }}>{r.leagueName}</span>
                <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>{fmt(r.kickoff)}</span>
                <span className="text-xs">{Object.keys(r.markets).length} lines</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
