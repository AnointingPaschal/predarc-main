import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi } from 'viem'
import { PREDARC_ABI, USDC_ADDRESS } from '../lib/contract'
import { loadConfig, getActiveContractAddress } from '../lib/adminConfig'

function activeAddress() { return getActiveContractAddress(loadConfig()) as `0x${string}` }

export function useApproveUsdc() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const approve = (amount: bigint) => {
    writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [activeAddress(), amount],
    })
  }
  return { approve, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useBuyShares() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const buy = (marketId: bigint, outcomeIndex: bigint, usdcAmount: bigint, minSharesOut: bigint) => {
    writeContract({
      address: activeAddress(),
      abi: PREDARC_ABI,
      functionName: 'buyShares',
      args: [marketId, outcomeIndex, usdcAmount, minSharesOut],
    })
  }
  return { buy, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useSellShares() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const sell = (marketId: bigint, outcomeIndex: bigint, sharesAmount: bigint, minUsdcOut: bigint) => {
    writeContract({
      address: activeAddress(),
      abi: PREDARC_ABI,
      functionName: 'sellShares',
      args: [marketId, outcomeIndex, sharesAmount, minUsdcOut],
    })
  }
  return { sell, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useRedeemWinnings() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const redeem = (marketId: bigint) => {
    writeContract({
      address: activeAddress(),
      abi: PREDARC_ABI,
      functionName: 'redeemWinnings',
      args: [marketId],
    })
  }
  return { redeem, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

// Admin hooks
export function useCreateMarket() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const create = (
    marketType: number,
    question: string,
    outcomes: string[],
    endTime: bigint,
    resolutionTime: bigint,
    scalarLow: bigint,
    scalarHigh: bigint,
    category: string,
    imageUrl: string,
    initialLiquidity: bigint,
  ) => {
    writeContract({
      address: activeAddress(),
      abi: PREDARC_ABI,
      functionName: 'createMarket',
      args: [marketType, question, outcomes, endTime, resolutionTime, scalarLow, scalarHigh, category, imageUrl, initialLiquidity],
    })
  }
  return { create, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useResolveMarket() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const resolve = (marketId: bigint, outcome: bigint) => {
    writeContract({ address: activeAddress(), abi: PREDARC_ABI, functionName: 'resolveMarket', args: [marketId, outcome] })
  }
  return { resolve, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useResolveScalarMarket() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const resolveScalar = (marketId: bigint, value: bigint) => {
    writeContract({ address: activeAddress(), abi: PREDARC_ABI, functionName: 'resolveScalarMarket', args: [marketId, value] })
  }
  return { resolveScalar, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useCancelMarket() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const cancel = (marketId: bigint) => {
    writeContract({ address: activeAddress(), abi: PREDARC_ABI, functionName: 'cancelMarket', args: [marketId] })
  }
  return { cancel, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useCloseMarket() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const close = (marketId: bigint) => {
    writeContract({ address: activeAddress(), abi: PREDARC_ABI, functionName: 'closeMarket', args: [marketId] })
  }
  return { close, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useFeatureMarket() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const feature = (marketId: bigint, featured: boolean) => {
    writeContract({ address: activeAddress(), abi: PREDARC_ABI, functionName: 'featureMarket', args: [marketId, featured] })
  }
  return { feature, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useSetFee() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const setFee = (newFeeBps: bigint) => {
    writeContract({ address: activeAddress(), abi: PREDARC_ABI, functionName: 'setFee', args: [newFeeBps] })
  }
  return { setFee, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useWithdrawFees() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const withdraw = () => {
    writeContract({ address: activeAddress(), abi: PREDARC_ABI, functionName: 'withdrawFees', args: [] })
  }
  return { withdraw, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}
