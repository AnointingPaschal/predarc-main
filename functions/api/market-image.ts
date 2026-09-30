// AI cover image for a market — ADMIN ONLY, on demand (nothing is ever generated automatically).
//   POST /api/market-image { question, outcomes[], category?, webSearch?, hint? }  → { type, data (base64), brief }
// 1) The text model writes a precise picture brief from the question and options (optionally researching the entities online),
//    naming the specific countries / teams / coins / institutions and their recognisable visual identifiers.
// 2) The image model (default google/gemini-2.5-flash-image) paints exactly that brief.
// 3) Optional: `aiImageSvgFallback` lets the text model draw a simple SVG when there is no image model.
// The browser shrinks the picture and uploads it through /api/image, so the on-chain link is short and the file is small.
import { json, checkStorage, readJson, requireAdmin, PUBLIC_KEY, SECRET_KEY, type Env } from '../_lib'

const MAX_IMG = 3_000_000
const ORIGIN_HEADERS = (apiKey: string, origin: string) => ({ Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': origin, 'X-Title': 'Predarc Prediction Markets' })

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
const toB64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s) }

async function visualBrief(o: { apiKey: string; model: string; origin: string; web: boolean; question: string; outcomes: string[]; category: string; hint: string }): Promise<string | null> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: ORIGIN_HEADERS(o.apiKey, o.origin),
    body: JSON.stringify({
      model: o.model, temperature: 0.3, max_tokens: 500,
      ...(o.web ? { plugins: [{ id: 'web', max_results: 4 }] } : {}),
      messages: [
        { role: 'system', content: 'You are an art director who writes precise picture briefs for news and prediction-market covers. Reply with ONE paragraph of at most 80 words and nothing else.' },
        { role: 'user', content: `Write a brief for ONE cover image that shows exactly what this prediction market is about.
Question: ${o.question}
Options: ${o.outcomes.join(' | ')}
Category: ${o.category || 'General'}
${o.hint ? `Admin's direction (follow it): ${o.hint}\n` : ''}
Rules:
- First identify the specific entities in the question (country, region, institution, sports teams, league, coin/company, event, product) and depict THEM through their recognisable visual identifiers: national flag colours and a landmark or parliament building for countries/elections; the exact team colours, kit and sport equipment for sport; the coin's symbol or the company's product for finance/tech; the relevant building, object or scene for events.
${o.web ? '- Use the web results to confirm what these entities really look like (colours, landmarks, kits, symbols) instead of guessing.\n' : ''}- Name the concrete objects, setting, composition and colour palette. Not generic, not abstract, nothing that could illustrate a different market.
- No text, letters, numbers or logos in the image. Never depict a real person's face; use a symbolic silhouette or an object instead.` },
      ],
    }),
  })
  if (!res.ok) return null
  const data = await res.json() as { choices?: { message?: { content?: string } }[] }
  const t = (data.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  return t ? t.slice(0, 700) : null
}

async function paint(apiKey: string, model: string, origin: string, brief: string): Promise<{ type: string; data: string } | null> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: ORIGIN_HEADERS(apiKey, origin),
    body: JSON.stringify({
      model, modalities: ['image', 'text'],
      messages: [{ role: 'user', content: `Create a square cover illustration for a prediction market. ${brief}\n\nStyle: modern editorial illustration, bold clean shapes, rich harmonious colours, one clear focal subject, tidy composition. Absolutely no text, letters, numbers, logos or watermarks. No real person's face.` }],
    }),
  })
  if (!res.ok) return null
  const data = await res.json() as { choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[] }
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? ''
  const mm = url.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!mm || mm[2].length * 0.75 > MAX_IMG) return null
  return { type: mm[1], data: mm[2] }
}

async function drawSvg(apiKey: string, model: string, origin: string, brief: string): Promise<string | null> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: ORIGIN_HEADERS(apiKey, origin),
    body: JSON.stringify({
      model, temperature: 0.7, max_tokens: 3500,
      messages: [
        { role: 'system', content: 'You are a vector illustrator. Reply with ONE complete SVG document and nothing else.' },
        { role: 'user', content: `Draw a square cover illustration (viewBox="0 0 256 256") that follows this brief exactly: ${brief}
Flat modern vector style; a two-colour gradient background filling the canvas; one bold central subject from simple shapes. NO text, letters or numbers. Only <svg>, <defs>, <linearGradient>, <radialGradient>, <stop>, <rect>, <circle>, <ellipse>, <path>, <polygon>, <g>. No scripts, images or external references. Under 5KB.` },
      ],
    }),
  })
  if (!res.ok) return null
  const data = await res.json() as { choices?: { message?: { content?: string } }[] }
  return cleanSvg(data.choices?.[0]?.message?.content ?? '')
}

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const bad = checkStorage(env); if (bad) return bad
  const a = await requireAdmin(request, env); if (a) return a
  let body: { question?: unknown; outcomes?: unknown; category?: unknown; webSearch?: unknown; hint?: unknown }
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 400) : ''
  if (!question) return json({ error: 'Write the market question first.' }, 400)
  const outcomes = Array.isArray(body.outcomes) ? body.outcomes.map(o => String(o).slice(0, 80)).slice(0, 10) : []
  const category = typeof body.category === 'string' ? body.category.slice(0, 40) : ''
  const hint = typeof body.hint === 'string' ? body.hint.trim().slice(0, 300) : ''

  const pub = await readJson(env, PUBLIC_KEY)
  const secret = await readJson(env, SECRET_KEY)
  const apiKey = String(secret.openrouterApiKey ?? '').trim()
  if (!apiKey) return json({ error: 'Add an OpenRouter key in Admin → Config first.' }, 400)
  const imageModel = String(pub.openrouterImageModel ?? 'google/gemini-2.5-flash-image').trim()
  const textModel = String(pub.openrouterModel ?? '').trim() || 'openai/gpt-4o-mini'
  const web = body.webSearch === true
  const origin = new URL(request.url).origin

  let brief: string | null = null
  try { brief = await visualBrief({ apiKey, model: textModel, origin, web, question, outcomes, category, hint }) } catch { /* below */ }
  if (!brief) return json({ error: 'The AI could not describe this market for the image. Try again.' }, 502)

  if (imageModel) {
    try { const p = await paint(apiKey, imageModel, origin, brief); if (p) return json({ ...p, brief }) } catch { /* optional SVG fallback below */ }
  }
  if (pub.aiImageSvgFallback === true) {
    try {
      const svg = await drawSvg(apiKey, textModel, origin, brief)
      if (svg) return json({ type: 'image/svg+xml', data: toB64(new TextEncoder().encode(svg)), brief })
    } catch { /* below */ }
  }
  return json({ error: imageModel ? `The image model (${imageModel}) did not return a picture. It may need credit, or pick another image model in Admin → Config.` : 'No image model is set in Admin → Config.', brief }, 502)
}
