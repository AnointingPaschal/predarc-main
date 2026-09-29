import { useState } from 'react'
import { useConfig, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { erc20Abi, keccak256, toHex } from 'viem'
import { PREDARC_ABI } from '../lib/contract'
import { saveMarketMeta, type MarketMeta } from '../lib/api'
import { activeContract, activeChainId, activeUsdc } from '../lib/adminConfig'

function activeAddress() { return activeContract() }

export function useApproveUsdc() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const approve = (amount: bigint) => {
    writeContract({
      address: activeUsdc(),
      chainId: activeChainId(),
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
      address: activeAddress(), chainId: activeChainId(),
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
      address: activeAddress(), chainId: activeChainId(),
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
      address: activeAddress(), chainId: activeChainId(),
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
      address: activeAddress(), chainId: activeChainId(),
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
    writeContract({ address: activeAddress(), chainId: activeChainId(), abi: PREDARC_ABI, functionName: 'resolveMarket', args: [marketId, outcome] })
  }
  return { resolve, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useResolveScalarMarket() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const resolveScalar = (marketId: bigint, value: bigint) => {
    writeContract({ address: activeAddress(), chainId: activeChainId(), abi: PREDARC_ABI, functionName: 'resolveScalarMarket', args: [marketId, value] })
  }
  return { resolveScalar, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useCancelMarket() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const cancel = (marketId: bigint) => {
    writeContract({ address: activeAddress(), chainId: activeChainId(), abi: PREDARC_ABI, functionName: 'cancelMarket', args: [marketId] })
  }
  return { cancel, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useCloseMarket() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const close = (marketId: bigint) => {
    writeContract({ address: activeAddress(), chainId: activeChainId(), abi: PREDARC_ABI, functionName: 'closeMarket', args: [marketId] })
  }
  return { close, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useFeatureMarket() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const feature = (marketId: bigint, featured: boolean) => {
    writeContract({ address: activeAddress(), chainId: activeChainId(), abi: PREDARC_ABI, functionName: 'featureMarket', args: [marketId, featured] })
  }
  return { feature, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useSetFee() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const setFee = (newFeeBps: bigint) => {
    writeContract({ address: activeAddress(), chainId: activeChainId(), abi: PREDARC_ABI, functionName: 'setFee', args: [newFeeBps] })
  }
  return { setFee, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export function useWithdrawFees() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const withdraw = () => {
    writeContract({ address: activeAddress(), chainId: activeChainId(), abi: PREDARC_ABI, functionName: 'withdrawFees', args: [] })
  }
  return { withdraw, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

export interface CreateMarketParams {
  marketType: number
  question: string
  outcomes: string[]
  endTime: bigint
  resolutionTime: bigint
  scalarLow: bigint
  scalarHigh: bigint
  category: string
  imageUrl: string
  initialLiquidity: bigint
}

/**
 * Approve USDC, wait for the approval to be mined, then create the market and
 * wait for that too. Throws on failure so callers can show a real error.
 */
const MARKET_CREATED_TOPIC = keccak256(toHex('MarketCreated(uint256,uint8,string,uint256)'))

export function useCreateMarketFlow() {
  const wagmiConfig = useConfig()
  const { writeContractAsync } = useWriteContract()
  const [step, setStep] = useState<'idle' | 'approving' | 'creating'>('idle')

  const run = async (p: CreateMarketParams, meta?: MarketMeta): Promise<{ hash: `0x${string}`; marketId?: bigint }> => {
    const chainId = activeChainId()
    const contract = activeContract()
    if (!contract) throw new Error('No contract address is set for this network. Add it in Admin → Config.')
    const wait = async (hash: `0x${string}`, what: string) => {
      const r = await waitForTransactionReceipt(wagmiConfig, { hash, chainId })
      if (r.status !== 'success') throw new Error(`${what} transaction reverted onchain.`)
    }
    try {
      if (p.initialLiquidity > 0n) {
        setStep('approving')
        await wait(await writeContractAsync({
          address: activeUsdc(), chainId, abi: erc20Abi, functionName: 'approve', args: [contract, p.initialLiquidity],
        }), 'USDC approval')
      }

      setStep('creating')
      const hash = await writeContractAsync({
        address: contract, chainId, abi: PREDARC_ABI, functionName: 'createMarket',
        args: [p.marketType, p.question, p.outcomes, p.endTime, p.resolutionTime, p.scalarLow, p.scalarHigh, p.category, p.imageUrl, p.initialLiquidity],
      })
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId })
      if (receipt.status !== 'success') throw new Error('Create market transaction reverted onchain.')
      // MarketCreated(uint256 indexed marketId, ...) — the id is topic 1
      const created = receipt.logs.find(l => l.address.toLowerCase() === contract.toLowerCase() && l.topics[0] === MARKET_CREATED_TOPIC)
      const marketId = created?.topics[1] ? BigInt(created.topics[1]) : undefined
      if (marketId !== undefined && meta && (meta.resolutionCriteria || meta.sources?.length || meta.description)) {
        try { await saveMarketMeta(marketId, meta) } catch { /* the market exists; details can be re-saved from its page */ }
      }
      return { hash, marketId }
    } finally {
      setStep('idle')
    }
  }
  return { run, step, busy: step !== 'idle' }
}

/** Owner-only: fund a market (approve USDC, then addLiquidity). Also how a free, 0-liquidity market becomes tradable. */
export function useAddLiquidity() {
  const wagmiConfig = useConfig()
  const { writeContractAsync } = useWriteContract()
  const [step, setStep] = useState<'idle' | 'approving' | 'adding'>('idle')
  const run = async (marketId: bigint, amount: bigint) => {
    const chainId = activeChainId(), contract = activeContract()
    if (!contract) throw new Error('No contract address is set for this network.')
    try {
      setStep('approving')
      const a = await waitForTransactionReceipt(wagmiConfig, { chainId, hash: await writeContractAsync({ address: activeUsdc(), chainId, abi: erc20Abi, functionName: 'approve', args: [contract, amount] }) })
      if (a.status !== 'success') throw new Error('USDC approval reverted onchain.')
      setStep('adding')
      const r = await waitForTransactionReceipt(wagmiConfig, { chainId, hash: await writeContractAsync({ address: contract, chainId, abi: PREDARC_ABI, functionName: 'addLiquidity', args: [marketId, amount] }) })
      if (r.status !== 'success') throw new Error('Add liquidity reverted onchain.')
    } finally { setStep('idle') }
  }
  return { run, step, busy: step !== 'idle' }
}

/** Owner-only market editing (contract v2+): public details and/or trading times. */
export function useUpdateMarketFlow() {
  const wagmiConfig = useConfig()
  const { writeContractAsync } = useWriteContract()
  const [step, setStep] = useState('')
  const run = async (marketId: bigint, o: { info?: { question: string; category: string; imageUrl: string }; times?: { endTime: bigint; resolutionTime: bigint } }) => {
    const chainId = activeChainId(), address = activeContract()
    const send = async (fn: 'updateMarketInfo' | 'updateMarketTimes', args: readonly unknown[], label: string) => {
      setStep(label)
      const hash = await writeContractAsync({ address, chainId, abi: PREDARC_ABI, functionName: fn, args } as never)
      const r = await waitForTransactionReceipt(wagmiConfig, { hash, chainId })
      if (r.status !== 'success') throw new Error(`${label} reverted onchain.`)
    }
    try {
      if (o.info) await send('updateMarketInfo', [marketId, o.info.question, o.info.category, o.info.imageUrl], 'Saving details')
      if (o.times) await send('updateMarketTimes', [marketId, o.times.endTime, o.times.resolutionTime], 'Saving times')
    } finally { setStep('') }
  }
  return { run, step, busy: step !== '' }
}

/** Onchain comments (contract v2+). Each call is a wallet transaction. */
export function useCommentTx() {
  const wagmiConfig = useConfig()
  const { writeContractAsync } = useWriteContract()
  const [busy, setBusy] = useState(false)
  const send = async (fn: 'postComment' | 'deleteComment' | 'reactToComment', args: readonly unknown[]) => {
    const chainId = activeChainId()
    setBusy(true)
    try {
      const hash = await writeContractAsync({ address: activeContract(), chainId, abi: PREDARC_ABI, functionName: fn, args } as never)
      const r = await waitForTransactionReceipt(wagmiConfig, { hash, chainId })
      if (r.status !== 'success') throw new Error('The transaction reverted onchain.')
    } finally { setBusy(false) }
  }
  return {
    busy,
    post: (marketId: bigint, text: string, parentId: bigint) => send('postComment', [marketId, text, parentId]),
    remove: (commentId: bigint) => send('deleteComment', [commentId]),
    react: (commentId: bigint, liked: boolean) => send('reactToComment', [commentId, liked]),
  }
}

export function useSetMinLiquidity() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const setMin = (amountUsdc6: bigint) => {
    writeContract({ address: activeAddress(), chainId: activeChainId(), abi: PREDARC_ABI, functionName: 'setMinLiquidity', args: [amountUsdc6] })
  }
  return { setMin, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}
