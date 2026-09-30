// Soccer data (ESPN's public scoreboard) and the settlement plan for registered fixtures.
import { KIND_BY_ID, interpretResult, type Fixture, type SportsRecord } from '../src/lib/sportsCore'
import type { Env } from './_lib'

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '')
const SLUG = /^[a-z0-9._-]{2,40}$/i
export const isLeagueSlug = (v: unknown): v is string => typeof v === 'string' && SLUG.test(v)

interface EspnTeam { displayName?: string; shortDisplayName?: string; abbreviation?: string; logo?: string }
interface EspnComp { homeAway?: string; score?: string | number; team?: EspnTeam }
interface EspnEvent {
  id?: string; date?: string
  status?: { type?: { name?: string; state?: string } }
  competitions?: { competitors?: EspnComp[]; status?: { type?: { name?: string; state?: string } } }[]
}
interface Scoreboard { events?: EspnEvent[]; leagues?: { name?: string }[] }

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 Predarc' }, cf: { cacheTtl: 60, cacheEverything: true } } as RequestInit)
    if (!r.ok) return null
    return (await r.json()) as T
  } catch { return null }
}

const team = (c?: EspnComp) => ({ name: c?.team?.displayName || c?.team?.shortDisplayName || '?', abbr: c?.team?.abbreviation || '', logo: c?.team?.logo || '' })

async function scoreboard(league: string, from: number, to: number): Promise<Scoreboard | null> {
  const q = from === to ? ymd(from) : `${ymd(from)}-${ymd(to)}`
  const ranged = await getJson<Scoreboard>(`${BASE}/${league}/scoreboard?dates=${q}&limit=300`)
  if (ranged) return ranged
  if (from === to) return null
  // Some leagues reject ranges: fall back to day by day (max a week)
  const events: EspnEvent[] = []; let name: string | undefined
  for (let t = from, n = 0; t <= to && n < 8; t += 86_400_000, n++) {
    const day = await getJson<Scoreboard>(`${BASE}/${league}/scoreboard?dates=${ymd(t)}&limit=300`)
    if (day) { events.push(...(day.events ?? [])); name = name ?? day.leagues?.[0]?.name }
  }
  return events.length || name ? { events, leagues: [{ name }] } : null
}

/** Upcoming (not started) fixtures for a league within the next `days` days. */
export async function upcomingFixtures(league: string, days: number, leagueName?: string): Promise<Fixture[]> {
  const now = Date.now()
  const sb = await scoreboard(league, now, now + Math.max(1, Math.min(14, days)) * 86_400_000)
  if (!sb) return []
  const name = leagueName || sb.leagues?.[0]?.name || league
  const out: Fixture[] = []
  for (const e of sb.events ?? []) {
    const comp = e.competitions?.[0]
    const state = e.status?.type?.state ?? comp?.status?.type?.state
    const kickoff = Date.parse(e.date ?? '')
    if (!e.id || !comp?.competitors || state !== 'pre' || !Number.isFinite(kickoff) || kickoff < now + 15 * 60_000) continue
    const home = comp.competitors.find(c => c.homeAway === 'home'), away = comp.competitors.find(c => c.homeAway === 'away')
    if (!home || !away) continue
    out.push({ eventId: String(e.id), league, leagueName: name, kickoff, home: team(home), away: team(away) })
  }
  return out.sort((a, b) => a.kickoff - b.kickoff)
}

/** Current status and score of one match, looked up on the scoreboard of its kick-off day (then the summary endpoint). */
export async function matchResult(r: Pick<SportsRecord, 'league' | 'eventId' | 'kickoff'>) {
  const day = (delta: number) => r.kickoff + delta * 86_400_000
  for (const d of [0, 1, -1]) {
    const sb = await getJson<Scoreboard>(`${BASE}/${r.league}/scoreboard?dates=${ymd(day(d))}&limit=300`)
    const e = sb?.events?.find(x => String(x.id) === r.eventId)
    const comp = e?.competitions?.[0]
    if (e && comp?.competitors) {
      const status = e.status?.type?.name ?? comp.status?.type?.name ?? ''
      const h = comp.competitors.find(c => c.homeAway === 'home'), a = comp.competitors.find(c => c.homeAway === 'away')
      return interpretResult(status, h?.score ?? '', a?.score ?? '')
    }
  }
  const sum = await getJson<{ header?: { competitions?: EspnEvent['competitions'] } }>(`${BASE}/${r.league}/summary?event=${r.eventId}`)
  const comp = sum?.header?.competitions?.[0]
  if (comp?.competitors) {
    const h = comp.competitors.find(c => c.homeAway === 'home'), a = comp.competitors.find(c => c.homeAway === 'away')
    return interpretResult(comp.status?.type?.name ?? '', h?.score ?? '', a?.score ?? '')
  }
  return interpretResult('', '', '')
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
export async function computeDue(env: Env, network: string, limit = 12): Promise<DueMatch[]> {
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
