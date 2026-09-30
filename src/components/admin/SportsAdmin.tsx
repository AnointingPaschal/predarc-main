import { useEffect, useMemo, useRef, useState } from 'react'
import { useConfig, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt, simulateContract, readContract } from 'wagmi/actions'
import { erc20Abi, keccak256, toHex, parseUnits } from 'viem'
import { toast } from 'sonner'
import { Trophy, Search, RefreshCw, Zap, Square, CheckCircle2, AlertTriangle, Save } from 'lucide-react'
import { PREDARC_ABI, type Market } from '../../lib/contract'
import { activeContract, activeChainId, activeUsdc, loadConfig, saveConfig, useNetwork, type SiteConfig } from '../../lib/adminConfig'
import { saveMarketMeta } from '../../lib/api'
import { parseOnchainError } from '../../lib/errors'
import {
  KINDS, KIND_BY_ID, DEFAULT_KINDS, LEAGUES, SPORTS_CATEGORY, outcomesFor, questionFor, descriptionFor, criteriaFor,
  endTimeFor, resolutionTimeFor, type Fixture, type SportsRecord,
} from '../../lib/sportsCore'
import {
  fetchFixtures, fetchRegistry, fetchDue, fetchSportsKeeper, registerFixtures, recordSettled,
  type DueMatch, type KeeperStatus,
} from '../../lib/sports'

const card = { background: 'var(--surface)', border: '1px solid var(--border)' } as const
const inputCls = 'px-3 py-2 rounded-lg text-sm outline-none bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--ink)]'
const CREATED = keccak256(toHex('MarketCreated(uint256,uint8,string,uint256)'))
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
    const contract = activeContract(), chainId = activeChainId()
    if (!contract) return toast.error('Set the contract address for this network first (Config).')
    if (!chosen.length || !kinds.length) return
    stop.current = false
    setRunning({ done: 0, total: totalMarkets, label: liqNum > 0 ? 'Approving USDC…' : 'Starting…' })
    let created = 0, failed = 0
    try {
      const liquidity = liqNum > 0 ? parseUnits(String(liqNum), 6) : 0n
      if (liquidity > 0n) {
        const need = liquidity * BigInt(totalMarkets)
        const h = await writeContractAsync({ address: activeUsdc(), chainId, abi: erc20Abi, functionName: 'approve', args: [contract, need] })
        const r = await waitForTransactionReceipt(wagmi, { hash: h, chainId })
        if (r.status !== 'success') throw new Error('USDC approval reverted')
      }
      let done = 0
      for (const f of chosen) {
        if (stop.current) break
        const markets: Record<string, string> = {}
        for (const kid of kinds) {
          if (stop.current) break
          const kind = KIND_BY_ID[kid]
          setRunning({ done, total: totalMarkets, label: `${f.home.name} vs ${f.away.name} · ${kind.short}` })
          try {
            const outcomes = outcomesFor(kind, f)
            const args = [outcomes.length === 2 ? 0 : 1, questionFor(kind, f), outcomes, BigInt(endTimeFor(f)), BigInt(resolutionTimeFor(f)), 0n, 0n, SPORTS_CATEGORY, '', liquidity] as const
            await simulateContract(wagmi, { address: contract, chainId, abi: PREDARC_ABI, functionName: 'createMarket', args })
            const hash = await writeContractAsync({ address: contract, chainId, abi: PREDARC_ABI, functionName: 'createMarket', args })
            const rc = await waitForTransactionReceipt(wagmi, { hash, chainId })
            if (rc.status !== 'success') throw new Error('reverted')
            const log = rc.logs.find(l => l.address.toLowerCase() === contract.toLowerCase() && l.topics[0] === CREATED)
            if (log?.topics[1]) {
              const id = BigInt(log.topics[1]).toString()
              markets[kid] = id; created++
              void saveMarketMeta(id, { description: descriptionFor(f), resolutionCriteria: criteriaFor(kind) }).catch(() => undefined)
            }
          } catch (e) {
            const msg = parseOnchainError(e)
            if (/reject|denied|cancel/i.test(msg)) { stop.current = true; toast.error('Signature rejected: stopped.'); break }
            failed++; console.warn('market failed', f.eventId, kid, msg)
          }
          done++
        }
        if (Object.keys(markets).length) {
          try { await registerFixtures([{ ...f, markets }]) } catch (e) { toast.error(`Markets were created but could not be registered (${e instanceof Error ? e.message : e}). Use “Recover” below.`, { duration: 15000 }) }
        }
      }
    } catch (e) { toast.error(parseOnchainError(e)) } finally {
      setRunning(null)
      toast[failed ? 'warning' : 'success'](`${created} market${created === 1 ? '' : 's'} created${failed ? `, ${failed} failed` : ''}`)
      try { const reg = await fetchRegistry(); setRegistry(reg); setFixtures(fs => fs.filter(f => !reg.some(r => r.eventId === f.eventId))) } catch { /* ignore */ }
    }
  }

  // ── Recovery: rebuild the registry from markets that exist on chain ──
  const [orphans, setOrphans] = useState<{ prefix: string; end: number; lines: Record<string, string> }[]>([])
  const [recovering, setRecovering] = useState(false)
  const scanChain = async () => {
    const contract = activeContract(); if (!contract) return
    try {
      const all = (await readContract(wagmi, { address: contract, chainId: activeChainId(), abi: PREDARC_ABI, functionName: 'getAllMarkets' })) as unknown as Market[]
      const registered = new Set(registry.flatMap(r => Object.values(r.markets)))
      const labelToKind = new Map(KINDS.map(k => [k.label, k.id]))
      const groups = new Map<string, { prefix: string; end: number; lines: Record<string, string> }>()
      for (const m of all) {
        if (m.category !== SPORTS_CATEGORY || registered.has(m.id.toString())) continue
        const i = m.question.lastIndexOf(' · ')
        if (i < 0) continue
        const kind = labelToKind.get(m.question.slice(i + 3)); if (!kind) continue
        const prefix = m.question.slice(0, i), end = Number(m.endTime)
        const g = groups.get(`${prefix}|${end}`) ?? { prefix, end, lines: {} }
        g.lines[kind] = m.id.toString(); groups.set(`${prefix}|${end}`, g)
      }
      setOrphans([...groups.values()])
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
        const f = fx.find(x => Math.floor(x.kickoff / 1000) === g.end && `${x.home.name} vs ${x.away.name}` === g.prefix)
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
    const contract = activeContract(), chainId = activeChainId()
    setSettling(true)
    const marks: unknown[] = []
    let ok = 0, bad = 0
    try {
      for (const it of items) for (const a of it.actions) {
        try {
          const id = BigInt(a.marketId)
          const mk = (await readContract(wagmi, { address: contract, chainId, abi: PREDARC_ABI, functionName: 'getMarket', args: [id] })) as { status: number }
          if (mk.status === 2 || mk.status === 3) { marks.push({ eventId: a.eventId, marketId: a.marketId, how: mk.status === 2 ? 'resolved' : 'cancelled', score: it.score }); continue }
          const req = a.action === 'resolve'
            ? { address: contract, chainId, abi: PREDARC_ABI, functionName: 'resolveMarket', args: [id, BigInt(a.outcome ?? 0)] } as const
            : { address: contract, chainId, abi: PREDARC_ABI, functionName: 'cancelMarket', args: [id] } as const
          await simulateContract(wagmi, req as never)
          const hash = await writeContractAsync(req as never)
          const rc = await waitForTransactionReceipt(wagmi, { hash, chainId })
          if (rc.status !== 'success') throw new Error('reverted')
          ok++; marks.push({ eventId: a.eventId, marketId: a.marketId, how: a.action === 'resolve' ? 'resolved' : 'cancelled', score: it.score })
        } catch (e) {
          const msg = parseOnchainError(e); bad++
          if (/reject|denied/i.test(msg)) { toast.error('Signature rejected: stopped.'); throw e }
          toast.error(`#${a.marketId}: ${msg}`)
        }
      }
    } catch { /* stopped */ } finally {
      if (marks.length) { try { await recordSettled(marks) } catch { /* retried on next check */ } }
      setSettling(false)
      toast[bad ? 'warning' : 'success'](`${ok} settled${bad ? `, ${bad} failed` : ''}`)
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

  const saveSettings = async () => {
    try { await saveConfig({ ...cfg, sportsLiquidityUsdc: liqNum }); setCfg(loadConfig()); toast.success('Sports settings saved') } catch (e) { toast.error(e instanceof Error ? e.message : 'Save failed') }
  }

  const open = registry.filter(r => Object.values(r.markets).some(id => !r.settled[id])).sort((a, b) => a.kickoff - b.kickoff)
  const groups = [...new Set(KINDS.map(k => k.group))]

  return (
    <div className="space-y-5">
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
                <Zap size={14} /> Create {totalMarkets} market{totalMarkets === 1 ? '' : 's'}</button>
              {running && <button onClick={() => { stop.current = true }} className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg" style={{ border: '1px solid var(--border)' }}><Square size={12} /> Stop after this one</button>}
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                Each market is one wallet signature{liqNum > 0 ? ` plus one USDC approval; ${totalUsdc.toLocaleString()} USDC total liquidity` : ' (no liquidity: free, but nobody can trade until you add liquidity)'}.
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
            ? <>Automatic settlement is <b>off</b>: add the secret <code>SPORTS_RESOLVER_PRIVATE_KEY</code> in Cloudflare (Pages → Settings → Variables and Secrets) and redeploy. The market contract only lets its <b>owner</b> resolve, so that key must be the owner wallet's. Until then, press the button above after matches end.</>
            : keeper.isOwner === false
              ? <><AlertTriangle size={12} className="inline mr-1" style={{ color: 'var(--warning)' }} />Resolver wallet <code>{keeper.address}</code> is <b>not</b> the contract owner, so it can't settle. Use the owner's key or transfer ownership.</>
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
