// AI Market Generation via OpenRouter
// Calls the OpenRouter API with the admin-configured key and model
import { fetchNews, type NewsItem } from './api'

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
  resolutionCriteria: string      // exactly how/when this resolves
  sources: { title: string; url: string }[]  // where to verify the outcome
  sourceHeadline?: string         // news headline that inspired it
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

- Always include resolutionCriteria (precise, with the data source and cutoff time) and 1-3 real, well-known source URLs (official sites, exchanges, league sites) used to verify the outcome
- Never generate two markets about the same subject, and vary subjects, category and phrasing widely between batches

You MUST respond with valid JSON only. No markdown, no explanation outside the JSON.`

// ── Rotation: every run gets a different mix of categories, angles and headlines ──

const ALL_CATEGORIES = ['Crypto', 'Sports', 'Politics', 'Entertainment', 'Science', 'Finance', 'Other']
const TOPIC_FOR_CATEGORY: Record<string, string> = {
  Crypto: 'crypto', Sports: 'sports', Politics: 'politics', Entertainment: 'entertainment',
  Science: 'science', Finance: 'economy', Other: 'world',
}
const ANGLES = [
  'a price or numeric threshold being crossed by a date',
  'who wins a specific upcoming contest, vote or award',
  'whether a specific announced event actually happens on schedule',
  'a head-to-head comparison between two named entities',
  'a scalar question about a measurable number (count, price, percentage)',
  'whether an official body will approve, ban, or pass something',
  'a "first to" or "will X happen before Y" race',
  'an under-the-radar niche story that few people are watching',
  'a contrarian question where the obvious answer is not certain',
  'a multiple-choice question with 4-6 realistic candidates',
]

const shuffle = <T,>(a: T[]): T[] => {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]] }
  return r
}

const STOP = new Set(['will', 'the', 'a', 'an', 'of', 'to', 'in', 'on', 'by', 'be', 'or', 'and', 'for', 'at', 'is', 'before', 'after', 'than', 'that', 'this', 'with', 'from', 'end', 'above', 'below', 'over', 'under', 'more', 'less', 'least', 'exceed', 'reach', 'win', 'yes', 'no'])
const tokens = (q: string) => new Set(q.toLowerCase().replace(/[^a-z0-9$%. ]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w)))
function similarity(a: string, b: string): number {
  const A = tokens(a), B = tokens(b)
  if (!A.size || !B.size) return 0
  let inter = 0; A.forEach(t => { if (B.has(t)) inter++ })
  return inter / Math.min(A.size, B.size)
}
/** Questions this browser session has already generated, so consecutive runs never repeat. */
const generatedThisSession: string[] = []
const isDuplicate = (q: string, pool: string[]) => pool.some(p => similarity(q, p) >= 0.6)

async function gatherHeadlines(categories: string[]): Promise<{ category: string; item: NewsItem }[]> {
  const picked = shuffle(categories).slice(0, 4)
  const lists = await Promise.all(picked.map(async c => ({ c, items: await fetchNews({ topic: TOPIC_FOR_CATEGORY[c] ?? 'world' }) })))
  const out: { category: string; item: NewsItem }[] = []
  for (const { c, items } of lists) for (const item of shuffle(items).slice(0, 5)) out.push({ category: c, item })
  return shuffle(out)
}

interface PromptBits { headlines: { category: string; item: NewsItem }[]; categories: string[]; angles: string[]; nonce: string }

function buildPrompt(opts: AIGenerateOptions, bits: PromptBits, avoid: string[]): string {
  const types = opts.marketTypes ?? ['binary', 'multiple', 'scalar']
  const count = opts.mode === 'topic' ? 1 : opts.count ?? 5
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const avoidBlock = avoid.length
    ? `\nALREADY EXISTS — do NOT repeat, paraphrase, or create a variation of any of these (different subject entirely):\n${avoid.slice(-60).map(q => `- ${q}`).join('\n')}\n`
    : ''

  let source = ''
  if (opts.mode === 'topic') {
    source = `Topic: "${opts.topic ?? 'general'}"`
  } else if (opts.mode === 'news' && opts.newsContext?.trim()) {
    source = `Base the markets on these headlines / context supplied by the admin:\n${opts.newsContext}`
  } else if (bits.headlines.length) {
    source = `Today is ${today}. Fresh real headlines (pick DIFFERENT ones — each market must come from a different headline, and skip any that are stale or already covered):\n` +
      bits.headlines.slice(0, 14).map((h, i) => `${i + 1}. [${h.category}] ${h.item.title}${h.item.source ? ` — ${h.item.source}` : ''}`).join('\n')
  } else {
    source = `Today is ${today}. Use your knowledge of current world events.`
  }

  return `${source}

Generate ${count} prediction market${count > 1 ? 's' : ''}.
Categories to draw from (vary them; do not use one category for everything): ${bits.categories.join(', ')}
Market types allowed: ${types.join(', ')}
Angles to use (one per market, in this order): ${bits.angles.slice(0, count).join(' | ')}
Every market must resolve in the future (suggestedDurationDays between 3 and 180) and be objectively resolvable from a public source.
Variety token (ignore, just make this batch unlike previous ones): ${bits.nonce}
${avoidBlock}
Return a JSON object {"markets": [...]} with ${count} items, each matching this schema:
${SCHEMA_HINT}`
}

const SCHEMA_HINT = `{
  "question": "Will BTC close above $120,000 on any day before December 31 2026?",
  "marketType": 0,
  "outcomes": ["Yes", "No"],
  "category": "Crypto",
  "imageUrl": "",
  "scalarLow": 0,
  "scalarHigh": 0,
  "scalarUnit": "",
  "rationale": "2-3 sentences: why this market matters now and what the current situation is",
  "resolutionCriteria": "Resolves Yes if CoinGecko's daily close for BTC/USD is above $120,000 on any UTC day up to and including Dec 31 2026. Otherwise No.",
  "sources": [{"title": "CoinGecko BTC price history", "url": "https://www.coingecko.com/en/coins/bitcoin/historical_data"}],
  "sourceHeadline": "headline that inspired this, or empty",
  "suggestedLiquidity": 100,
  "suggestedDurationDays": 90
}`


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

function parseDrafts(content: string): AIMarketDraft[] {
  const parsed = extractJson(content)
  if (parsed === undefined) throw new Error('AI returned invalid JSON. Try again or use a different model.')
  let markets: unknown[]
  if (Array.isArray(parsed)) markets = parsed
  else if (parsed && typeof parsed === 'object') {
    const firstArr = Object.values(parsed as Record<string, unknown>).find(v => Array.isArray(v))
    if (!firstArr) throw new Error('AI response did not contain a markets array.')
    markets = firstArr as unknown[]
  } else throw new Error('AI response format not recognized.')

  const str = (v: unknown, fallback = ''): string =>
    v === null || v === undefined || typeof v === 'object' ? fallback : `${v as string | number | boolean}`
  return markets.map((m): AIMarketDraft => {
    const raw = m as Record<string, unknown>
    const type = Number(raw.marketType ?? 0)
    return {
      question: str(raw.question).trim(),
      marketType: (type === 1 || type === 2 ? type : 0) as 0 | 1 | 2,
      outcomes: Array.isArray(raw.outcomes) ? (raw.outcomes as unknown[]).map(v => str(v)).filter(Boolean) : ['Yes', 'No'],
      category: ALL_CATEGORIES.includes(str(raw.category)) ? str(raw.category) : 'Other',
      imageUrl: str(raw.imageUrl),
      scalarLow: Number(raw.scalarLow ?? 0),
      scalarHigh: Number(raw.scalarHigh ?? 100),
      scalarUnit: str(raw.scalarUnit),
      rationale: str(raw.rationale),
      suggestedLiquidity: Math.max(1, Number(raw.suggestedLiquidity ?? 100)),
      suggestedDurationDays: Math.max(1, Number(raw.suggestedDurationDays ?? 30)),
      resolutionCriteria: str(raw.resolutionCriteria),
      sources: Array.isArray(raw.sources)
        ? (raw.sources as Record<string, unknown>[]).map(x => ({ title: str(x?.title), url: str(x?.url) })).filter(x => /^https?:\/\//.test(x.url)).slice(0, 4)
        : [],
      sourceHeadline: str(raw.sourceHeadline) || undefined,
    }
  }).filter(m => m.question.length > 0 && m.outcomes.length >= 2)
}

export async function generateMarkets(opts: AIGenerateOptions): Promise<AIMarketDraft[]> {
  if (!opts.apiKey) throw new Error('OpenRouter API key is not configured. Add it in Admin → Config → AI Settings.')
  if (!opts.model) throw new Error('No AI model selected. Add one in Admin → Config → AI Settings.')

  const want = opts.mode === 'topic' ? 1 : opts.count ?? 5
  const avoid = [...new Set([...(opts.avoid ?? []), ...generatedThisSession])]
  const pool = opts.categories?.length ? opts.categories : ALL_CATEGORIES
  const results: AIMarketDraft[] = []

  // Up to 2 attempts: the second one runs with everything rejected added to the avoid list.
  for (let attempt = 0; attempt < 2 && results.length < want; attempt++) {
    const useNews = opts.mode === 'auto' || opts.mode === 'batch' || (opts.mode === 'news' && !opts.newsContext?.trim())
    const bits: PromptBits = {
      headlines: useNews ? await gatherHeadlines(pool) : [],
      categories: shuffle(pool).slice(0, Math.max(3, Math.min(pool.length, want))),
      angles: shuffle(ANGLES),
      nonce: Math.random().toString(36).slice(2, 10),
    }
    const content = await chat(opts.apiKey, opts.model, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildPrompt({ ...opts, count: want - results.length }, bits, [...avoid, ...results.map(r => r.question)]) },
    ], { temperature: 1, maxTokens: 5000, json: true })

    for (const d of parseDrafts(content)) {
      if (results.length >= want) break
      if (isDuplicate(d.question, [...avoid, ...results.map(r => r.question)])) { avoid.push(d.question); continue }
      results.push(d)
    }
  }
  results.forEach(r => generatedThisSession.push(r.question))
  return results
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
