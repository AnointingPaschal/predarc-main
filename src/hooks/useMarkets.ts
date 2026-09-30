import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { PREDARC_ABI } from '../lib/contract'
import { activeContract, activeChainId, activeUsdc } from '../lib/adminConfig'

function activeAddress() { return activeContract() }
function activeChain() { return activeChainId() }

export function useAllMarkets(enabled = true) {
  return useReadContract({
    address: activeAddress(),
    abi: PREDARC_ABI,
    functionName: 'getAllMarkets',
    chainId: activeChain(),
    query: { enabled },
  })
}

export function useMarket(marketId: bigint | undefined, refetchMs?: number) {
  return useReadContract({
    address: activeAddress(),
    abi: PREDARC_ABI,
    functionName: 'getMarket',
    args: marketId !== undefined ? [marketId] : undefined,
    chainId: activeChain(),
    query: { enabled: marketId !== undefined, refetchInterval: refetchMs },
  })
}

export function useTotalMarkets() {
  return useReadContract({
    address: activeAddress(),
    abi: PREDARC_ABI,
    functionName: 'getTotalMarkets',
    chainId: activeChain(),
  })
}

export function useUserShares(marketId: bigint | undefined, userAddress: `0x${string}` | undefined, outcomeIndex: number) {
  return useReadContract({
    address: activeAddress(),
    abi: PREDARC_ABI,
    functionName: 'getUserShares',
    args: (marketId !== undefined && userAddress) ? [marketId, userAddress, BigInt(outcomeIndex)] : undefined,
    chainId: activeChain(),
    query: { enabled: marketId !== undefined && !!userAddress },
  })
}

export function useMarketPrice(marketId: bigint | undefined, outcomeIndex: number) {
  return useReadContract({
    address: activeAddress(),
    abi: PREDARC_ABI,
    functionName: 'getMarketPrice',
    args: marketId !== undefined ? [marketId, BigInt(outcomeIndex)] : undefined,
    chainId: activeChain(),
    query: { enabled: marketId !== undefined },
  })
}

export function useSharesOut(marketId: bigint | undefined, outcomeIndex: number, usdcAmount: bigint) {
  return useReadContract({
    address: activeAddress(),
    abi: PREDARC_ABI,
    functionName: 'getSharesOut',
    args: marketId !== undefined ? [marketId, BigInt(outcomeIndex), usdcAmount] : undefined,
    chainId: activeChain(),
    query: { enabled: marketId !== undefined && usdcAmount > 0n },
  })
}

export function useUsdcOut(marketId: bigint | undefined, outcomeIndex: number, sharesAmount: bigint) {
  return useReadContract({
    address: activeAddress(),
    abi: PREDARC_ABI,
    functionName: 'getUsdcOut',
    args: marketId !== undefined ? [marketId, BigInt(outcomeIndex), sharesAmount] : undefined,
    chainId: activeChain(),
    query: { enabled: marketId !== undefined && sharesAmount > 0n },
  })
}

export function useUsdcBalance(address: `0x${string}` | undefined) {
  return useReadContract({
    address: activeUsdc(),
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: activeChain(),
    query: { enabled: !!address },
  })
}

export function useUsdcAllowance(owner: `0x${string}` | undefined) {
  return useReadContract({
    address: activeUsdc(),
    abi: erc20Abi,
    functionName: 'allowance',
    args: (owner) ? [owner, activeAddress()] : undefined,
    chainId: activeChain(),
    query: { enabled: !!owner },
  })
}

export function usePlatformFee() {
  return useReadContract({
    address: activeAddress(),
    abi: PREDARC_ABI,
    functionName: 'platformFee',
    chainId: activeChain(),
  })
}

export function useFeeRecipient() {
  return useReadContract({
    address: activeAddress(),
    abi: PREDARC_ABI,
    functionName: 'feeRecipient',
    chainId: activeChain(),
  })
}

export function useAccruedFees() {
  return useReadContract({
    address: activeAddress(),
    abi: PREDARC_ABI,
    functionName: 'accruedFees',
    chainId: activeChain(),
  })
}

export function useUserPositions(address: `0x${string}` | undefined) {
  return useReadContract({
    address: activeAddress(),
    abi: PREDARC_ABI,
    functionName: 'getUserMarketPositions',
    args: address ? [address] : undefined,
    chainId: activeChain(),
    query: { enabled: !!address },
  })
}

/** Feature level of the active contract: 2+ supports editing and onchain comments; 0 = older contract. */
export function useContractVersion() {
  const r = useReadContract({ address: activeAddress(), abi: PREDARC_ABI, functionName: 'contractVersion', chainId: activeChain(), query: { enabled: !!activeAddress(), retry: false, staleTime: 60_000 } })
  return { version: r.data !== undefined ? Number(r.data as bigint) : 0, loading: r.isLoading }
}

/**
 * Owner + minimum liquidity of the active contract, and whether the connected
 * wallet is the owner. createMarket is onlyOwner, so non-owners always revert.
 */
export function useContractGuard() {
  const { address } = useAccount()
  const enabled = !!activeAddress()
  const owner = useReadContract({ address: activeAddress(), abi: PREDARC_ABI, functionName: 'owner', chainId: activeChain(), query: { enabled } })
  const minLiq = useReadContract({ address: activeAddress(), abi: PREDARC_ABI, functionName: 'minLiquidity', chainId: activeChain(), query: { enabled } })
  const ownerAddr = owner.data as `0x${string}` | undefined
  return {
    loading: owner.isLoading || minLiq.isLoading,
    hasContract: enabled,
    owner: ownerAddr,
    isOwner: !!address && !!ownerAddr && ownerAddr.toLowerCase() === address.toLowerCase(),
    minLiquidityUsdc: minLiq.data !== undefined ? Number(minLiq.data as bigint) / 1e6 : undefined,
  }
}
