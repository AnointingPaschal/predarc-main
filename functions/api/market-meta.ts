// Off-chain details for a market: resolution rules, sources, AI analysis.
//   GET /api/market-meta?network=&market=          public
//   PUT /api/market-meta  { network, market, meta } admin only
import { json, requireAdmin, checkStorage, isNetwork, isMarketId, type Env } from '../_lib'
import { cleanMeta } from '../_meta'

const key = (n: string, m: string) => `meta:${n}:${m}`
const indexKey = (n: string) => `imgindex:${n}`
export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const bad = checkStorage(env); if (bad) return bad
  const url = new URL(request.url)
  if (request.method === 'GET') {
    const n = url.searchParams.get('network'); const m = url.searchParams.get('market')
    if (url.searchParams.get('images') && isNetwork(n)) {
      let images = {}; try { images = JSON.parse((await env.PREDARC_KV.get(indexKey(n))) || '{}') } catch { /* empty */ }
      return json({ images })
    }
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
    const merged = { ...existing, ...cleanMeta(body.meta as Record<string, unknown>) }
    await env.PREDARC_KV.put(key(body.network, body.market), JSON.stringify(merged))
    // Public index of cover images (market id -> url), so lists can show covers without one request per market
    if ('imageUrl' in (body.meta as object)) {
      let idx: Record<string, string> = {}; try { idx = JSON.parse((await env.PREDARC_KV.get(indexKey(body.network))) || '{}') } catch { /* empty */ }
      const u = (merged as { imageUrl?: string }).imageUrl
      if (u) idx[body.market] = u; else delete idx[body.market]
      await env.PREDARC_KV.put(indexKey(body.network), JSON.stringify(idx))
    }
    return json({ meta: merged })
  }
  return json({ error: 'Method not allowed' }, 405)
}
