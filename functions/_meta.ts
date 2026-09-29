// Sanitizer for market details stored in KV (shared by market-meta and market-analysis).
export const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined)

export function cleanMeta(input: Record<string, unknown>) {
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

