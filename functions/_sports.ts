// Soccer data (ESPN's public scoreboard) and the settlement plan for registered fixtures.
import { KIND_BY_ID, interpretResult, lineProbabilities, GENERIC_ODDS, type Fixture, type SportsRecord, type OddsInput } from '../src/lib/sportsCore'
import type { Env } from './_lib'

// ESPN's "site" API answers 403 to cloud servers, but the "core" API is open. Its list endpoints return $ref links,
// so an event costs a couple of extra requests; work is capped to stay inside the Workers subrequest limit.
const CORE = 'https://sports.core.api.espn.com/v2/sports/soccer/leagues'
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '')
const SLUG = /^[a-z0-9._-]{2,40}$/i
export const isLeagueSlug = (v: unknown): v is string => typeof v === 'string' && SLUG.test(v)
export const logoOf = (teamId: string) => `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`
const https = (u: string) => u.replace(/^http:\/\//, 'https://')

export const probes: string[] = []
async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(https(url), { headers: { accept: 'application/json' } })
    if (r.ok) return (await r.json()) as T
    probes.push(`${r.status} ${url.replace(CORE, '')}`)
  } catch (e) { probes.push(`ERR ${(e as Error).message.slice(0, 80)} ${url.replace(CORE, '')}`) }
  return null
}

interface Ref { $ref?: string }
interface CoreEvent {
  id?: string; date?: string; name?: string; shortName?: string
  competitions?: { id?: string; competitors?: { id?: string; homeAway?: string; team?: Ref; score?: Ref }[]; status?: Ref }[]
}
const idFromRef = (r?: Ref) => (r?.$ref ?? '').match(/\/(\d+)(?:\?|$)/)?.[1] ?? ''

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += n) out.push(...await Promise.all(items.slice(i, i + n).map(fn)))
  return out
}

async function eventDetail(league: string, eventId: string) {
  return getJson<CoreEvent>(`${CORE}/${league}/events/${eventId}`)
}

/** Upcoming (not started) fixtures for a league within the next `days` days. `null` means the feed could not be reached. */
export async function upcomingFixtures(league: string, days: number, leagueName?: string): Promise<Fixture[] | null> {
  const now = Date.now()
  const to = now + Math.max(1, Math.min(30, days)) * 86_400_000
  const list = await getJson<{ items?: Ref[] }>(`${CORE}/${league}/events?dates=${ymd(now)}-${ymd(to)}&limit=100`)
  if (!list) return null
  const ids = (list.items ?? []).map(i => idFromRef(i)).filter(Boolean).slice(0, 40)
  const events = (await pool(ids, 10, id => eventDetail(league, id))).filter((e): e is CoreEvent => !!e)
  const out: Fixture[] = []
  for (const e of events) {
    const kickoff = Date.parse(e.date ?? '')
    const comp = e.competitions?.[0]
    const home = comp?.competitors?.find(c => c.homeAway === 'home'), away = comp?.competitors?.find(c => c.homeAway === 'away')
    if (!e.id || !home?.id || !away?.id || !Number.isFinite(kickoff) || kickoff < now + 15 * 60_000) continue
    const short = (e.shortName ?? '').split(/\s+(?:@|vs)\s+/i) // "AWAY @ HOME"
    const name = (e.name ?? '')
    let hn = '', an = ''
    const at = name.split(/\s+at\s+/); if (at.length === 2) { an = at[0]; hn = at[1] }
    if (!hn || !an) { // neutral venue ("A vs B") or odd names: ask for the team names
      const [h, a] = await Promise.all([getJson<{ displayName?: string }>(home.team?.$ref ?? ''), getJson<{ displayName?: string }>(away.team?.$ref ?? '')])
      hn = h?.displayName ?? ''; an = a?.displayName ?? ''
    }
    if (!hn || !an) continue
    out.push({
      eventId: String(e.id), league, leagueName: leagueName || league, kickoff,
      home: { name: hn, abbr: short[1] ?? '', logo: logoOf(home.id) },
      away: { name: an, abbr: short[0] ?? '', logo: logoOf(away.id) },
    })
  }
  return out.sort((a, b) => a.kickoff - b.kickoff)
}

/** Current status and score of one match. */
export async function matchResult(r: Pick<SportsRecord, 'league' | 'eventId' | 'kickoff'>) {
  const ev = await eventDetail(r.league, r.eventId)
  const comp = ev?.competitions?.[0]
  if (!comp?.competitors) return interpretResult('', '', '')
  const home = comp.competitors.find(c => c.homeAway === 'home'), away = comp.competitors.find(c => c.homeAway === 'away')
  if (!home?.id || !away?.id) return interpretResult('', '', '')
  const cid = comp.id ?? r.eventId
  const base = `${CORE}/${r.league}/events/${r.eventId}/competitions/${cid}`
  const [st, hs, as] = await Promise.all([
    getJson<{ type?: { name?: string } }>(`${base}/status`),
    getJson<{ value?: number; displayValue?: string }>(`${base}/competitors/${home.id}/score`),
    getJson<{ value?: number; displayValue?: string }>(`${base}/competitors/${away.id}/score`),
  ])
  const num = (x: { value?: number; displayValue?: string } | null) => (x ? (x.value ?? x.displayValue ?? '') : '')
  return interpretResult(st?.type?.name ?? '', num(hs), num(as))
}

// ── Bookmaker odds (ESPN lists DraftKings / Bet365 prices) → opening probabilities for every betting line ──
type Side = { moneyLine?: number; value?: number; current?: { moneyLine?: number; american?: string }; odds?: { value?: number } } | undefined
const american = (ml: number) => (ml > 0 ? 1 + ml / 100 : ml < 0 ? 1 + 100 / -ml : 0)
function decimal(o: Side): number {
  if (!o) return 0
  const ml = o.current?.moneyLine ?? o.moneyLine
  if (typeof ml === 'number' && ml !== 0) return american(ml)
  const am = Number(o.current?.american)
  if (Number.isFinite(am) && am !== 0) return american(am)
  const v = o.odds?.value ?? o.value
  return typeof v === 'number' && v > 1 ? v : 0
}
interface OddsItem { provider?: { name?: string }; overUnder?: number; overOdds?: number; underOdds?: number; homeTeamOdds?: Side; awayTeamOdds?: Side; drawOdds?: Side }

export async function openingOdds(league: string, eventId: string): Promise<{ source: string; bps: Record<string, number[]> }> {
  const data = await getJson<{ items?: OddsItem[] }>(`${CORE}/${league}/events/${eventId}/competitions/${eventId}/odds`)
  for (const it of data?.items ?? []) {
    const h = decimal(it.homeTeamOdds), d = decimal(it.drawOdds), a = decimal(it.awayTeamOdds)
    if (h > 1 && d > 1 && a > 1) {
      const input: OddsInput = { home: 1 / h, draw: 1 / d, away: 1 / a }
      const ov = typeof it.overOdds === 'number' ? american(it.overOdds) : 0, un = typeof it.underOdds === 'number' ? american(it.underOdds) : 0
      if (typeof it.overUnder === 'number' && ov > 1 && un > 1) { input.line = it.overUnder; input.over = (1 / ov) / (1 / ov + 1 / un) }
      return { source: it.provider?.name ?? 'bookmaker', bps: lineProbabilities(input) }
    }
  }
  return { source: 'generic', bps: lineProbabilities(GENERIC_ODDS) }
}

// ── Registry of generated fixtures (KV) ──────────────────────────────────────
const key = (network: string) => `sports:${network}`
export async function loadRegistry(env: Env, network: string): Promise<SportsRecord[]> {
  try { const v = JSON.parse((await env.PREDARC_KV.get(key(network))) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
export async function saveRegistry(env: Env, network: string, list: SportsRecord[]) {
  const cutoff = Date.now() - 21 * 86_400_000
  const keep = list.filter(r => r.kickoff > cutoff || Object.keys(r.markets).some(k => !r.settled[r.markets[k]])).slice(-1500)
  await env.PREDARC_KV.put(key(network), JSON.stringify(keep))
}

export interface DueAction { eventId: string; marketId: string; kind: string; action: 'resolve' | 'cancel'; outcome?: number }
export interface DueMatch {
  eventId: string; title: string; state: 'final' | 'cancelled' | 'manual' | 'pending'
  score?: string; reason?: string; actions: DueAction[]
}

/** Which markets of finished matches can be settled right now, and how. */
export async function computeDue(env: Env, network: string, limit = 8): Promise<DueMatch[]> {
  const list = await loadRegistry(env, network)
  const now = Date.now()
  const open = list.filter(r => now > r.kickoff + 100 * 60_000 && Object.values(r.markets).some(id => !r.settled[id])).sort((a, b) => a.kickoff - b.kickoff).slice(0, limit)
  const out: DueMatch[] = []
  await Promise.all(open.map(async r => {
    const res = await matchResult(r)
    const pending = Object.entries(r.markets).filter(([, id]) => !r.settled[id])
    const m: DueMatch = { eventId: r.eventId, title: `${r.home.name} vs ${r.away.name}`, state: res.state, actions: [] }
    if (res.state === 'final') {
      m.score = `${res.home}-${res.away}`
      m.actions = pending.flatMap(([kind, marketId]) => KIND_BY_ID[kind] ? [{ eventId: r.eventId, marketId, kind, action: 'resolve' as const, outcome: KIND_BY_ID[kind].settle(res.home, res.away) }] : [])
    } else if (res.state === 'cancelled') {
      m.actions = pending.map(([kind, marketId]) => ({ eventId: r.eventId, marketId, kind, action: 'cancel' as const }))
    } else if (res.state === 'manual') m.reason = res.reason
    out.push(m)
  }))
  return out.sort((a, b) => a.title.localeCompare(b.title))
}

/** Record how markets ended (called after the on-chain transaction succeeded). */
export async function markSettled(env: Env, network: string, marks: { eventId: string; marketId: string; how: 'resolved' | 'cancelled'; score?: { home: number; away: number } }[]) {
  const list = await loadRegistry(env, network)
  for (const mk of marks) {
    const r = list.find(x => x.eventId === mk.eventId); if (!r) continue
    r.settled[mk.marketId] = mk.how
    if (mk.score) { r.result = mk.score; r.status = 'final' } else if (mk.how === 'cancelled') r.status = 'cancelled'
  }
  await saveRegistry(env, network, list)
}
