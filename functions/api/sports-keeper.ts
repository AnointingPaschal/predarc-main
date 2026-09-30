// Automatic settlement for soccer markets (PredarcSports contract).
//   POST /api/sports-keeper?network=mainnet|testnet   settles every finished match it can (anyone may ping; the result
//                                                      comes from ESPN and the chain rules decide what goes through)
//   GET  /api/sports-keeper?network=...               resolver wallet, balance and whether the contract authorises it
// The contract lets its owner and any address the owner adds with setResolver() resolve/cancel lines. Set the secret
// SPORTS_RESOLVER_PRIVATE_KEY to a dedicated wallet (NOT your owner key) and authorise it in Admin → Sports.
import { createPublicClient, createWalletClient, http, formatUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arc, arcTestnet } from 'viem/chains'
import { json, checkStorage, isNetwork, readJson, PUBLIC_KEY, type Env } from '../_lib'
import { computeDue, markSettled } from '../_sports'
import { SPORTS_ABI } from '../../src/lib/sportsAbi'

const CHAINS = { mainnet: arc, testnet: arcTestnet } as const
type KEnv = Env & { SPORTS_RESOLVER_PRIVATE_KEY?: string; MAINNET_RPC_URL?: string; TESTNET_RPC_URL?: string }
const ADDR = /^0x[0-9a-fA-F]{40}$/

function keyOf(env: KEnv): `0x${string}` | null {
  const k = (env.SPORTS_RESOLVER_PRIVATE_KEY || '').trim(); const pk = (k.startsWith('0x') ? k : `0x${k}`) as `0x${string}`
  return /^0x[0-9a-fA-F]{64}$/.test(pk) ? pk : null
}
async function ctx(network: 'mainnet' | 'testnet', env: KEnv) {
  const config = (await readJson(env, PUBLIC_KEY)) as Record<string, unknown>
  const net = (config[network] ?? {}) as { sportsAddress?: string; rpcUrl?: string }
  const chain = CHAINS[network]
  const priv = ((network === 'testnet' ? env.TESTNET_RPC_URL : env.MAINNET_RPC_URL) || '').trim()
  const urls = [...new Set([priv, (net.rpcUrl || '').trim(), ...chain.rpcUrls.default.http].filter(Boolean))]
  return { address: (net.sportsAddress || '').trim() as `0x${string}`, chain, urls, enabled: config.sportsAutoSettle !== false }
}

export const onRequestGet = async ({ request, env }: { request: Request; env: KEnv }): Promise<Response> => {
  const bad = checkStorage(env); if (bad) return bad
  const network = new URL(request.url).searchParams.get('network')
  if (!isNetwork(network)) return json({ error: 'network required' }, 400)
  const pk = keyOf(env); if (!pk) return json({ configured: false })
  const { address, chain, urls } = await ctx(network, env)
  const account = privateKeyToAccount(pk)
  let balance = '', authorised: boolean | null = null
  for (const url of urls) {
    try {
      const pc = createPublicClient({ chain, transport: http(url, { timeout: 8000, retryCount: 0 }) })
      balance = formatUnits(await pc.getBalance({ address: account.address }), 18)
      if (ADDR.test(address)) {
        const [isRes, owner] = await Promise.all([
          pc.readContract({ address, abi: SPORTS_ABI, functionName: 'resolvers', args: [account.address] }) as Promise<boolean>,
          pc.readContract({ address, abi: SPORTS_ABI, functionName: 'owner' }) as Promise<string>,
        ])
        authorised = isRes || owner.toLowerCase() === account.address.toLowerCase()
      }
      break
    } catch { /* next rpc */ }
  }
  return json({ configured: true, address: account.address, balance, authorised, isOwner: authorised })
}

type Done = { eventId: string; marketId: string; how: 'resolved' | 'cancelled'; score?: { home: number; away: number } }

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
  const done: Done[] = []
  const errors: string[] = []
  for (const url of urls) {
    try {
      const pc = createPublicClient({ chain, transport: http(url, { timeout: 8000, retryCount: 0 }) })
      const wallet = createWalletClient({ account, chain, transport: http(url, { timeout: 15000, retryCount: 0 }) })
      const [isRes, owner] = await Promise.all([
        pc.readContract({ address, abi: SPORTS_ABI, functionName: 'resolvers', args: [account.address] }) as Promise<boolean>,
        pc.readContract({ address, abi: SPORTS_ABI, functionName: 'owner' }) as Promise<string>,
      ])
      if (!isRes && owner.toLowerCase() !== account.address.toLowerCase()) return json({ status: 'not-authorised', address: account.address })

      // Flatten, cap the batch, and skip lines that are already settled on chain
      const items = due.flatMap(m => {
        const score = m.score ? { home: Number(m.score.split('-')[0]), away: Number(m.score.split('-')[1]) } : undefined
        return m.actions.map(a => ({ a, score }))
      }).slice(0, 40)
      const lines = (await pc.readContract({ address, abi: SPORTS_ABI, functionName: 'getLines', args: [items.map(i => BigInt(i.a.marketId))] })) as unknown as { status: number }[]
      const resolveIds: bigint[] = [], resolveWin: bigint[] = [], cancelIds: bigint[] = []
      const pendingResolve: Done[] = [], pendingCancel: Done[] = []
      items.forEach((it, i) => {
        const st = Number(lines[i]?.status)
        const how = it.a.action === 'resolve' ? 'resolved' : 'cancelled'
        if (st === 1 || st === 2) { done.push({ eventId: it.a.eventId, marketId: it.a.marketId, how: st === 1 ? 'resolved' : 'cancelled', score: it.score }); return }
        const rec: Done = { eventId: it.a.eventId, marketId: it.a.marketId, how, score: it.score }
        if (it.a.action === 'resolve') { resolveIds.push(BigInt(it.a.marketId)); resolveWin.push(BigInt(it.a.outcome ?? 0)); pendingResolve.push(rec) }
        else { cancelIds.push(BigInt(it.a.marketId)); pendingCancel.push(rec) }
      })
      const send = async (fn: 'resolveMany' | 'cancelMany', args: readonly unknown[], recs: Done[]) => {
        try {
          const call = await pc.simulateContract({ address, abi: SPORTS_ABI, functionName: fn, args: args as never, account } as never)
          const hash = await wallet.writeContract((call as unknown as { request: never }).request)
          const rc = await pc.waitForTransactionReceipt({ hash, timeout: 30_000 })
          if (rc.status === 'success') done.push(...recs)
        } catch (e) { errors.push(`${fn}: ${(e as Error).message.split('\n')[0].slice(0, 140)}`) }
      }
      if (resolveIds.length) await send('resolveMany', [resolveIds, resolveWin], pendingResolve)
      if (cancelIds.length) await send('cancelMany', [cancelIds], pendingCancel)
      if (done.length) await markSettled(env, network, done)
      return json({ status: 'ok', settled: done.length, errors: errors.slice(0, 5) })
    } catch (e) { errors.push((e as Error).message.split('\n')[0].slice(0, 120)) }
  }
  return json({ status: 'error', errors: errors.slice(0, 5) })
}
