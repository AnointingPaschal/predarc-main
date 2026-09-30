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
- `src/lib/adminConfig.ts` - Site config store (in-memory, loaded from Cloudflare KV), admin session, CSS vars
- `functions/` - Cloudflare Pages Functions: `/api/config` (public) and `/api/admin/config` (admin signature required)
- `src/config.ts` - wagmi config

## Admin Panel

Access at `/admin`. The Admin link is only rendered when the connected wallet equals the admin wallet; other wallets get a 404 page. The admin signs a free 1-hour session message, and the server verifies it on every request. Features:
- Markets tab: resolve, cancel, feature markets
- Create tab: create binary/multiple/scalar markets with Chainlink feed support
- Fees tab: update fee bps, withdraw accrued fees
- Branding tab: logo upload, colors, custom CSS, footer, social links
- Config tab: contract address, RPC URL, chain ID, USDC address, admin wallet, fee recipient, Chainlink feeds

## Cloudflare Deploy

Vite app + Pages Functions. Build with `bun run build`, output `dist/`. Setup in Cloudflare Pages:

1. Create a KV namespace and bind it to the project as **`PREDARC_KV`** (Settings → Bindings, both Production and Preview).
2. Add env var **`ADMIN_WALLET`** = the single admin wallet address (Settings → Variables and Secrets). This is the only source of truth for who is admin.
3. Redeploy. All admin settings (contract addresses, feeds, branding, OpenRouter key, AI settings) are saved to KV and shared by all visitors. Nothing is stored in browser localStorage. Theme preference uses a cookie.

Local dev with the API: `bun run build && npx wrangler pages dev dist --kv PREDARC_KV --binding ADMIN_WALLET=0x...`

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

## Networks and contracts

- The site is on ONE network at a time, chosen in Admin → Config → "Site network" (there is no switch in the header). Each network has its own settings (contract, RPC URL, USDC, fee recipient, min liquidity, Chainlink feeds).
- `createMarket`, resolve, cancel and fee withdrawal are `onlyOwner`: the wallet that deployed the contract is the only one that can call them. Use Config → "Check contract" to see the onchain owner, minimum liquidity and fee.
- Remix build of the contract: `docs/remix/PredarcMarketRemix.sol` (needs viaIR, see `docs/remix/compiler_config.json`).


## Contract v2 (contracts/PredarcMarket.sol)
- Free market creation: minimum liquidity defaults to 0 (`setMinLiquidity(0)` allowed). A market with 0 liquidity
  is untradable until the owner calls `addLiquidity` (Fund box on the market page).
- Market editing: `updateMarketInfo` (question/category/image) and `updateMarketTimes` (open markets only).
- Onchain comments: `postComment`, `deleteComment`, `reactToComment` (events only). `contractVersion()` returns 2;
  the frontend uses it to switch between onchain comments/editing and the legacy Cloudflare comments.
- Images: admin uploads go to `/api/image` (KV) and the short URL is stored onchain.
- Regenerate `docs/remix/PredarcMarketRemix.sol` and the inlined `PREDARC_ABI` in `src/lib/contract.ts` after any contract change.

## Bitcoin Up/Down rounds (`contracts/PredarcBtcRounds.sol`)
- Separate parimutuel contract: 5-minute (immutable `duration`) rounds, no liquidity needed, auto-settling, 0-fee refunds on ties / one-sided / missed price.
- Deploy via `docs/remix/PredarcBtcRoundsRemix.sol` (constructor: USDC, feeRecipient, 300, feeBps e.g. 200). No viaIR needed.
- Add the address per network in Admin → BTC Rounds. Enable/disable, title, home card and all on-chain settings (fee, limits, window, price feed, keepers, fee withdrawal) are editable there.
- Price source: set a Chainlink BTC/USD feed on the contract (permissionless), or keeper mode: secret `KEEPER_PRIVATE_KEY` (dedicated wallet with a little USDC for gas), authorize it in the admin tab. `POST /api/btc-keeper?network=...` records the boundary price (pinged by visitors' browsers and optionally an external cron each minute).

## AI cover images (admin, on demand only)
Nothing is generated automatically. In Create / Edit market and on AI drafts, "Generate with AI" calls admin-only `POST /api/market-image`: the text model writes a picture brief from the question/options (optionally researching online), the image model (`openrouterImageModel`, default `google/gemini-2.5-flash-image`) paints it, the browser shrinks it to a ~720px JPEG and uploads it via `/api/image`, and the short link is stored on-chain as the market's `imageUrl`. "Regenerate" repeats it; an optional direction hint can steer it.

## Soccer betting (Sports)
- Admin → **Sports**: pick leagues (any ESPN soccer code works), days ahead, betting lines and liquidity, load fixtures, then create. Each line is its own market on the existing `PredarcMarket` contract (category `Soccer`, hidden from the home grid, shown under `/sports`). 1X2 = 3-outcome multiple choice; double chance (1X/12/X2), Over/Under 0.5–5.5, GG/NG, odd/even, clean sheets and win-to-nil are Yes/No or two-way binary markets. Definitions and settlement rules: `src/lib/sportsCore.ts`.
- Trading closes at kick-off; markets become resolvable 2h later. Fixtures and results come from ESPN's public scoreboard (`functions/_sports.ts`); no API key. Generated matches are kept in KV `sports:<network>`.
- Settlement uses the 90-minute score. Extra time/penalties/postponed matches are flagged for manual settlement in the admin tab. Cancelled/abandoned matches cancel their markets (refunds).
- Auto-settle: `POST /api/sports-keeper?network=…` resolves everything finished. The contract only lets its OWNER resolve, so set the secret `SPORTS_RESOLVER_PRIVATE_KEY` to the owner wallet's key (fund it with a little USDC for gas). Visitors' browsers ping it while on /sports; add a cron ping every 5 min for reliability. Without the key, use Admin → Sports → "Settle now" (signs with the admin wallet).
- Toggles in Admin → Sports: `sportsEnabled`, `sportsAutoSettle`.

### Sports contract (PredarcSports)
- Sports live in their own contract, `contracts/PredarcSports.sol` (Remix file `docs/remix/PredarcSportsRemix.sol`). `PredarcMarket` is untouched (its v3 `createMarketWithOdds` exists but is optional/unused).
- Address is `sportsAddress` in Admin → Config (per network). `src/lib/sportsChain.ts` has the ABI, `useSportsLines(ids)` and the `lineToMarket` adapter.
- `createMatch` makes every line of a match in one tx at real odds (pools ∝ 1/p, owner keeps leftover shares). Resolvers (`setResolver`) can resolve/cancel; keeper uses `SPORTS_RESOLVER_PRIVATE_KEY` (a resolver wallet, not the owner key) via `resolveMany`/`cancelMany`.
- Simulated in scratchpad `sim8.mjs` (solvency fuzz exact).

### Auto covers for saved markets
- While the admin (signed in) has the home page open, `useAutoCovers` generates a cover for each open market without one (same brief-first generator as the editor, one at a time, max 25 per visit, stops after 3 failures). Covers are stored off-chain: `saveMarketMeta` → KV `meta:<net>:<id>` plus a public index `imgindex:<net>` (`GET /api/market-meta?network=&images=1`) that the home page merges with the on-chain `imageUrl`. Toggle: Admin → AI → "Auto-generate covers".
