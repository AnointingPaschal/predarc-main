# Predarc

> Onchain Prediction Markets on Arc — built with Arc Studio

---

## What This App Does

Predarc is a full-featured prediction market platform (like Polymarket) on Arc Mainnet. Users trade outcome shares using USDC. Markets use a CPMM AMM for instant liquidity. Supports Binary (yes/no), Multiple Choice, and Scalar (numeric range) markets. Admin-controlled market creation and resolution. 2% configurable platform fee.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, react-router-dom v7
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry + via_ir. Source: `contracts/PredarcMarket.sol`
- Wallet: injected (MetaMask, etc.)
- Target Chain: Arc Mainnet (Chain ID: 5042) — build/test on Arc Testnet (5042002)
- Token: USDC at 0x3600000000000000000000000000000000000000 (same address both networks)
- Toasts: Sonner

## Deployed Contracts

| Network | Address | Explorer |
|---|---|---|
| Arc Testnet | 0xa78c2aa7a9ccff28ba42e59ae0a8c86f0da4e275 | https://explorer.testnet.arc.io/address/0xa78c2aa7a9ccff28ba42e59ae0a8c86f0da4e275 |
| Arc Mainnet | — | Deploy with: `forge create contracts/PredarcMarket.sol:PredarcMarket --rpc-url https://rpc.mainnet.arc.io --private-key $PRIVATE_KEY --constructor-args 0x3600000000000000000000000000000000000000 <FEE_RECIPIENT> 200` |

## Key Files

- `contracts/PredarcMarket.sol` - Main prediction market contract
- `src/App.tsx` - App root with BrowserRouter + routes
- `src/pages/MarketList.tsx` - Browse/filter all markets
- `src/pages/MarketDetail.tsx` - Market detail + trading panel
- `src/pages/Portfolio.tsx` - User positions + claim winnings
- `src/pages/AdminPanel.tsx` - Full admin: create markets, resolve, fees, branding, config
- `src/components/TradingPanel.tsx` - Buy/sell shares with USDC
- `src/components/MarketCard.tsx` - Market list item
- `src/hooks/useMarkets.ts` - Contract read hooks
- `src/hooks/useEscrow.ts` - Contract write hooks
- `src/lib/contract.ts` - ABI + address + helpers
- `src/lib/adminConfig.ts` - Admin config (localStorage-backed, CSS vars)
- `src/config.ts` - wagmi config

## Admin Panel

Access at `/admin`. Features:
- Markets tab: resolve, cancel, feature markets
- Create tab: create binary/multiple/scalar markets with Chainlink feed support
- Fees tab: update fee bps, withdraw accrued fees
- Branding tab: logo upload, colors, custom CSS, footer, social links
- Config tab: contract address, RPC URL, chain ID, USDC address, admin wallet, fee recipient, Chainlink feeds

## Cloudflare Deploy

This is a Vite static app. Build with `bun run build` and serve `dist/` via Cloudflare Pages.

## Mainnet Deploy Instructions

1. Fund deployer wallet with real USDC on Arc Mainnet
2. Run: `forge create contracts/PredarcMarket.sol:PredarcMarket --rpc-url https://rpc.mainnet.arc.io --private-key $PRIVATE_KEY --constructor-args 0x3600000000000000000000000000000000000000 <YOUR_FEE_RECIPIENT_ADDRESS> 200`
3. Update `src/lib/contract.ts` PREDARC_ADDRESS with returned address
4. Update Admin Panel Config tab with new address
5. Update `src/config.ts` to use `arc` chain instead of `arcTestnet`

## To Run

```bash
bun install
bun run dev
```
