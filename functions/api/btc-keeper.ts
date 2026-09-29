// Keeper for the Bitcoin Up/Down rounds contract.
//   POST /api/btc-keeper?network=mainnet|testnet   — records the round-boundary price if one is due (anyone may ping; the
//                                                    chain rules decide whether a transaction is actually needed)
//   GET  /api/btc-keeper?network=...               — keeper address + balance, for the admin screen
// Needs the secret env var KEEPER_PRIVATE_KEY (a dedicated wallet holding a little USDC for gas). With a Chainlink feed set
// on the contract the price comes from the feed; otherwise the spot price is fetched here and submitted by this keeper.
import { createPublicClient, createWalletClient, http, parseAbi, formatUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arc, arcTestnet } from 'viem/chains'
import { json, checkStorage, isNetwork, readJson, PUBLIC_KEY, type Env } from '../_lib'

const ABI = parseAbi([
  'function duration() view returns (uint256)',
  'function enabled() view returns (bool)',
  'function buffer() view returns (uint256)',
  'function feed() view returns (address)',
  'function keepers(address) view returns (bool)',
  'function boundaryPrice(uint256) view returns (uint256)',
  'function recordBoundary(uint256 boundary,uint256 price)',
])
const CHAINS = { mainnet: arc, testnet: arcTestnet } as const
type KeeperEnv = Env & { KEEPER_PRIVATE_KEY?: string; MAINNET_RPC_URL?: string; TESTNET_RPC_URL?: string }

async function spotPrice(): Promise<number> {
  const sources: (() => Promise<number>)[] = [
    async () => Number(((await (await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot')).json()) as { data: { amount: string } }).data.amount),
    async () => Number(((await (await fetch('https://api.kraken.com/0/public/Ticker?pair=XBTUSD')).json()) as { result: Record<string, { c: string[] }> }).result.XXBTZUSD.c[0]),
    async () => Number(((await (await fetch('https://api.binance.us/api/v3/ticker/price?symbol=BTCUSD')).json()) as { price: string }).price),
  ]
  for (const s of sources) { try { const n = await s(); if (n > 0) return n } catch { /* next */ } }
  throw new Error('No BTC price source reachable')
}

function setup(request: Request, env: KeeperEnv): { error: Response } | { error?: undefined; network: 'mainnet' | 'testnet'; key: `0x${string}` | null } {
  const network = new URL(request.url).searchParams.get('network')
  if (!isNetwork(network)) return { error: json({ error: 'network required' }, 400) }
  const key = (env.KEEPER_PRIVATE_KEY || '').trim()
  const pk = (key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`
  return { network, key: /^0x[0-9a-fA-F]{64}$/.test(pk) ? pk : null }
}

async function ctx(network: 'mainnet' | 'testnet', env: KeeperEnv) {
  const config = await readJson(env, PUBLIC_KEY) as { btcEnabled?: boolean } & Record<string, { btcRoundsAddress?: string; rpcUrl?: string } | unknown>
  const net = (config[network] ?? {}) as { btcRoundsAddress?: string; rpcUrl?: string }
  const chain = CHAINS[network]
  const priv = ((network === 'testnet' ? env.TESTNET_RPC_URL : env.MAINNET_RPC_URL) || '').trim()
  const urls = [...new Set([priv, (net.rpcUrl || '').trim(), ...chain.rpcUrls.default.http].filter(Boolean))]
  return { config, address: (net.btcRoundsAddress || '').trim() as `0x${string}`, chain, urls }
}

export const onRequestGet = async ({ request, env }: { request: Request; env: KeeperEnv }): Promise<Response> => {
  const bad = checkStorage(env); if (bad) return bad
  const s = setup(request, env); if (s.error) return s.error
  if (!s.key) return json({ configured: false })
  const { urls, chain, address } = await ctx(s.network, env)
  const account = privateKeyToAccount(s.key)
  let balance = '', authorized: boolean | null = null, feed = ''
  for (const url of urls) {
    try {
      const pc = createPublicClient({ chain, transport: http(url, { timeout: 8000, retryCount: 0 }) })
      balance = formatUnits(await pc.getBalance({ address: account.address }), 18)
      if (/^0x[0-9a-fA-F]{40}$/.test(address)) {
        authorized = await pc.readContract({ address, abi: ABI, functionName: 'keepers', args: [account.address] })
        feed = await pc.readContract({ address, abi: ABI, functionName: 'feed' })
      }
      break
    } catch { /* next rpc */ }
  }
  return json({ configured: true, address: account.address, balance, authorized, feed })
}

export const onRequestPost = async ({ request, env }: { request: Request; env: KeeperEnv }): Promise<Response> => {
  const bad = checkStorage(env); if (bad) return bad
  const s = setup(request, env); if (s.error) return s.error
  if (!s.key) return json({ status: 'no-keeper-key' })
  const { config, address, chain, urls } = await ctx(s.network, env)
  if (config.btcEnabled === false) return json({ status: 'disabled' })
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return json({ status: 'no-contract' })

  // Cheap de-duplication across concurrent pings (KV TTL minimum is 60s, so store a timestamp instead)
  const lockKey = `btc:lock:${s.network}`
  const lockedAt = Number((await env.PREDARC_KV.get(lockKey)) || 0)
  if (Date.now() - lockedAt < 12_000) return json({ status: 'busy' })

  const account = privateKeyToAccount(s.key)
  let lastErr = ''
  for (const url of urls) {
    try {
      const pc = createPublicClient({ chain, transport: http(url, { timeout: 8000, retryCount: 0 }) })
      const [duration, buffer, feed, on] = await Promise.all([
        pc.readContract({ address, abi: ABI, functionName: 'duration' }),
        pc.readContract({ address, abi: ABI, functionName: 'buffer' }),
        pc.readContract({ address, abi: ABI, functionName: 'feed' }),
        pc.readContract({ address, abi: ABI, functionName: 'enabled' }),
      ])
      void on // paused rounds still need their boundaries recorded so open rounds can settle
      const block = await pc.getBlock()
      const now = Number(block.timestamp)
      const boundary = BigInt(Math.floor(now / Number(duration)))
      const since = now - Number(boundary * duration)
      if (since > Number(buffer) - 4) return json({ status: 'window-closed', boundary: boundary.toString() })
      const existing = await pc.readContract({ address, abi: ABI, functionName: 'boundaryPrice', args: [boundary] })
      if (existing > 0n) return json({ status: 'recorded', boundary: boundary.toString(), price: Number(existing) / 1e8 })

      let price = 0n
      if (feed === '0x0000000000000000000000000000000000000000') {
        price = BigInt(Math.round((await spotPrice()) * 1e8))
      }
      await env.PREDARC_KV.put(lockKey, String(Date.now()))
      const wallet = createWalletClient({ account, chain, transport: http(url, { timeout: 15000, retryCount: 0 }) })
      const { request: req } = await pc.simulateContract({ address, abi: ABI, functionName: 'recordBoundary', args: [boundary, price], account })
      const hash = await wallet.writeContract(req)
      return json({ status: 'sent', boundary: boundary.toString(), hash, price: Number(price) / 1e8 })
    } catch (e) { lastErr = (e as Error).message.split('\n')[0].slice(0, 200) }
  }
  return json({ status: 'error', error: lastErr }, 200)
}
