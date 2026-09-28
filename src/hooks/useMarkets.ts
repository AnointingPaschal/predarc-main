import { useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { arcTestnet } from 'viem/chains'
import { PREDARC_ADDRESS, PREDARC_ABI, USDC_ADDRESS } from '../lib/contract'

const CHAIN_ID = arcTestnet.id

export function useAllMarkets() {
  return useReadContract({
    address: PREDARC_ADDRESS,
    abi: PREDARC_ABI,
    functionName: 'getAllMarkets',
    chainId: CHAIN_ID,
  })
}

export function useMarket(marketId: bigint | undefined) {
  return useReadContract({
    address: PREDARC_ADDRESS,
    abi: PREDARC_ABI,
    functionName: 'getMarket',
    args: marketId !== undefined ? [marketId] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: marketId !== undefined },
  })
}

export function useTotalMarkets() {
  return useReadContract({
    address: PREDARC_ADDRESS,
    abi: PREDARC_ABI,
    functionName: 'getTotalMarkets',
    chainId: CHAIN_ID,
  })
}

export function useUserShares(marketId: bigint | undefined, userAddress: `0x${string}` | undefined, outcomeIndex: number) {
  return useReadContract({
    address: PREDARC_ADDRESS,
    abi: PREDARC_ABI,
    functionName: 'getUserShares',
    args: (marketId !== undefined && userAddress) ? [marketId, userAddress, BigInt(outcomeIndex)] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: marketId !== undefined && !!userAddress },
  })
}

export function useMarketPrice(marketId: bigint | undefined, outcomeIndex: number) {
  return useReadContract({
    address: PREDARC_ADDRESS,
    abi: PREDARC_ABI,
    functionName: 'getMarketPrice',
    args: marketId !== undefined ? [marketId, BigInt(outcomeIndex)] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: marketId !== undefined },
  })
}

export function useSharesOut(marketId: bigint | undefined, outcomeIndex: number, usdcAmount: bigint) {
  return useReadContract({
    address: PREDARC_ADDRESS,
    abi: PREDARC_ABI,
    functionName: 'getSharesOut',
    args: marketId !== undefined ? [marketId, BigInt(outcomeIndex), usdcAmount] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: marketId !== undefined && usdcAmount > 0n },
  })
}

export function useUsdcOut(marketId: bigint | undefined, outcomeIndex: number, sharesAmount: bigint) {
  return useReadContract({
    address: PREDARC_ADDRESS,
    abi: PREDARC_ABI,
    functionName: 'getUsdcOut',
    args: marketId !== undefined ? [marketId, BigInt(outcomeIndex), sharesAmount] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: marketId !== undefined && sharesAmount > 0n },
  })
}

export function useUsdcBalance(address: `0x${string}` | undefined) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })
}

export function useUsdcAllowance(owner: `0x${string}` | undefined) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: (owner) ? [owner, PREDARC_ADDRESS] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!owner },
  })
}

export function usePlatformFee() {
  return useReadContract({
    address: PREDARC_ADDRESS,
    abi: PREDARC_ABI,
    functionName: 'platformFee',
    chainId: CHAIN_ID,
  })
}

export function useFeeRecipient() {
  return useReadContract({
    address: PREDARC_ADDRESS,
    abi: PREDARC_ABI,
    functionName: 'feeRecipient',
    chainId: CHAIN_ID,
  })
}

export function useAccruedFees() {
  return useReadContract({
    address: PREDARC_ADDRESS,
    abi: PREDARC_ABI,
    functionName: 'accruedFees',
    chainId: CHAIN_ID,
  })
}

export function useUserPositions(address: `0x${string}` | undefined) {
  return useReadContract({
    address: PREDARC_ADDRESS,
    abi: PREDARC_ABI,
    functionName: 'getUserMarketPositions',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })
}
