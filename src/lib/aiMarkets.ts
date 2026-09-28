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
Make markets relevant to current world events as of late 2026.
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

export async function generateMarkets(opts: AIGenerateOptions): Promise<AIMarketDraft[]> {
  if (!opts.apiKey) throw new Error('OpenRouter API key is not configured. Add it in Admin → Config → AI Settings.')
  if (!opts.model) throw new Error('No AI model selected. Add one in Admin → Config → AI Settings.')

  const prompt = buildPrompt(opts)

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Predarc Prediction Markets',
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenRouter error ${response.status}: ${err}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const data = await response.json()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const content: string = (data as { choices: { message: { content: string } }[] }).choices[0]?.message?.content ?? '[]'

  // Parse — model may return {"markets": [...]} or just [...]
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('AI returned invalid JSON. Try again or use a different model.')
  }

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
  { id: 'anthropic/claude-3-5-haiku',     label: 'Claude 3.5 Haiku (fast)' },
  { id: 'anthropic/claude-3-5-sonnet',    label: 'Claude 3.5 Sonnet (smart)' },
  { id: 'anthropic/claude-3-7-sonnet',    label: 'Claude 3.7 Sonnet (latest)' },
  { id: 'google/gemini-flash-1.5',        label: 'Gemini Flash 1.5 (fast)' },
  { id: 'google/gemini-pro-1.5',          label: 'Gemini Pro 1.5' },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (free tier)' },
  { id: 'mistralai/mistral-small-3.1-24b-instruct', label: 'Mistral Small 3.1' },
  { id: 'deepseek/deepseek-chat-v3-0324', label: 'DeepSeek V3 (very cheap)' },
]
