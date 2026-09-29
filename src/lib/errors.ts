// Turn wallet / contract errors into messages a human can act on.
// Unknown errors show viem's short message instead of a generic "something went wrong".

// 4-byte selectors of custom errors that are not in the app ABI (OpenZeppelin)
const SELECTORS: Record<string, string> = {
  '0x118cdaa7': 'Your wallet is not the owner of this contract. Only the wallet that deployed it can do this (create/resolve markets). Connect the owner wallet, or deploy your own contract and set its address in Admin → Config.',
  '0xfb8f41b2': 'USDC allowance is too low. Approve USDC first and wait for it to confirm.',
  '0xe450d38c': 'Not enough USDC in your wallet for this amount.',
  '0x5274afe7': 'USDC transfer failed. Check your USDC balance and allowance.',
  '0x3ee5aeb5': 'Contract is busy (reentrancy). Try again.',
}

const NAMED: [string, string][] = [
  ['ownableunauthorizedaccount', SELECTORS['0x118cdaa7']],
  ['erc20insufficientallowance', SELECTORS['0xfb8f41b2']],
  ['erc20insufficientbalance', SELECTORS['0xe450d38c']],
  ['safeerc20failedoperation', SELECTORS['0x5274afe7']],
  ['invalidliquidity', "Amount is invalid: below the contract's minimum, zero, or this market has no liquidity yet. Check the minimum in Admin → Config → Check contract."],
  ['invalidtimes', 'Dates are invalid: trading must end at least 1 hour from now, and resolution must be at or after the end time.'],
  ['invalidoutcome', 'Outcomes are invalid: Binary needs exactly 2, Multiple Choice 2–10, Scalar 2 with High greater than Low.'],
  ['slippageexceeded', 'Price moved too much. Try a smaller amount.'],
  ['tradingclosed', 'This market has closed for trading.'],
  ['invalidstatus', 'Market is not in the right state for this action.'],
  ['insufficientshares', 'You do not have enough shares to sell.'],
  ['notresolvable', 'Market is not ready to resolve yet.'],
  ['alreadyredeemed', 'You have already redeemed your winnings.'],
  ['nothingtoredeem', 'Nothing to redeem for this market.'],
  ['invalidcomment', 'Comments must be 1–600 characters and replies must target a comment on the same market.'],
  ['notcommentauthor', 'Only the author or the market owner can delete a comment.'],
  ['invalidmarket', 'That market does not exist on this contract.'],
  ['does not match the target chain', 'Your wallet is on a different network than the site. Switch your wallet to the network shown in the banner.'],
  ['chain mismatch', 'Your wallet is on a different network than the site. Switch your wallet to the network shown in the banner.'],
  ['insufficient funds for gas', 'Not enough native gas balance to pay the transaction fee.'],
  ['insufficient funds', 'Insufficient balance for this transaction (including gas).'],
]

export function parseOnchainError(error: unknown): string {
  const e = error as { message?: string; shortMessage?: string; details?: string; cause?: unknown } | undefined
  const full = [e?.shortMessage, e?.message, e?.details].filter(Boolean).join('\n')
  const msg = full.toLowerCase()

  if (msg.includes('user rejected') || msg.includes('user denied') || msg.includes('rejected the request')) return 'Transaction cancelled.'

  for (const [sig, text] of Object.entries(SELECTORS)) if (msg.includes(sig)) return text
  for (const [needle, text] of NAMED) if (msg.includes(needle)) return text

  if (msg.includes('timeout') || msg.includes('failed to fetch') || msg.includes('network request failed')) {
    return 'Network error reaching the RPC. Check the RPC URL for this network in Admin → Config and try again.'
  }
  const short = (e?.shortMessage || e?.message || '').split('\n')[0].trim()
  if (short) return short.length > 180 ? short.slice(0, 177) + '…' : short
  return 'Transaction failed for an unknown reason. Open the browser console for details.'
}
