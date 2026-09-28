import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { useUserPositions, useAllMarkets, useUserShares, useUsdcBalance } from '../hooks/useMarkets'
import { useRedeemWinnings } from '../hooks/useEscrow'
import { Market, MarketStatus, formatUsdc } from '../lib/contract'

import { Link } from 'react-router-dom'
import { TrendingUp, Award } from 'lucide-react'

export default function Portfolio() {
  const { address } = useAccount()
  const { data: balance } = useUsdcBalance(address)
  const { data: positionIds } = useUserPositions(address)
  const { data: allMarkets } = useAllMarkets()

  if (!address) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <Award size={40} className="mx-auto mb-4 opacity-30" style={{ color: 'var(--muted)' }} />
        <h1 className="display text-2xl font-600 mb-2" style={{ color: 'var(--ink)' }}>Your Portfolio</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--subtle)' }}>Connect your wallet to view your positions.</p>
        <ConnectKitButton />
      </div>
    )
  }

  const ids = positionIds as bigint[] | undefined
  const markets = allMarkets as Market[] | undefined
  const userMarkets = markets?.filter(m => ids?.includes(m.id)) ?? []

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="display text-3xl font-700 mb-2" style={{ color: 'var(--ink)' }}>Portfolio</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--subtle)' }}>
        USDC Balance: <strong className="tabular-nums" style={{ color: 'var(--accent)' }}>${balance ? formatUsdc(balance) : '—'}</strong>
      </p>

      {userMarkets.length === 0 ? (
        <div className="text-center py-16">
          <TrendingUp size={32} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--muted)' }} />
          <p style={{ color: 'var(--muted)' }}>No positions yet.</p>
          <Link to="/" className="text-sm mt-2 block" style={{ color: 'var(--accent)' }}>Browse markets</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {userMarkets.map(m => <PositionRow key={m.id.toString()} market={m} userAddress={address} />)}
        </div>
      )}
    </div>
  )
}

function PositionRow({ market, userAddress }: { market: Market; userAddress: `0x${string}` }) {
  const redeem = useRedeemWinnings()
  const canRedeem = market.status === MarketStatus.Resolved || market.status === MarketStatus.Cancelled

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Link to={`/market/${market.id}`} className="text-sm font-medium hover:underline block truncate" style={{ color: 'var(--ink-2)' }}>
            {market.question}
          </Link>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>#{market.id.toString()}</span>
            <span className={`text-xs ${market.status === MarketStatus.Open ? 'text-green-400' : market.status === MarketStatus.Resolved ? 'text-blue-400' : 'text-yellow-400'}`}>
              {market.status === MarketStatus.Open ? 'Open' : market.status === MarketStatus.Resolved ? 'Resolved' : market.status === MarketStatus.Cancelled ? 'Cancelled' : 'Closed'}
            </span>
          </div>
        </div>
        {canRedeem && (
          <button
            onClick={() => redeem.redeem(market.id)}
            disabled={redeem.isPending || redeem.isConfirming}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 disabled:opacity-50"
            style={{ background: 'var(--success)', color: '#0d1b2f' }}
          >
            {redeem.isPending || redeem.isConfirming ? 'Claiming...' : 'Claim'}
          </button>
        )}
      </div>

      {/* Outcome positions */}
      <div className="mt-3 flex flex-wrap gap-2">
        {market.outcomes.map((outcome, i) => (
          <OutcomePosition key={i} market={market} outcomeIndex={i} outcome={outcome} userAddress={userAddress} />
        ))}
      </div>
    </div>
  )
}

function OutcomePosition({ market, outcomeIndex, outcome, userAddress }: {
  market: Market; outcomeIndex: number; outcome: string; userAddress: `0x${string}`
}) {
  const { data: shares } = useUserShares(market.id, userAddress, outcomeIndex)
  const sharesNum = shares ? Number(shares) / 1e18 : 0
  if (sharesNum < 0.001) return null

  const isWinner = market.status === MarketStatus.Resolved && market.resolvedOutcome === BigInt(outcomeIndex)

  return (
    <div
      className="px-2.5 py-1 rounded-lg text-xs"
      style={{
        background: isWinner ? 'rgba(141,216,159,0.15)' : 'var(--surface-strong)',
        color: isWinner ? 'var(--success)' : 'var(--muted)',
        border: '1px solid ' + (isWinner ? 'rgba(141,216,159,0.3)' : 'var(--border)'),
      }}
    >
      <span className="font-medium">{outcome}</span>
      <span className="ml-1.5 tabular-nums opacity-70">{sharesNum.toFixed(2)} shares</span>
    </div>
  )
}
