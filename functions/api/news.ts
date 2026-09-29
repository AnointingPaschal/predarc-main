// Fresh headlines for AI market generation and for a market's "related news".
//   GET /api/news?topic=crypto   or   /api/news?q=bitcoin+etf
// Uses Google News RSS; cached at the edge for 10 minutes.
import { json, fetchHeadlines } from '../_lib'

const TOPICS: Record<string, string> = {
  crypto: 'cryptocurrency OR bitcoin OR ethereum',
  politics: 'politics election government',
  sports: 'sports championship league',
  tech: 'technology AI startup',
  economy: 'economy inflation federal reserve markets',
  entertainment: 'movies music awards celebrity',
  world: 'world news geopolitics',
  science: 'science space climate',
  business: 'business earnings company',
}

export const onRequest = async ({ request }: { request: Request }): Promise<Response> => {
  const url = new URL(request.url)
  const topic = url.searchParams.get('topic') || ''
  const q = (url.searchParams.get('q') || TOPICS[topic] || TOPICS.world).slice(0, 200)
  try {
    return json({ items: await fetchHeadlines(q) }, 200, { 'cache-control': 'public, max-age=300' })
  } catch (e) {
    return json({ items: [], error: e instanceof Error ? e.message : 'News fetch failed' })
  }
}
