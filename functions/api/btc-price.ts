// BTC/USD price proxy with several upstream sources, so the site works even when one exchange is unreachable from a visitor's
// network. Edge-cached for a couple of seconds, so thousands of visitors cost only a few upstream calls.
//   GET /api/btc-price                 → { price, source, t }
//   GET /api/btc-price?candles=60      → { points: [{ t (ms), p }...] }  (1-minute closes, oldest first)
//   GET /api/btc-price?stats=1         → { open, close, high, low, change, changePct }  (last 24h)
type Pt = { t: number; p: number }
const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
const j = (data: unknown, cache: number, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...H, 'cache-control': `public, max-age=${cache}, s-maxage=${cache}` } })
const get = async <T>(url: string): Promise<T> => {
  const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'predarc' } })
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json() as Promise<T>
}
const first = async <T>(tries: (() => Promise<T>)[]): Promise<T> => {
  let err: unknown
  for (const t of tries) { try { return await t() } catch (e) { err = e } }
  throw err
}

const spot = () => first<{ price: number; source: string }>([
  async () => ({ source: 'coinbase', price: Number((await get<{ data: { amount: string } }>('https://api.coinbase.com/v2/prices/BTC-USD/spot')).data.amount) }),
  async () => ({ source: 'kraken', price: Number((await get<{ result: Record<string, { c: string[] }> }>('https://api.kraken.com/0/public/Ticker?pair=XBTUSD')).result.XXBTZUSD.c[0]) }),
  async () => ({ source: 'binance', price: Number((await get<{ price: string }>('https://api.binance.us/api/v3/ticker/price?symbol=BTCUSD')).price) }),
  async () => ({ source: 'coingecko', price: (await get<{ bitcoin: { usd: number } }>('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')).bitcoin.usd }),
]).then(r => { if (!(r.price > 0)) throw new Error('bad price'); return r })

const candles = (minutes: number, gran: 60 | 300): Promise<Pt[]> => first<Pt[]>([
  async () => {
    const end = Math.floor(Date.now() / 1000), start = end - minutes * 60
    const rows = await get<[number, number, number, number, number, number][]>(`https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=${gran}&start=${new Date(start * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`)
    return rows.map(c => ({ t: c[0] * 1000, p: c[4], hi: c[2], lo: c[1], op: c[3] })).sort((a, b) => a.t - b.t) as Pt[]
  },
  async () => {
    const since = Math.floor(Date.now() / 1000) - minutes * 60
    const r = await get<{ result: Record<string, unknown> }>(`https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=${gran / 60}&since=${since}`)
    const rows = (r.result.XXBTZUSD ?? []) as [number, string, string, string, string][]
    return rows.map(c => ({ t: c[0] * 1000, p: Number(c[4]), hi: Number(c[2]), lo: Number(c[3]), op: Number(c[1]) })) as Pt[]
  },
  async () => {
    const rows = await get<[number, string, string, string, string][]>(`https://api.binance.us/api/v3/klines?symbol=BTCUSD&interval=${gran === 60 ? '1m' : '5m'}&limit=${Math.min(1000, Math.ceil(minutes / (gran / 60)))}`)
    return rows.map(c => ({ t: c[0], p: Number(c[4]), hi: Number(c[2]), lo: Number(c[3]), op: Number(c[1]) })) as Pt[]
  },
])

export const onRequestGet = async ({ request }: { request: Request }): Promise<Response> => {
  const q = new URL(request.url).searchParams
  try {
    if (q.get('candles')) {
      const m = Math.min(300, Math.max(5, Number(q.get('candles')) || 60))
      return j({ points: (await candles(m, 60)).map(({ t, p }) => ({ t, p })) }, 20)
    }
    if (q.get('stats')) {
      const rows = (await candles(24 * 60, 300)) as (Pt & { hi: number; lo: number; op: number })[]
      if (!rows.length) throw new Error('no data')
      const open = rows[0].op ?? rows[0].p, close = rows[rows.length - 1].p
      return j({ open, close, high: Math.max(...rows.map(r => r.hi)), low: Math.min(...rows.map(r => r.lo)), change: close - open, changePct: ((close - open) / open) * 100 }, 60)
    }
    const s = await spot()
    return j({ ...s, t: Date.now() }, 2)
  } catch (e) {
    return j({ error: (e as Error).message }, 0, 502)
  }
}
