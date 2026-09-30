// Soccer fixtures, generated-market registry and settlement plan.
//   GET  /api/sports?action=leagues
//   GET  /api/sports?action=fixtures&league=eng.1&days=7      upcoming fixtures from ESPN   (public)
//   GET  /api/sports?action=registry&network=mainnet          generated fixtures + market ids (public)
//   GET  /api/sports?action=due&network=mainnet               markets that can be settled now (public, read-only)
//   POST /api/sports { action:'register', network, records }  admin: remember freshly created markets
//   POST /api/sports { action:'settled',  network, marks }    admin: record settled markets
import { json, requireAdmin, checkStorage, isNetwork, isMarketId, type Env } from '../_lib'
import { upcomingFixtures, loadRegistry, saveRegistry, computeDue, markSettled, isLeagueSlug } from '../_sports'
import { LEAGUES, KIND_BY_ID, type SportsRecord } from '../../src/lib/sportsCore'

const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n)
const cleanTeam = (t: unknown) => { const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>; const logo = clip(o.logo, 300); return { name: clip(o.name, 80), abbr: clip(o.abbr, 8), logo: /^https:\/\//.test(logo) ? logo : '' } }

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const url = new URL(request.url); const action = url.searchParams.get('action')
  if (action === 'leagues') return json({ leagues: LEAGUES })
  if (action === 'fixtures') {
    const league = url.searchParams.get('league')
    if (!isLeagueSlug(league)) return json({ error: 'league required' }, 400)
    const days = Number(url.searchParams.get('days')) || 7
    const fixtures = await upcomingFixtures(league, days, LEAGUES.find(l => l.id === league)?.name)
    return json({ fixtures })
  }
  const bad = checkStorage(env); if (bad) return bad
  const network = url.searchParams.get('network')
  if (!isNetwork(network)) return json({ error: 'network required' }, 400)
  if (action === 'registry') return json({ records: await loadRegistry(env, network) }, 200)
  if (action === 'due') return json({ matches: await computeDue(env, network) })
  return json({ error: 'unknown action' }, 400)
}

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const bad = checkStorage(env); if (bad) return bad
  const a = await requireAdmin(request, env); if (a) return a
  let body: { action?: string; network?: unknown; records?: unknown; marks?: unknown }
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!isNetwork(body.network)) return json({ error: 'network required' }, 400)
  const network = body.network
  if (body.action === 'register' && Array.isArray(body.records)) {
    const list = await loadRegistry(env, network)
    for (const raw of body.records.slice(0, 200)) {
      const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
      const eventId = clip(o.eventId, 30), league = clip(o.league, 40)
      if (!eventId || !isLeagueSlug(league)) continue
      const markets: Record<string, string> = {}
      for (const [k, v] of Object.entries((o.markets && typeof o.markets === 'object' ? o.markets : {}) as Record<string, unknown>)) {
        if (KIND_BY_ID[k] && isMarketId(String(v))) markets[k] = String(v)
      }
      if (!Object.keys(markets).length) continue
      const existing = list.find(r => r.eventId === eventId)
      if (existing) { Object.assign(existing.markets, markets); continue }
      const rec: SportsRecord = {
        eventId, league, leagueName: clip(o.leagueName, 80), kickoff: Number(o.kickoff) || 0,
        home: cleanTeam(o.home), away: cleanTeam(o.away), markets, status: 'scheduled', settled: {}, createdAt: Date.now(),
      }
      if (rec.kickoff > 0) list.push(rec)
    }
    await saveRegistry(env, network, list)
    return json({ records: list })
  }
  if (body.action === 'settled' && Array.isArray(body.marks)) {
    const marks = body.marks.slice(0, 500).flatMap(m => {
      const o = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>
      const s = o.score as { home?: unknown; away?: unknown } | undefined
      if (!isMarketId(String(o.marketId)) || (o.how !== 'resolved' && o.how !== 'cancelled')) return []
      return [{ eventId: clip(o.eventId, 30), marketId: String(o.marketId), how: o.how as 'resolved' | 'cancelled', score: s && Number.isFinite(Number(s.home)) && Number.isFinite(Number(s.away)) ? { home: Number(s.home), away: Number(s.away) } : undefined }]
    })
    await markSettled(env, network, marks)
    return json({ ok: true })
  }
  return json({ error: 'unknown action' }, 400)
}
