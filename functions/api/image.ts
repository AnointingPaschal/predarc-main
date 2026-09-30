// Market images. Uploaded by the admin, stored in KV, served with long cache headers, so the
// onchain imageUrl is just a short link (data URLs are far too large for a contract).
//   POST /api/image   raw image bytes (Content-Type: image/png|jpeg|webp|gif) — admin only → { id, path }
//   GET  /api/image?id=<id>
import { json, requireAdmin, checkStorage, type Env } from '../_lib'

const MAX_BYTES = 1_500_000
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const bad = checkStorage(env); if (bad) return bad
  const url = new URL(request.url)

  if (request.method === 'GET') {
    const id = url.searchParams.get('id') || ''
    if (!/^[a-f0-9]{16}$/.test(id)) return json({ error: 'bad id' }, 400)
    // Serve repeat views from Cloudflare's edge cache instead of decoding the KV value every time
    const edge = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default
    const cacheKey = new Request(`${url.origin}/api/image?id=${id}`)
    const hit = edge ? await edge.match(cacheKey) : undefined
    if (hit) return hit
    const raw = await env.PREDARC_KV.get(`img:${id}`)
    if (!raw) return json({ error: 'not found' }, 404)
    const { t, d } = JSON.parse(raw) as { t: string; d: string }
    const bin = atob(d); const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const out = new Response(bytes, { headers: { 'content-type': t, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } })
    if (edge) await edge.put(cacheKey, out.clone())
    return out
  }

  if (request.method === 'POST') {
    const a = await requireAdmin(request, env); if (a) return a
    const type = (request.headers.get('content-type') || '').split(';')[0].trim()
    if (!TYPES.includes(type)) return json({ error: 'Only PNG, JPEG, WebP or GIF images are allowed.' }, 400)
    const buf = new Uint8Array(await request.arrayBuffer())
    if (buf.length === 0) return json({ error: 'Empty file.' }, 400)
    if (buf.length > MAX_BYTES) return json({ error: `Image is too large (max ${Math.round(MAX_BYTES / 1000)} KB after resizing).` }, 413)
    let bin = ''
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    const id = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('')
    await env.PREDARC_KV.put(`img:${id}`, JSON.stringify({ t: type, d: btoa(bin) }))
    return json({ id, path: `/api/image?id=${id}` })
  }
  return json({ error: 'Method not allowed' }, 405)
}
