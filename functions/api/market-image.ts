// Automatic cover images for markets that have none, generated with the admin's saved OpenRouter key.
//   GET  /api/market-image?network=mainnet&markets=1,2,3  → { images: { "1": "/api/image?id=…" } }   (public, cheap)
//   POST /api/market-image { network, market }            → generates once per market (anyone may trigger; once only)
//   POST /api/market-image { network, market, force:true }→ regenerate (admin session required)
// 1) The text model writes a precise picture brief from the question and options (specific entities → their visual identifiers).
// 2) The image model (default google/gemini-2.5-flash-image) paints exactly that brief. Optional: `aiImageSvgFallback` lets the text
//    model draw a simple SVG when there is no image model. With neither, no image is made (never a generic one).
// The result is stored in KV (served by /api/image) and its link is saved in the market's meta.imageUrl.
import { createPublicClient, http } from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import { json, checkStorage, isNetwork, isMarketId, readJson, requireAdmin, PUBLIC_KEY, SECRET_KEY, type Env } from '../_lib'
import { cleanMeta } from '../_meta'
import { PREDARC_ABI } from '../../src/lib/contract'

const FALLBACK_RPCS = { mainnet: [...arc.rpcUrls.default.http], testnet: [...arcTestnet.rpcUrls.default.http] }
const metaKey = (n: string, m: string) => `meta:${n}:${m}`
const MAX_IMG = 2_500_000
const IMAGE_V = 2 // bump to regenerate every generated cover
type ImgEnv = Env & { VITE_CONTRACT_ADDRESS?: string; VITE_TESTNET_CONTRACT_ADDRESS?: string; MAINNET_RPC_URL?: string; TESTNET_RPC_URL?: string }

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const bad = checkStorage(env); if (bad) return bad
  const q = new URL(request.url).searchParams
  const network = q.get('network')
  if (!isNetwork(network)) return json({ error: 'network required' }, 400)
  const ids = (q.get('markets') || '').split(',').filter(isMarketId).slice(0, 60)
  const images: Record<string, string> = {}
  await Promise.all(ids.map(async id => {
    try {
      const m = JSON.parse((await env.PREDARC_KV.get(metaKey(network, id))) || '{}') as { imageUrl?: string; imageV?: number }
      if (m.imageUrl && (m.imageV ?? 0) >= IMAGE_V) images[id] = m.imageUrl
    } catch { /* skip */ }
  }))
  return json({ images }, 200, { 'cache-control': 'public, max-age=20' })
}

const toB64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s) }

/** Keep only inert vector drawing elements. */
function cleanSvg(raw: string): string | null {
  const m = raw.replace(/```(?:svg|xml)?/gi, '').match(/<svg[\s\S]*<\/svg>/i)
  if (!m) return null
  let s = m[0]
  if (s.length > 24_000) return null
  s = s.replace(/<\s*(script|foreignObject|image|iframe|object|embed|audio|video|a)\b[\s\S]*?(<\/\s*\1\s*>|\/>)/gi, '')
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/javascript:/gi, '')
  s = s.replace(/(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, '').replace(/@import[^;]*;?/gi, '').replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, 'none')
  if (!/xmlns=/.test(s)) s = s.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  if (!/viewBox=/i.test(s)) s = s.replace(/<svg/i, '<svg viewBox="0 0 256 256"')
  return s
}

async function visualBrief(apiKey: string, model: string, origin: string, question: string, outcomes: string[], category: string): Promise<string | null> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': origin, 'X-Title': 'Predarc Prediction Markets' },
    body: JSON.stringify({
      model, temperature: 0.2, max_tokens: 400,
      messages: [
        { role: 'system', content: 'You are an art director who writes precise picture briefs for news and prediction-market covers. Reply with ONE paragraph of at most 70 words and nothing else.' },
        { role: 'user', content: `Write a brief for ONE cover image that shows exactly what this prediction market is about.
Question: ${question}
Options: ${outcomes.join(' | ')}
Category: ${category || 'General'}

Rules:
- First identify the specific entities in the question (country, region, institution, sports teams, league, coin/company, event, product) and depict THEM through their recognisable visual identifiers: national flag colours and a landmark or parliament building for countries/elections; the exact team colours, kit and sport equipment for sport; the coin's symbol or the company's product for finance/tech; the relevant building, object or scene for events.
- Name the concrete objects, setting, composition and colour palette. Not generic, not abstract, nothing that could illustrate a different market.
- No text, letters, numbers or logos in the image. Never depict a real person's face; use a symbolic silhouette or an object instead.` },
      ],
    }),
  })
  if (!res.ok) return null
  const data = await res.json() as { choices?: { message?: { content?: string } }[] }
  const t = (data.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  return t ? t.slice(0, 600) : null
}

async function paint(apiKey: string, model: string, origin: string, subject: string): Promise<{ type: string; b64: string } | null> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': origin, 'X-Title': 'Predarc Prediction Markets' },
    body: JSON.stringify({
      model, modalities: ['image', 'text'],
      messages: [{ role: 'user', content: `Create a square cover illustration for a prediction market. ${subject}\n\nStyle: modern editorial illustration, bold clean shapes, rich harmonious colours, one clear focal subject, tidy composition. Absolutely no text, letters, numbers, logos or watermarks. No real person's face.` }],
    }),
  })
  if (!res.ok) return null
  const data = await res.json() as { choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[] }
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? ''
  const mm = url.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!mm || mm[2].length * 0.75 > MAX_IMG) return null
  return { type: mm[1], b64: mm[2] }
}

async function drawSvg(apiKey: string, model: string, origin: string, subject: string, category: string): Promise<string | null> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': origin, 'X-Title': 'Predarc Prediction Markets' },
    body: JSON.stringify({
      model, temperature: 0.8, max_tokens: 3500,
      messages: [
        { role: 'system', content: 'You are a vector illustrator. Reply with ONE complete SVG document and nothing else.' },
        { role: 'user', content: `Draw a square cover illustration (viewBox="0 0 256 256") for a prediction market.
Picture brief (follow it exactly): ${subject}
Category: ${category || 'General'}.
Rules: flat modern vector style; a rich two-colour gradient background filling the whole canvas; one bold, instantly recognisable central subject built from simple shapes that depicts the topic (e.g. a ballot box and stars for elections, a ball and net for sport, coins and a chart line for crypto/finance, a chip and circuits for tech, a globe for world events; use national flag colours for country topics); 2-3 accent shapes. NO text, letters or numbers. Only <svg>, <defs>, <linearGradient>, <radialGradient>, <stop>, <rect>, <circle>, <ellipse>, <path>, <polygon>, <g>. No scripts, images or external references. Under 5KB.` },
      ],
    }),
  })
  if (!res.ok) return null
  const data = await res.json() as { choices?: { message?: { content?: string } }[] }
  return cleanSvg(data.choices?.[0]?.message?.content ?? '')
}

export const onRequestPost = async ({ request, env }: { request: Request; env: ImgEnv }): Promise<Response> => {
  const bad = checkStorage(env); if (bad) return bad
  let body: { network?: unknown; market?: unknown; force?: unknown }
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!isNetwork(body.network) || !isMarketId(body.market)) return json({ error: 'network and market required' }, 400)
  const network = body.network, marketId = body.market
  const force = body.force === true
  if (force) { const a = await requireAdmin(request, env); if (a) return a }

  let existing: Record<string, unknown> = {}
  try { existing = JSON.parse((await env.PREDARC_KV.get(metaKey(network, marketId))) || '{}') } catch { /* empty */ }
  if (existing.imageUrl && (Number(existing.imageV) || 0) >= IMAGE_V && !force) return json({ status: 'exists', imageUrl: existing.imageUrl })

  const lockKey = `lock:image:${network}:${marketId}`
  const cool = Number((await env.PREDARC_KV.get(lockKey)) || 0)
  if (!force && Date.now() - cool < 30 * 60_000) return json({ status: 'cooldown' })
  await env.PREDARC_KV.put(lockKey, String(Date.now()), { expirationTtl: 3600 })

  const pub = await readJson(env, PUBLIC_KEY)
  const secret = await readJson(env, SECRET_KEY)
  const apiKey = String(secret.openrouterApiKey ?? '').trim()
  if (!apiKey) return json({ status: 'unavailable', reason: 'Add an OpenRouter key in Admin → Config.' })

  const net = (pub[network] ?? {}) as { contractAddress?: string; rpcUrl?: string }
  const contract = (net.contractAddress || (network === 'testnet' ? env.VITE_TESTNET_CONTRACT_ADDRESS : env.VITE_CONTRACT_ADDRESS) || '').trim()
  if (!/^0x[0-9a-fA-F]{40}$/.test(contract)) return json({ status: 'unavailable', reason: 'No contract address set.' })
  const priv = ((network === 'testnet' ? env.TESTNET_RPC_URL : env.MAINNET_RPC_URL) || '').trim()
  const urls = [...new Set([priv, (net.rpcUrl || '').trim(), ...FALLBACK_RPCS[network]].filter(Boolean))]
  type M = { question: string; category: string; imageUrl: string; outcomes: string[] }
  const found: { m?: M } = {}
  for (const url of urls) {
    try {
      const c = createPublicClient({ transport: http(url, { timeout: 8000, retryCount: 0 }) })
      found.m = await c.readContract({ address: contract as `0x${string}`, abi: PREDARC_ABI, functionName: 'getMarket', args: [BigInt(marketId)] }) as unknown as M
      break
    } catch { /* next rpc */ }
  }
  const m = found.m
  if (!m) return json({ status: 'error', reason: 'Could not read the market.' })
  if (m.imageUrl && !force) return json({ status: 'has-onchain-image' })

  const origin = new URL(request.url).origin
  const imageModel = String(pub.openrouterImageModel ?? 'google/gemini-2.5-flash-image').trim()
  const textModel = String(pub.openrouterModel ?? '').trim() || 'openai/gpt-4o-mini'
  // Step 1: a precise picture brief about THIS market; step 2: paint exactly that. No brief = no image (never a generic one).
  let brief: string | null = null
  try { brief = await visualBrief(apiKey, textModel, origin, m.question, [...m.outcomes], m.category) } catch { /* handled below */ }
  if (!brief) return json({ status: 'error', reason: 'Could not describe the market for the image model. It will retry later.' })
  let type = '', data = ''
  if (imageModel) {
    try { const p = await paint(apiKey, imageModel, origin, brief); if (p) { type = p.type; data = p.b64 } } catch { /* optional SVG fallback below */ }
  }
  if (!data && pub.aiImageSvgFallback === true) {
    try {
      const svg = await drawSvg(apiKey, textModel, origin, brief, m.category)
      if (svg) { type = 'image/svg+xml'; data = toB64(new TextEncoder().encode(svg)) }
    } catch { /* give up below */ }
  }
  if (!data) return json({ status: 'error', reason: 'The AI could not produce an image right now. It will retry later.' })

  const id = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('')
  await env.PREDARC_KV.put(`img:${id}`, JSON.stringify({ t: type, d: data }))
  const imageUrl = `/api/image?id=${id}`
  await env.PREDARC_KV.put(metaKey(network, marketId), JSON.stringify({ ...existing, ...cleanMeta({ imageUrl, imageV: IMAGE_V, imageBrief: brief }) }))
  return json({ status: 'generated', imageUrl })
}
