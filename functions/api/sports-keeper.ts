// Automatic settlement for soccer markets.
//   POST /api/sports-keeper?network=mainnet|testnet   settles every finished match it can (anyone may ping; the result
//                                                      comes from ESPN and the chain rules decide what goes through)
//   GET  /api/sports-keeper?network=...               resolver wallet, balance and whether it owns the market contract
// The market contract only lets its OWNER resolve markets, so this needs the secret env var SPORTS_RESOLVER_PRIVATE_KEY set
// to the owner wallet's key (or to a wallet you make the contract owner). Without it, use the admin "Settle now" button.
import { createPublicClient, createWalletClient, http, formatUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arc, arcTestnet } from 'viem/chains'
import { json, checkStorage, isNetwork, readJson, PUBLIC_KEY, type Env } from '../_lib'
import { computeDue, markSettled } from '../_sports'
import { PREDARC_ABI } from '../../src/lib/contract'

const CHAINS = { mainnet: arc, testnet: arcTestnet } as const
type KEnv = Env & { SPORTS_RESOLVER_PRIVATE_KEY?: string; MAINNET_RPC_URL?: string; TESTNET_RPC_URL?: string }
const ADDR = /^0x[0-9a-fA-F]{40}$/

function keyOf(env: KEnv): `0x${string}` | null {
  const k = (env.SPORTS_RESOLVER_PRIVATE_KEY || '').trim(); const pk = (k.startsWith('0x') ? k : `0x${k}`) as `0x${string}`
  return /^0x[0-9a-fA-F]{64}$/.test(pk) ? pk : null
}
async function ctx(network: 'mainnet' | 'testnet', env: KEnv) {
  const config = (await readJson(env, PUBLIC_KEY)) as Record<string, unknown>
  const net = (config[network] ?? {}) as { contractAddress?: string; rpcUrl?: string }
  const chain = CHAINS[network]
  const priv = ((network === 'testnet' ? env.TESTNET_RPC_URL : env.MAINNET_RPC_URL) || '').trim()
  const urls = [...new Set([priv, (net.rpcUrl || '').trim(), ...chain.rpcUrls.default.http].filter(Boolean))]
  return { address: (net.contractAddress || '').trim() as `0x${string}`, chain, urls, enabled: config.sportsAutoSettle !== false }
}

export const onRequestGet = async ({ request, env }: { request: Request; env: KEnv }): Promise<Response> => {
  const bad = checkStorage(env); if (bad) return bad
  const network = new URL(request.url).searchParams.get('network')
  if (!isNetwork(network)) return json({ error: 'network required' }, 400)
  const pk = keyOf(env); if (!pk) return json({ configured: false })
  const { address, chain, urls } = await ctx(network, env)
  const account = privateKeyToAccount(pk)
  let balance = '', isOwner: boolean | null = null
  for (const url of urls) {
    try {
      const pc = createPublicClient({ chain, transport: http(url, { timeout: 8000, retryCount: 0 }) })
      balance = formatUnits(await pc.getBalance({ address: account.address }), 18)
      if (ADDR.test(address)) isOwner = ((await pc.readContract({ address, abi: PREDARC_ABI, functionName: 'owner' })) as string).toLowerCase() === account.address.toLowerCase()
      break
    } catch { /* next rpc */ }
  }
  return json({ configured: true, address: account.address, balance, isOwner })
}

export const onRequestPost = async ({ request, env }: { request: Request; env: KEnv }): Promise<Response> => {
  const bad = checkStorage(env); if (bad) return bad
  const network = new URL(request.url).searchParams.get('network')
  if (!isNetwork(network)) return json({ error: 'network required' }, 400)
  const pk = keyOf(env); if (!pk) return json({ status: 'no-resolver-key' })
  const { address, chain, urls, enabled } = await ctx(network, env)
  if (!enabled) return json({ status: 'disabled' })
  if (!ADDR.test(address)) return json({ status: 'no-contract' })

  const lockKey = `sports:lock:${network}`
  if (Date.now() - Number((await env.PREDARC_KV.get(lockKey)) || 0) < 45_000) return json({ status: 'busy' })
  const due = (await computeDue(env, network)).filter(m => m.actions.length)
  if (!due.length) return json({ status: 'nothing-due' })
  await env.PREDARC_KV.put(lockKey, String(Date.now()))

  const account = privateKeyToAccount(pk)
  const done: { eventId: string; marketId: string; how: 'resolved' | 'cancelled'; score?: { home: number; away: number } }[] = []
  const errors: string[] = []
  for (const url of urls) {
    try {
      const pc = createPublicClient({ chain, transport: http(url, { timeout: 8000, retryCount: 0 }) })
      const wallet = createWalletClient({ account, chain, transport: http(url, { timeout: 15000, retryCount: 0 }) })
      if (((await pc.readContract({ address, abi: PREDARC_ABI, functionName: 'owner' })) as string).toLowerCase() !== account.address.toLowerCase()) return json({ status: 'not-owner', address: account.address })
      let sent = 0
      for (const m of due) {
        const score = m.score ? { home: Number(m.score.split('-')[0]), away: Number(m.score.split('-')[1]) } : undefined
        for (const a of m.actions) {
          if (sent >= 15) break
          try {
            const id = BigInt(a.marketId)
            const mk = (await pc.readContract({ address, abi: PREDARC_ABI, functionName: 'getMarket', args: [id] })) as { status: number; resolvedOutcome: bigint }
            // Already settled on chain (by hand, or an earlier run that didn't get to record it)
            if (mk.status === 2 || mk.status === 3) { done.push({ eventId: a.eventId, marketId: a.marketId, how: mk.status === 2 ? 'resolved' : 'cancelled', score }); continue }
            let hash: `0x${string}`
            if (a.action === 'resolve') {
              const call = await pc.simulateContract({ address, abi: PREDARC_ABI, functionName: 'resolveMarket', args: [id, BigInt(a.outcome ?? 0)], account })
              hash = await wallet.writeContract(call.request)
            } else {
              const call = await pc.simulateContract({ address, abi: PREDARC_ABI, functionName: 'cancelMarket', args: [id], account })
              hash = await wallet.writeContract(call.request)
            }
            const rc = await pc.waitForTransactionReceipt({ hash, timeout: 30_000 })
            sent++
            if (rc.status === 'success') done.push({ eventId: a.eventId, marketId: a.marketId, how: a.action === 'resolve' ? 'resolved' : 'cancelled', score })
          } catch (e) { errors.push(`#${a.marketId}: ${(e as Error).message.split('\n')[0].slice(0, 120)}`) }
        }
      }
      if (done.length) await markSettled(env, network, done)
      return json({ status: 'ok', settled: done.length, errors: errors.slice(0, 5) })
    } catch (e) { errors.push((e as Error).message.split('\n')[0].slice(0, 120)) }
  }
  return json({ status: 'error', errors: errors.slice(0, 5) })
}
