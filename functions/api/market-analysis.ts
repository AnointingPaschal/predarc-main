// Automatic AI insights for a market, generated server-side with the admin's saved OpenRouter
// key and model, so every visitor gets them without any admin action.
//   POST /api/market-analysis  { network, market }            (anyone; only regenerates when stale)
//   POST /api/market-analysis  { network, market, force:true } (admin session required)
// The market is read straight from the chain using the RPC/contract saved for that network.
import { createPublicClient, http } from 'viem'
import { json, checkStorage, isNetwork, isMarketId, readJson, requireAdmin, fetchHeadlines, PUBLIC_KEY, SECRET_KEY, type Env } from '../_lib'
import { cleanMeta } from '../_meta'
import { PREDARC_ABI } from '../../src/lib/contract'
import { pricesFromPools } from '../../src/lib/marketMath'

const TTL_MS = 6 * 60 * 60 * 1000
const DEFAULT_RPC = { mainnet: 'https://rpc.mainnet.arc.io', testnet: 'https://rpc.testnet.arc.network' }

interface NetCfg { contractAddress?: string; rpcUrl?: string }
const metaKey = (n: string, m: string) => `meta:${n}:${m}`

const extract = (text: string): Record<string, unknown> | undefined => {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  try { return JSON.parse(t) } catch { /* fall through */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}')
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)) } catch { /* give up */ } }
  return undefined
}

export const onRequestPost = async ({ request, env }: { request: Request; env: Env & { VITE_CONTRACT_ADDRESS?: string; VITE_TESTNET_CONTRACT_ADDRESS?: string } }): Promise<Response> => {
  const bad = checkStorage(env); if (bad) return bad
  let body: { network?: unknown; market?: unknown; force?: unknown }
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!isNetwork(body.network) || !isMarketId(body.market)) return json({ error: 'network and market required' }, 400)
  const network = body.network, marketId = body.market

  let existing: Record<string, unknown> = {}
  try { existing = JSON.parse((await env.PREDARC_KV.get(metaKey(network, marketId))) || '{}') } catch { /* empty */ }
  const analysis = existing.analysis as { generatedAt?: number } | undefined
  const fresh = !!analysis?.generatedAt && Date.now() - analysis.generatedAt < TTL_MS
  const needsRules = !existing.resolutionCriteria
  const force = body.force === true
  if (force) { const a = await requireAdmin(request, env); if (a) return a }
  if (!force && fresh && !needsRules) return json({ status: 'fresh', meta: existing })

  // One generation at a time per market
  const lockKey = `lock:analysis:${network}:${marketId}`
  if (!force && (await env.PREDARC_KV.get(lockKey))) return json({ status: 'pending', meta: existing })

  const pub = await readJson(env, PUBLIC_KEY)
  const secret = await readJson(env, SECRET_KEY)
  const apiKey = String(secret.openrouterApiKey ?? '').trim()
  if (!apiKey) return json({ status: 'unavailable', reason: 'AI is not configured — add an OpenRouter key in Admin → Config.', meta: existing })
  const model = String(pub.openrouterModel ?? '').trim() || 'openai/gpt-4o-mini'

  const net = (pub[network] ?? {}) as NetCfg
  const envAddr = network === 'testnet' ? env.VITE_TESTNET_CONTRACT_ADDRESS : env.VITE_CONTRACT_ADDRESS
  const contract = (net.contractAddress || envAddr || '').trim()
  const rpc = (net.rpcUrl || DEFAULT_RPC[network]).trim()
  if (!/^0x[0-9a-fA-F]{40}$/.test(contract)) return json({ status: 'unavailable', reason: `No ${network} contract address is configured.`, meta: existing })

  await env.PREDARC_KV.put(lockKey, '1', { expirationTtl: 90 })
  try {
    const client = createPublicClient({ transport: http(rpc) })
    const m = await client.readContract({ address: contract as `0x${string}`, abi: PREDARC_ABI, functionName: 'getMarket', args: [BigInt(marketId)] }) as unknown as {
      question: string; outcomes: string[]; outcomePools: bigint[]; totalLiquidity: bigint; endTime: bigint; resolutionTime: bigint; status: number; category: string
    }
    if (!force && (m.status !== 0 || Number(m.endTime) * 1000 < Date.now())) return json({ status: 'closed', meta: existing })

    const prices = pricesFromPools([...m.outcomePools])
    const marketLine = m.outcomes.map((o, i) => `${o}: ${(prices[i] * 100).toFixed(1)}%`).join(', ')
    const keywords = m.question.replace(/[^\w\s$%.-]/g, ' ').split(/\s+/).filter(w => w.length > 3).slice(0, 8).join(' ')
    let headlines = ''
    try { headlines = (await fetchHeadlines(keywords, 10)).map(h => `- ${h.title}${h.source ? ` (${h.source})` : ''}`).join('\n') } catch { /* optional */ }

    const wantRules = needsRules || force
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': new URL(request.url).origin, 'X-Title': 'Predarc Prediction Markets' },
      body: JSON.stringify({
        model, temperature: 0.4, max_tokens: 2800,
        messages: [
          { role: 'system', content: 'You are a rigorous forecasting analyst for a prediction market. Be concrete, use the evidence provided, avoid hype, never claim certainty. Respond with valid JSON only.' },
          { role: 'user', content: `Analyze this prediction market.
Question: ${m.question}
Category: ${m.category}
Outcomes and current market-implied probabilities: ${marketLine}
Pool liquidity: $${(Number(m.totalLiquidity) / 1e6).toFixed(2)}
Trading ends: ${new Date(Number(m.endTime) * 1000).toUTCString()} · resolution: ${new Date(Number(m.resolutionTime) * 1000).toUTCString()}
Today: ${new Date().toUTCString()}

Recent headlines:
${headlines || '(none found)'}

Return JSON:
{"summary":"2-3 sentence overview","reasoning":["4-6 step-by-step points"],"bullCase":["2-4 reasons the first outcome is likely"],"bearCase":["2-4 reasons against"],"risks":["2-4 key uncertainties or resolution risks"],"probabilities":[{"outcome":"<exact outcome name>","probability":0.0}],"confidence":"low|medium|high"${wantRules ? `,
"description":"1-2 sentences of neutral background","resolutionCriteria":"Precise rules: what counts as each outcome, the data source, the cutoff time (UTC), and what happens if unclear","sources":[{"title":"...","url":"https://real-well-known-site"}]` : ''}}
Probabilities must cover every outcome and sum to 1.` },
        ],
      }),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      const hint = res.status === 401 ? 'The OpenRouter key was rejected.' : res.status === 402 ? 'The OpenRouter account is out of credits.' : res.status === 429 ? 'OpenRouter rate limit reached.' : `OpenRouter error ${res.status}.`
      return json({ status: 'error', reason: `${hint} ${t.slice(0, 120)}`.trim(), meta: existing })
    }
    const data = await res.json() as { choices?: { message?: { content?: string } }[] }
    const j = extract(data.choices?.[0]?.message?.content ?? '')
    if (!j) return json({ status: 'error', reason: 'The AI returned an invalid response. It will retry on the next visit.', meta: existing })

    const patch: Record<string, unknown> = { analysis: { ...(j as object), model, generatedAt: Date.now() } }
    if (wantRules) {
      if (typeof j.description === 'string' && !existing.description) patch.description = j.description
      if (typeof j.resolutionCriteria === 'string' && (!existing.resolutionCriteria || force && !existing.resolutionCriteria)) patch.resolutionCriteria = j.resolutionCriteria
      if (Array.isArray(j.sources) && !(existing.sources as unknown[] | undefined)?.length) patch.sources = j.sources
    }
    const merged = { ...existing, ...cleanMeta(patch) }
    await env.PREDARC_KV.put(metaKey(network, marketId), JSON.stringify(merged))
    return json({ status: 'generated', meta: merged })
  } catch (e) {
    return json({ status: 'error', reason: e instanceof Error ? e.message.slice(0, 200) : 'Analysis failed', meta: existing })
  } finally {
    await env.PREDARC_KV.delete(lockKey)
  }
}
