// AI Market Generation via OpenRouter
// Calls the OpenRouter API with the admin-configured key and model

export interface AIMarketDraft {
  question: string
  marketType: 0 | 1 | 2          // 0=Binary, 1=MultipleChoice, 2=Scalar
  outcomes: string[]
  category: string
  imageUrl: string
  scalarLow: number
  scalarHigh: number
  scalarUnit: string              // e.g. "$", "%", "°C"
  rationale: string               // AI's reasoning
  suggestedLiquidity: number      // USDC
  suggestedDurationDays: number
}

export type AIGenerateMode =
  | 'topic'        // User provides a topic, AI generates one market
  | 'batch'        // AI generates N markets for chosen categories
  | 'news'         // AI generates markets based on recent news/events prompt
  | 'auto'         // Background auto-generation (called on interval)

export interface AIGenerateOptions {
  mode: AIGenerateMode
  topic?: string           // for 'topic' mode
  count?: number           // for 'batch' / 'auto' (default 5)
  categories?: string[]    // for 'batch' / 'auto'
  newsContext?: string     // for 'news' mode — paste headlines or context
  marketTypes?: ('binary' | 'multiple' | 'scalar')[]  // which types to include
  avoid?: string[]         // existing questions to not repeat
  apiKey: string
  model: string
}

const SYSTEM_PROMPT = `You are a prediction market designer for Predarc, a Polymarket-like platform on Arc blockchain.
You generate high-quality, specific, and resolvable prediction market questions.

Rules:
- Questions must be objective and verifiable (can be definitively resolved)
- Include a clear resolution criteria implied by the question
- Binary markets: exactly 2 outcomes ["Yes", "No"]
- Multiple choice: 3-8 outcomes, mutually exclusive and exhaustive
- Scalar markets: numeric range with a unit (price, percentage, count, temperature)
- Avoid vague or subjective questions
- Make questions specific with timeframes (e.g. "by end of Q4 2026", "before December 31 2026")
- Categories: Crypto, Sports, Politics, Entertainment, Science, Finance, Other

You MUST respond with valid JSON only. No markdown, no explanation outside the JSON.`

function buildPrompt(opts: AIGenerateOptions): string {
  const avoid = opts.avoid?.length ? `\nDo NOT repeat or closely paraphrase any of these existing questions:\n${opts.avoid.slice(-30).map(q => `- ${q}`).join('\n')}\n` : ''
  return buildPromptCore(opts) + avoid
}

function buildPromptCore(opts: AIGenerateOptions): string {
  const types = opts.marketTypes ?? ['binary', 'multiple', 'scalar']
  const typeHint = types.join(', ')

  if (opts.mode === 'topic') {
    return `Generate 1 prediction market about: "${opts.topic ?? 'general'}"
Market types to consider: ${typeHint}
Return a JSON array with exactly 1 item matching this schema:
${SCHEMA_HINT}`
  }

  if (opts.mode === 'news') {
    return `Based on these recent events/headlines, generate ${opts.count ?? 5} prediction markets:

${opts.newsContext ?? 'Recent crypto, sports, and world events'}

Spread across categories: ${(opts.categories ?? ['Crypto', 'Sports', 'Politics']).join(', ')}
Market types to use: ${typeHint}
Return a JSON array with ${opts.count ?? 5} items matching this schema:
${SCHEMA_HINT}`
  }

  if (opts.mode === 'batch' || opts.mode === 'auto') {
    return `Generate ${opts.count ?? 5} diverse prediction markets.
Categories to cover: ${(opts.categories ?? ['Crypto', 'Sports', 'Politics', 'Finance', 'Entertainment']).join(', ')}
Market types to use: ${typeHint}
Make markets relevant to current world events as of ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}. Use end dates in the future.
Return a JSON array with ${opts.count ?? 5} items matching this schema:
${SCHEMA_HINT}`
  }

  return `Generate 3 prediction markets. Return JSON array. ${SCHEMA_HINT}`
}

const SCHEMA_HINT = `[
  {
    "question": "Will BTC exceed $100,000 by December 31 2026?",
    "marketType": 0,
    "outcomes": ["Yes", "No"],
    "category": "Crypto",
    "imageUrl": "",
    "scalarLow": 0,
    "scalarHigh": 0,
    "scalarUnit": "",
    "rationale": "Bitcoin has been approaching all-time highs...",
    "suggestedLiquidity": 100,
    "suggestedDurationDays": 90
  }
]`


const OPENROUTER_URL = 'https://openrouter.ai/api/v1'

function orHeaders(apiKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${apiKey.trim()}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': window.location.origin,
    'X-Title': 'Predarc Prediction Markets',
  }
}

async function orError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  try {
    const j = JSON.parse(text) as { error?: { message?: string } }
    if (j.error?.message) return j.error.message
  } catch { /* not json */ }
  return text.slice(0, 200) || res.statusText
}

/** Tolerant JSON extraction: handles ```json fences and text around the JSON. */
function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  try { return JSON.parse(t) } catch { /* fall through */ }
  const start = t.search(/[\[{]/)
  const end = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'))
  if (start >= 0 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)) } catch { /* give up */ }
  }
  return undefined
}

/** One chat completion. Retries once without response_format for models that reject it. */
async function chat(
  apiKey: string, model: string,
  messages: { role: 'system' | 'user'; content: string }[],
  o: { temperature?: number; maxTokens?: number; json?: boolean } = {},
): Promise<string> {
  const send = (json: boolean) => fetch(`${OPENROUTER_URL}/chat/completions`, {
    method: 'POST',
    headers: orHeaders(apiKey),
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model, messages,
      temperature: o.temperature ?? 0.7,
      max_tokens: o.maxTokens ?? 1000,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  let res: Response
  try {
    res = await send(!!o.json)
    if (!res.ok && o.json && (res.status === 400 || res.status === 404 || res.status === 422)) res = await send(false)
  } catch (e) {
    throw new Error(e instanceof Error && e.name === 'TimeoutError' ? 'OpenRouter timed out. Try again or pick a faster model.' : 'Could not reach OpenRouter. Check your internet connection.')
  }
  if (!res.ok) {
    const msg = await orError(res)
    if (res.status === 401) throw new Error('OpenRouter rejected the API key (401). Check the key in Admin → Config → AI Settings.')
    if (res.status === 402) throw new Error('OpenRouter account has no credits (402). Add credits or choose a free model.')
    if (res.status === 429) throw new Error('OpenRouter rate limit reached (429). Wait a moment and retry.')
    throw new Error(`OpenRouter error ${res.status}: ${msg}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('AI returned an empty response. Try again or pick a different model.')
  return content
}

export interface ConnectionStep { label: string; ok: boolean; detail: string }

/** Checks the key (auth endpoint) and the chosen model (tiny completion). */
export async function testOpenRouterConnection(apiKey: string, model: string): Promise<ConnectionStep[]> {
  const steps: ConnectionStep[] = []
  if (!apiKey.trim()) return [{ label: 'API key', ok: false, detail: 'No API key entered.' }]

  try {
    const res = await fetch(`${OPENROUTER_URL}/auth/key`, { headers: orHeaders(apiKey), signal: AbortSignal.timeout(15_000) })
    if (!res.ok) {
      steps.push({ label: 'API key', ok: false, detail: res.status === 401 ? 'Key rejected (401) — it is invalid or revoked.' : `Error ${res.status}: ${await orError(res)}` })
      return steps
    }
    const d = ((await res.json()) as { data?: { label?: string; usage?: number; limit?: number | null; is_free_tier?: boolean } }).data ?? {}
    const remaining = d.limit != null && d.usage != null ? ` · $${(d.limit - d.usage).toFixed(2)} credit left` : d.usage != null ? ` · $${d.usage.toFixed(2)} used` : ''
    steps.push({ label: 'API key', ok: true, detail: `Valid${d.label ? ` (${d.label})` : ''}${d.is_free_tier ? ' · free tier' : ''}${remaining}` })
  } catch {
    steps.push({ label: 'API key', ok: false, detail: 'Could not reach OpenRouter. Check your internet connection.' })
    return steps
  }

  const t0 = performance.now()
  try {
    const out = await chat(apiKey, model, [{ role: 'user', content: 'Reply with the single word: OK' }], { maxTokens: 8, temperature: 0 })
    steps.push({ label: `Model ${model}`, ok: true, detail: `Responded in ${Math.round(performance.now() - t0)} ms ("${out.trim().slice(0, 20)}")` })
  } catch (e) {
    steps.push({ label: `Model ${model}`, ok: false, detail: e instanceof Error ? e.message : 'Model call failed.' })
  }
  return steps
}

export async function generateMarkets(opts: AIGenerateOptions): Promise<AIMarketDraft[]> {
  if (!opts.apiKey) throw new Error('OpenRouter API key is not configured. Add it in Admin → Config → AI Settings.')
  if (!opts.model) throw new Error('No AI model selected. Add one in Admin → Config → AI Settings.')

  const prompt = buildPrompt(opts)
  const content = await chat(opts.apiKey, opts.model, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ], { temperature: 0.8, maxTokens: 4000, json: true })

  const parsed = extractJson(content)
  if (parsed === undefined) throw new Error('AI returned invalid JSON. Try again or use a different model.')

  let markets: unknown[]
  if (Array.isArray(parsed)) {
    markets = parsed
  } else if (parsed && typeof parsed === 'object') {
    // find the first array property
    const firstArr = Object.values(parsed as Record<string, unknown>).find(v => Array.isArray(v))
    if (!firstArr) throw new Error('AI response did not contain a markets array.')
    markets = firstArr as unknown[]
  } else {
    throw new Error('AI response format not recognized.')
  }

  return markets.map((m): AIMarketDraft => {
    const raw = m as Record<string, unknown>
    const str = (v: unknown, fallback = ''): string =>
      v === null || v === undefined || typeof v === 'object' ? fallback : `${v as string | number | boolean}`
    return {
      question: str(raw.question),
      marketType: (Number(raw.marketType ?? 0)) as 0 | 1 | 2,
      outcomes: Array.isArray(raw.outcomes) ? (raw.outcomes as unknown[]).map(v => str(v)) : ['Yes', 'No'],
      category: str(raw.category, 'Other'),
      imageUrl: str(raw.imageUrl),
      scalarLow: Number(raw.scalarLow ?? 0),
      scalarHigh: Number(raw.scalarHigh ?? 100),
      scalarUnit: str(raw.scalarUnit),
      rationale: str(raw.rationale),
      suggestedLiquidity: Math.max(10, Number(raw.suggestedLiquidity ?? 100)),
      suggestedDurationDays: Math.max(1, Number(raw.suggestedDurationDays ?? 30)),
    }
  }).filter(m => m.question.length > 0)
}

// Popular OpenRouter models to show in the dropdown
export const OPENROUTER_MODELS = [
  { id: 'openai/gpt-4o-mini',             label: 'GPT-4o Mini (fast, cheap)' },
  { id: 'openai/gpt-4o',                  label: 'GPT-4o (best quality)' },
  { id: 'anthropic/claude-3.5-haiku',     label: 'Claude 3.5 Haiku (fast)' },
  { id: 'anthropic/claude-3.5-sonnet',    label: 'Claude 3.5 Sonnet (smart)' },
  { id: 'anthropic/claude-sonnet-4',      label: 'Claude Sonnet 4' },
  { id: 'google/gemini-2.0-flash-001',    label: 'Gemini 2.0 Flash (fast)' },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
  { id: 'mistralai/mistral-small-3.1-24b-instruct', label: 'Mistral Small 3.1' },
  { id: 'deepseek/deepseek-chat-v3-0324', label: 'DeepSeek V3 (very cheap)' },
]
