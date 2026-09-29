// Market comments, stored in KV as one JSON array per market.
//   GET    /api/comments?network=mainnet&market=1
//   POST   /api/comments   { network, market, text, parentId? }   (wallet session)
//   DELETE /api/comments?network=&market=&id=                     (author or admin)
import { json, requireUser, requireAdmin, checkStorage, isNetwork, isMarketId, type Env } from '../_lib'

interface Comment { id: string; address: string; text: string; ts: number; parentId?: string; likes?: string[] }
const MAX_COMMENTS = 400
const MAX_LEN = 600
const key = (n: string, m: string) => `comments:${n}:${m}`

async function load(env: Env, n: string, m: string): Promise<Comment[]> {
  const raw = await env.PREDARC_KV.get(key(n, m))
  if (!raw) return []
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : [] } catch { return [] }
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const bad = checkStorage(env); if (bad) return bad
  const url = new URL(request.url)

  if (request.method === 'GET') {
    const n = url.searchParams.get('network'); const m = url.searchParams.get('market')
    if (!isNetwork(n) || !isMarketId(m)) return json({ error: 'network and market required' }, 400)
    return json({ comments: await load(env, n, m) })
  }

  if (request.method === 'POST') {
    const u = await requireUser(request, env); if (u instanceof Response) return u
    let body: { network?: unknown; market?: unknown; text?: unknown; parentId?: unknown; likeId?: unknown }
    try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
    if (!isNetwork(body.network) || !isMarketId(body.market)) return json({ error: 'network and market required' }, 400)
    const list = await load(env, body.network, body.market)

    if (typeof body.likeId === 'string') {
      const c = list.find(x => x.id === body.likeId)
      if (!c) return json({ error: 'Comment not found' }, 404)
      const likes = new Set(c.likes ?? [])
      if (likes.has(u.address)) likes.delete(u.address); else likes.add(u.address)
      c.likes = [...likes]
      await env.PREDARC_KV.put(key(body.network, body.market), JSON.stringify(list))
      return json({ comments: list })
    }

    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!text) return json({ error: 'Write something first.' }, 400)
    if (text.length > MAX_LEN) return json({ error: `Comments are limited to ${MAX_LEN} characters.` }, 400)
    const last = [...list].reverse().find(c => c.address === u.address)
    if (last && Date.now() - last.ts < 5000) return json({ error: 'Slow down — wait a few seconds between comments.' }, 429)
    const parentId = typeof body.parentId === 'string' && list.some(c => c.id === body.parentId) ? body.parentId : undefined
    const c: Comment = { id: crypto.randomUUID(), address: u.address, text, ts: Date.now(), ...(parentId ? { parentId } : {}) }
    const next = [...list, c].slice(-MAX_COMMENTS)
    await env.PREDARC_KV.put(key(body.network, body.market), JSON.stringify(next))
    return json({ comments: next })
  }

  if (request.method === 'DELETE') {
    const n = url.searchParams.get('network'); const m = url.searchParams.get('market'); const id = url.searchParams.get('id')
    if (!isNetwork(n) || !isMarketId(m) || !id) return json({ error: 'network, market and id required' }, 400)
    const list = await load(env, n, m)
    const c = list.find(x => x.id === id)
    if (!c) return json({ error: 'Comment not found' }, 404)
    const asAdmin = request.headers.has('x-admin-signature')
    if (asAdmin) { const a = await requireAdmin(request, env); if (a) return a }
    else { const u = await requireUser(request, env); if (u instanceof Response) return u; if (u.address !== c.address) return json({ error: 'Not your comment.' }, 403) }
    const next = list.filter(x => x.id !== id && x.parentId !== id)
    await env.PREDARC_KV.put(key(n, m), JSON.stringify(next))
    return json({ comments: next })
  }

  return json({ error: 'Method not allowed' }, 405)
}
