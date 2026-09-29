// Diagnostics for a deployed PredarcMarket contract — run from the admin's browser
// against the RPC URL typed into the form (works before saving).
import { createPublicClient, http, parseAbi, formatUnits, isAddress, getAddress } from 'viem'
import { CHAIN_IDS, type Network } from './adminConfig'

const ABI = parseAbi([
  'function owner() view returns (address)',
  'function minLiquidity() view returns (uint256)',
  'function platformFee() view returns (uint256)',
  'function feeRecipient() view returns (address)',
  'function getTotalMarkets() view returns (uint256)',
  'function usdc() view returns (address)',
])

export interface CheckLine { ok: boolean; label: string; detail: string }

export async function checkContract(opts: {
  network: Network
  rpcUrl: string
  contractAddress: string
  usdcAddress: string
  adminWallet?: string
}): Promise<CheckLine[]> {
  const out: CheckLine[] = []
  const { network, rpcUrl, contractAddress } = opts
  if (!rpcUrl.trim()) return [{ ok: false, label: 'RPC URL', detail: 'No RPC URL set for this network.' }]
  if (!isAddress(contractAddress.trim())) return [{ ok: false, label: 'Contract', detail: 'No valid contract address set for this network.' }]
  const address = getAddress(contractAddress.trim())
  const client = createPublicClient({ transport: http(rpcUrl.trim(), { timeout: 15_000, retryCount: 0 }) })

  try {
    const chainId = await client.getChainId()
    const want = CHAIN_IDS[network]
    out.push({ ok: chainId === want, label: 'RPC / chain', detail: chainId === want ? `Connected, chain ${chainId}` : `RPC is chain ${chainId} but ${network} should be ${want} — wrong RPC URL for this network.` })
    if (chainId !== want) return out
  } catch {
    return [{ ok: false, label: 'RPC / chain', detail: 'Could not reach this RPC URL from your browser.' }]
  }

  const code = await client.getCode({ address }).catch(() => undefined)
  if (!code || code === '0x') {
    out.push({ ok: false, label: 'Contract', detail: `No contract code at ${address} on this network. Wrong address or wrong network.` })
    return out
  }
  out.push({ ok: true, label: 'Contract', detail: `Deployed (${Math.round((code.length - 2) / 2)} bytes)` })

  const read = async <T,>(fn: 'owner' | 'minLiquidity' | 'platformFee' | 'feeRecipient' | 'getTotalMarkets' | 'usdc'): Promise<T | undefined> => {
    try { return (await client.readContract({ address, abi: ABI, functionName: fn })) as T } catch { return undefined }
  }

  const owner = await read<`0x${string}`>('owner')
  if (!owner) {
    out.push({ ok: false, label: 'Owner', detail: 'owner() failed — this does not look like a PredarcMarket contract.' })
    return out
  }
  const admin = opts.adminWallet?.trim().toLowerCase()
  const isOwner = !!admin && owner.toLowerCase() === admin
  out.push({
    ok: isOwner,
    label: 'Owner',
    detail: isOwner
      ? `${owner} — your admin wallet. You can create/resolve markets.`
      : `${owner} — NOT your admin wallet${admin ? ` (${opts.adminWallet})` : ''}. Only the owner can create markets, so creating will fail. Deploy your own copy from your admin wallet, or connect the owner wallet.`,
  })

  const [minLiq, fee, feeRec, total, usdc] = await Promise.all([
    read<bigint>('minLiquidity'), read<bigint>('platformFee'), read<`0x${string}`>('feeRecipient'),
    read<bigint>('getTotalMarkets'), read<`0x${string}`>('usdc'),
  ])
  if (minLiq !== undefined) out.push({ ok: true, label: 'Min liquidity (onchain)', detail: `${formatUnits(minLiq, 6)} USDC — each market needs at least this much initial liquidity.` })
  if (fee !== undefined) out.push({ ok: true, label: 'Platform fee', detail: `${Number(fee) / 100}%` })
  if (feeRec) out.push({ ok: true, label: 'Fee recipient (onchain)', detail: feeRec })
  if (total !== undefined) out.push({ ok: true, label: 'Markets', detail: `${total} created` })
  if (usdc) {
    const same = !opts.usdcAddress.trim() || usdc.toLowerCase() === opts.usdcAddress.trim().toLowerCase()
    out.push({ ok: same, label: 'USDC token', detail: same ? usdc : `Contract uses ${usdc} but the USDC address in settings is ${opts.usdcAddress}.` })
  }
  return out
}
