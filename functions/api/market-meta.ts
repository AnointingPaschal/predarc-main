// Off-chain details for a market: resolution rules, sources, AI analysis.
//   GET /api/market-meta?network=&market=          public
//   PUT /api/market-meta  { network, market, meta } admin only
import { json, requireAdmin, checkStorage, isNetwork, isMarketId, type Env } from '../_lib'

const key = (n: string, m: string) => `meta:${n}:${m}`
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined)

function clean(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  const d = str(input.description, 3000); if (d !== undefined) out.description = d
  const r = str(input.resolutionCriteria, 3000); if (r !== undefined) out.resolutionCriteria = r
  if (Array.isArray(input.sources)) {
    out.sources = input.sources.slice(0, 12).map(s => {
      const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
      return { title: str(o.title, 200) ?? '', url: str(o.url, 500) ?? '' }
    }).filter(s => /^https?:\/\//.test(s.url))
  }
  if (input.analysis && typeof input.analysis === 'object') {
    const a = input.analysis as Record<string, unknown>
    const list = (v: unknown, n: number, m: number) => (Array.isArray(v) ? v.slice(0, n).map(x => String(x).slice(0, m)) : [])
    out.analysis = {
      summary: str(a.summary, 2000) ?? '',
      reasoning: list(a.reasoning, 10, 600),
      bullCase: list(a.bullCase, 8, 400),
      bearCase: list(a.bearCase, 8, 400),
      risks: list(a.risks, 8, 400),
      probabilities: Array.isArray(a.probabilities)
        ? a.probabilities.slice(0, 10).map(p => { const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>; return { outcome: str(o.outcome, 100) ?? '', probability: Math.max(0, Math.min(1, Number(o.probability) || 0)) } })
        : [],
      confidence: ['low', 'medium', 'high'].includes(String(a.confidence)) ? String(a.confidence) : 'medium',
      model: str(a.model, 100) ?? '',
      generatedAt: Number(a.generatedAt) || Date.now(),
    }
  }
  return out
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const bad = checkStorage(env); if (bad) return bad
  const url = new URL(request.url)
  if (request.method === 'GET') {
    const n = url.searchParams.get('network'); const m = url.searchParams.get('market')
    if (!isNetwork(n) || !isMarketId(m)) return json({ error: 'network and market required' }, 400)
    const raw = await env.PREDARC_KV.get(key(n, m))
    let meta = {}; try { meta = raw ? JSON.parse(raw) : {} } catch { /* empty */ }
    return json({ meta })
  }
  if (request.method === 'PUT') {
    const a = await requireAdmin(request, env); if (a) return a
    let body: { network?: unknown; market?: unknown; meta?: unknown }
    try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
    if (!isNetwork(body.network) || !isMarketId(body.market) || !body.meta || typeof body.meta !== 'object') return json({ error: 'network, market and meta required' }, 400)
    const existingRaw = await env.PREDARC_KV.get(key(body.network, body.market))
    let existing: Record<string, unknown> = {}; try { existing = existingRaw ? JSON.parse(existingRaw) : {} } catch { /* empty */ }
    const merged = { ...existing, ...clean(body.meta as Record<string, unknown>) }
    await env.PREDARC_KV.put(key(body.network, body.market), JSON.stringify(merged))
    return json({ meta: merged })
  }
  return json({ error: 'Method not allowed' }, 405)
}
