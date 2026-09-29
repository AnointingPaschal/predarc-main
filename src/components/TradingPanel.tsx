import { useState, useEffect } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { activeChainId } from '../lib/adminConfig'
import { toast } from 'sonner'

import { Market, MarketStatus, formatUsdc, parseUsdc } from '../lib/contract'
import { parseOnchainError } from '../lib/errors'
import { useUsdcBalance, useUsdcAllowance, useSharesOut, useUserShares } from '../hooks/useMarkets'
import { useApproveUsdc, useBuyShares, useSellShares } from '../hooks/useEscrow'

interface Props {
  market: Market
  onSuccess?: () => void
}

type Tab = 'buy' | 'sell'

export default function TradingPanel({ market, onSuccess }: Props) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const targetChainId = activeChainId()
  const isWrongChain = chainId !== targetChainId
  const targetName = targetChainId === 5042002 ? 'Arc Testnet' : 'Arc Mainnet'

  const [tab, setTab] = useState<Tab>('buy')
  const [selectedOutcome, setSelectedOutcome] = useState(0)
  const [amount, setAmount] = useState('')

  const parsedAmount = parseUsdc(amount)

  const { data: balance, refetch: refetchBalance } = useUsdcBalance(address)
  const { data: allowance, refetch: refetchAllowance } = useUsdcAllowance(address)
  const { data: sharesOut } = useSharesOut(market.id, selectedOutcome, tab === 'buy' ? parsedAmount : 0n)
  const { data: userShares, refetch: refetchShares } = useUserShares(market.id, address, selectedOutcome)

  const approve = useApproveUsdc()
  const buy = useBuyShares()
  const sell = useSellShares()

  const needsApproval = tab === 'buy' && parsedAmount > 0n && (allowance ?? 0n) < parsedAmount

  // Watch for success
  useEffect(() => {
    if (approve.isSuccess) {
      void refetchAllowance()
      toast.success('Approved! You can now trade.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approve.isSuccess])

  useEffect(() => {
    if (buy.isSuccess) {
      void refetchBalance()
      void refetchShares()
      setAmount('')
      onSuccess?.()
      toast.success('Shares purchased!')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buy.isSuccess])

  useEffect(() => {
    if (sell.isSuccess) {
      void refetchBalance()
      void refetchShares()
      setAmount('')
      onSuccess?.()
      toast.success('Shares sold!')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sell.isSuccess])

  // Errors
  useEffect(() => {
    const err = approve.error || buy.error || sell.error
    if (err) toast.error(parseOnchainError(err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approve.error, buy.error, sell.error])

  const tradingClosed = market.status !== MarketStatus.Open || Date.now() / 1000 > Number(market.endTime)
  const isLoading = approve.isPending || approve.isConfirming || buy.isPending || buy.isConfirming || sell.isPending || sell.isConfirming

  const handleTrade = () => {
    if (!address) return toast.error('Connect your wallet first.')
    if (isWrongChain) { switchChain({ chainId: targetChainId }); return }
    if (tradingClosed) return toast.error('Market is closed for trading.')
    if (parsedAmount === 0n) return toast.error('Enter an amount.')

    if (tab === 'buy') {
      if (needsApproval) {
        approve.approve(parsedAmount * 10n) // approve 10x for convenience
        return
      }
      const rawSharesOut = (sharesOut) ?? 0n
      const minShares = rawSharesOut * 95n / 100n // 5% slippage
      buy.buy(market.id, BigInt(selectedOutcome), parsedAmount, minShares)
    } else {
      const sharesToSell = parseUsdc(amount) * BigInt(1e12) // convert to 1e18 share units
      sell.sell(market.id, BigInt(selectedOutcome), sharesToSell, 0n)
    }
  }

  if (tradingClosed) {
    return (
      <div className="rounded-xl p-4 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Trading has closed for this market.</p>
      </div>
    )
  }

  const userSharesFormatted = userShares ? (Number(userShares) / 1e18).toFixed(2) : '0.00'
  const estimatedOut = sharesOut ? (Number(sharesOut) / 1e18).toFixed(2) : '—'

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* Tab */}
      <div className="flex" style={{ borderBottom: '1px solid var(--border)' }}>
        {(['buy', 'sell'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-3 text-sm font-medium capitalize transition-colors"
            style={{
              color: tab === t ? 'var(--ink)' : 'var(--subtle)',
              background: tab === t ? 'var(--surface-strong)' : 'transparent',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {/* Outcome selector */}
        <div>
          <label className="text-xs mb-1.5 block" style={{ color: 'var(--subtle)' }}>Outcome</label>
          <div className="flex flex-wrap gap-1.5">
            {market.outcomes.map((outcome, i) => {
              const total = market.outcomePools.reduce((a, b) => a + b, 0n)
              const pool = market.outcomePools[i] ?? 0n
              const pct = total > 0n ? ((Number(pool) / Number(total)) * 100).toFixed(0) : '0'
              return (
                <button
                  key={i}
                  onClick={() => setSelectedOutcome(i)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: selectedOutcome === i ? 'var(--accent)' : 'var(--surface-strong)',
                    color: selectedOutcome === i ? '#0d1b2f' : 'var(--muted)',
                    border: '1px solid ' + (selectedOutcome === i ? 'var(--accent)' : 'var(--border)'),
                  }}
                >
                  {outcome} <span className="opacity-70 tabular-nums">{pct}%</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Amount input */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-xs" style={{ color: 'var(--subtle)' }}>Amount (USDC)</label>
            {address && (
              <button
                className="text-xs tabular-nums"
                style={{ color: 'var(--accent)' }}
                onClick={() => balance && setAmount(formatUsdc(balance).replace(/,/g, ''))}
              >
                Balance: ${balance ? formatUsdc(balance) : '—'}
              </button>
            )}
          </div>
          <div className="flex gap-2 rounded-lg overflow-hidden" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <span className="pl-3 flex items-center text-sm" style={{ color: 'var(--muted)' }}>$</span>
            <input
              type="number"
              min="0"
              step="1"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="flex-1 py-2.5 pr-3 bg-transparent text-sm outline-none tabular-nums"
              style={{ color: 'var(--ink)' }}
            />
          </div>
          {/* Quick amounts */}
          <div className="flex gap-1.5 mt-2">
            {['10', '25', '50', '100'].map(v => (
              <button
                key={v}
                onClick={() => setAmount(v)}
                className="flex-1 py-1 rounded text-xs transition-colors"
                style={{ background: 'var(--surface-strong)', color: 'var(--muted)' }}
              >
                ${v}
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        {parsedAmount > 0n && (
          <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--surface-muted)' }}>
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--subtle)' }}>Est. shares out</span>
              <span className="tabular-nums" style={{ color: 'var(--ink-2)' }}>{estimatedOut}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--subtle)' }}>Platform fee (2%)</span>
              <span className="tabular-nums" style={{ color: 'var(--subtle)' }}>${formatUsdc(parsedAmount * 2n / 100n)}</span>
            </div>
          </div>
        )}

        {/* Your position */}
        {address && Number(userSharesFormatted) > 0 && (
          <div className="flex justify-between text-xs px-1">
            <span style={{ color: 'var(--subtle)' }}>Your {market.outcomes[selectedOutcome]} shares</span>
            <span className="tabular-nums" style={{ color: 'var(--accent)' }}>{userSharesFormatted}</span>
          </div>
        )}

        {/* CTA */}
        {!address ? (
          <p className="text-center text-xs py-2" style={{ color: 'var(--subtle)' }}>Connect wallet to trade</p>
        ) : isWrongChain ? (
          <button
            onClick={() => switchChain({ chainId: targetChainId })}
            className="w-full py-3 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--danger)', color: '#fff' }}
          >
            Switch wallet to {targetName}
          </button>
        ) : (
          <button
            onClick={handleTrade}
            disabled={isLoading || parsedAmount === 0n}
            className="w-full py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#0d1b2f' }}
          >
            {isLoading
              ? 'Confirming...'
              : needsApproval
              ? 'Approve USDC'
              : tab === 'buy'
              ? `Buy ${market.outcomes[selectedOutcome] ?? 'Outcome'}`
              : `Sell ${market.outcomes[selectedOutcome] ?? 'Outcome'}`}
          </button>
        )}
      </div>
    </div>
  )
}
