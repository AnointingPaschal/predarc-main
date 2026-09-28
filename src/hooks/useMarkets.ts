import { useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { PREDARC_ABI, USDC_ADDRESS } from '../lib/contract'
import { loadConfig, getActiveContractAddress, getActiveChainId } from '../lib/adminConfig'

function activeAddress() { return getActiveContractAddress(loadConfig()) as `0x${string}` }
function activeChain() { return getActiveChainId(loadConfig()) }

export function useAllMarkets() {
  return useReadContract({
    address: activeAddress(),
    abi: PREDARC_ABI,
    functionName: 'getAllMarkets',
    chainId: activeChain(),
  })
}

export function useMarket(marketId: bigint | undefined) {
  return useReadContract({
    address: activeAddress(),
    abi: PREDARC_ABI,
    functionName: 'getMarket',
    args: marketId !== undefined ? [marketId] : undefined,
    chainId: activeChain(),
    query: { enabled: marketId !== undefined },
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
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: activeChain(),
    query: { enabled: !!address },
  })
}

export function useUsdcAllowance(owner: `0x${string}` | undefined) {
  return useReadContract({
    address: USDC_ADDRESS,
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
