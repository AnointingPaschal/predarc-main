// Fresh headlines for AI market generation and for a market's "related news".
//   GET /api/news?topic=crypto   or   /api/news?q=bitcoin+etf
// Uses Google News RSS; cached at the edge for 10 minutes.
import { json } from '../_lib'

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

const decode = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/<[^>]+>/g, '').trim()

export const onRequest = async ({ request }: { request: Request }): Promise<Response> => {
  const url = new URL(request.url)
  const topic = url.searchParams.get('topic') || ''
  const q = (url.searchParams.get('q') || TOPICS[topic] || TOPICS.world).slice(0, 200)
  const feed = `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:2d')}&hl=en-US&gl=US&ceid=US:en`
  try {
    const res = await fetch(feed, { headers: { 'user-agent': 'Mozilla/5.0 Predarc' }, cf: { cacheTtl: 600, cacheEverything: true } } as RequestInit)
    if (!res.ok) return json({ items: [], error: `News feed returned ${res.status}` })
    const xml = await res.text()
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 25).map(m => {
      const b = m[1]
      const get = (t: string) => decode(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(b)?.[1] ?? '')
      const title = get('title'); const source = get('source')
      return { title: source && title.endsWith(` - ${source}`) ? title.slice(0, -(source.length + 3)) : title, source, url: get('link'), published: get('pubDate') }
    }).filter(i => i.title)
    return json({ items }, 200, { 'cache-control': 'public, max-age=300' })
  } catch (e) {
    return json({ items: [], error: e instanceof Error ? e.message : 'News fetch failed' })
  }
}
