import { useState, useEffect } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { activeChainId } from '../lib/adminConfig'
import { toast } from 'sonner'

import { parseUnits } from 'viem'
import { Market, MarketStatus, formatUsdc, parseUsdc, getMarketPrice } from '../lib/contract'
import { parseOnchainError } from '../lib/errors'
import { useUsdcBalance, useUsdcAllowance, useSharesOut, useUsdcOut, useUserShares, usePlatformFee } from '../hooks/useMarkets'
import { useApproveUsdc, useBuyShares, useSellShares } from '../hooks/useEscrow'

interface Props {
  market: Market
  onSuccess?: () => void
  outcome?: number
  onOutcomeChange?: (i: number) => void
}

type Tab = 'buy' | 'sell'

export default function TradingPanel({ market, onSuccess, outcome, onOutcomeChange }: Props) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const targetChainId = activeChainId()
  const isWrongChain = chainId !== targetChainId
  const targetName = targetChainId === 5042002 ? 'Arc Testnet' : 'Arc Mainnet'

  const [tab, setTab] = useState<Tab>('buy')
  const [localOutcome, setLocalOutcome] = useState(0)
  const selectedOutcome = outcome ?? localOutcome
  const setSelectedOutcome = (i: number) => { setLocalOutcome(i); onOutcomeChange?.(i) }
  const [amount, setAmount] = useState('')

  const parsedAmount = parseUsdc(amount)
  // Sell amounts are shares (6-dp precision), converted to the contract's 1e18 share units
  const sharesToSell = (() => { try { return amount ? parseUnits(amount, 6) * 10n ** 12n : 0n } catch { return 0n } })()
  const { data: feeRaw } = usePlatformFee()
  const feeBps = feeRaw !== undefined ? BigInt(feeRaw as bigint) : 200n

  const { data: balance, refetch: refetchBalance } = useUsdcBalance(address)
  const { data: allowance, refetch: refetchAllowance } = useUsdcAllowance(address)
  const { data: sharesOut } = useSharesOut(market.id, selectedOutcome, tab === 'buy' ? parsedAmount : 0n)
  const { data: userShares, refetch: refetchShares } = useUserShares(market.id, address, selectedOutcome)
  const { data: usdcOut } = useUsdcOut(market.id, selectedOutcome, tab === 'sell' ? sharesToSell : 0n)

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

  const userSharesFormatted = userShares ? (Number(userShares) / 1e18).toFixed(2) : '0.00'
  const tradingClosed = market.status !== MarketStatus.Open || Date.now() / 1000 > Number(market.endTime)
  const isLoading = approve.isPending || approve.isConfirming || buy.isPending || buy.isConfirming || sell.isPending || sell.isConfirming

  const handleTrade = () => {
    if (!address) return toast.error('Connect your wallet first.')
    if (isWrongChain) { switchChain({ chainId: targetChainId }); return }
    if (tradingClosed) return toast.error('Market is closed for trading.')
    if ((tab === 'buy' ? parsedAmount : sharesToSell) === 0n) return toast.error('Enter an amount.')
    if (tab === 'sell' && sharesToSell > ((userShares as bigint | undefined) ?? 0n)) return toast.error('You do not own that many shares.')

    if (tab === 'buy') {
      if (needsApproval) {
        approve.approve(parsedAmount * 10n) // approve 10x for convenience
        return
      }
      const rawSharesOut = (sharesOut) ?? 0n
      const minShares = rawSharesOut * 95n / 100n // 5% slippage
      buy.buy(market.id, BigInt(selectedOutcome), parsedAmount, minShares)
    } else {
      const minOut = ((usdcOut as bigint | undefined) ?? 0n) * 95n / 100n // 5% slippage
      sell.sell(market.id, BigInt(selectedOutcome), sharesToSell, minOut)
    }
  }

  if (!tradingClosed && market.totalLiquidity === 0n) {
    return (
      <div className="rounded-xl p-4 text-center space-y-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>No liquidity yet</p>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>This market was created for free. Trading opens as soon as the admin funds it.</p>
      </div>
    )
  }

  if (tradingClosed) {
    return (
      <div className="rounded-xl p-4 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Trading has closed for this market.</p>
      </div>
    )
  }

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
              const pct = (getMarketPrice(market, i) * 100).toFixed(0)
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
            <label className="text-xs" style={{ color: 'var(--subtle)' }}>{tab === 'buy' ? 'Amount (USDC)' : 'Shares to sell'}</label>
            {address && (
              <button
                className="text-xs tabular-nums"
                style={{ color: 'var(--accent)' }}
                onClick={() => {
                  if (tab === 'buy') { if (balance) setAmount((Number(balance) / 1e6).toFixed(6).replace(/\.?0+$/, '')) }
                  else if (userShares) { const v = (userShares as bigint) / 10n ** 12n; setAmount(`${v / 1000000n}.${String(v % 1000000n).padStart(6, '0')}`) }
                }}
              >
                {tab === 'buy' ? `Balance: $${balance ? formatUsdc(balance) : '—'}` : `Max: ${userSharesFormatted}`}
              </button>
            )}
          </div>
          <div className="flex gap-2 rounded-lg overflow-hidden" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <span className="pl-3 flex items-center text-sm" style={{ color: 'var(--muted)' }}>{tab === 'buy' ? '$' : '#'}</span>
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
          {tab === 'buy' && <div className="flex gap-1.5 mt-2">
            {['1', '5', '10', '100'].map(v => (
              <button
                key={v}
                onClick={() => setAmount(String((parseFloat(amount) || 0) + Number(v)))}
                className="flex-1 py-1 rounded text-xs transition-colors"
                style={{ background: 'var(--surface-strong)', color: 'var(--muted)' }}
              >
                +${v}
              </button>
            ))}
          </div>}
        </div>

        {/* Preview */}
        {(tab === 'buy' ? parsedAmount : sharesToSell) > 0n && (
          <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--surface-muted)' }}>
            {tab === 'buy' ? (
              <>
                <Row l="Est. shares" v={estimatedOut} />
                <Row l="Avg price" v={sharesOut && (sharesOut as bigint) > 0n ? `$${((Number(parsedAmount) / 1e6) / (Number(sharesOut) / 1e18)).toFixed(3)} / share` : '—'} />
                <Row l={`Fee (${(Number(feeBps) / 100).toFixed(2)}%)`} v={`$${formatUsdc(parsedAmount * feeBps / 10000n)}`} dim />
                <Row l="Payout if it wins" v={sharesOut ? `$${(Number(sharesOut) / 1e18).toFixed(2)}` : '—'} strong />
              </>
            ) : (
              <>
                <Row l="You receive" v={usdcOut ? `$${formatUsdc(usdcOut as bigint)}` : '—'} strong />
                <Row l="Avg price" v={usdcOut && sharesToSell > 0n ? `$${((Number(usdcOut) / 1e6) / (Number(sharesToSell) / 1e18)).toFixed(3)} / share` : '—'} />
              </>
            )}
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
            disabled={isLoading || (tab === 'buy' ? parsedAmount === 0n : sharesToSell === 0n)}
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

function Row({ l, v, dim, strong }: { l: string; v: string; dim?: boolean; strong?: boolean }) {
  return (
    <div className="flex justify-between text-xs">
      <span style={{ color: 'var(--subtle)' }}>{l}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold' : ''}`} style={{ color: strong ? 'var(--success)' : dim ? 'var(--subtle)' : 'var(--ink-2)' }}>{v}</span>
    </div>
  )
}
