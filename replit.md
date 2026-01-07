# SWAY - Prediction Markets App

## Overview

SWAY is a mobile-first prediction markets trading application that allows users to swipe on markets (similar to Tinder) to place bets. The app integrates with the Kalshi API for market data and uses Privy for Web3 wallet authentication on Solana. Users can swipe right to bet "Yes", left to bet "No", or down to skip markets.

### Market Organization
- **Trending First**: Top 50 markets sorted by volume (highest to lowest)
- **Category Rotation**: After trending, cycles through categories (Politics, Sports, Economics, Tech, Weather, General) one market at a time
- **Binary Markets Only**: Filters out non-binary markets
- **Event Diversification**: Markets from the same event are spaced at least 5 positions apart to prevent repetitive content

### Swipe Tab Filtering (Strict Mode)
To ensure users can trade without errors, the swipe tab applies strict filtering:
- **Probability Range**: Only markets with 10-90% probability (balanced odds = thicker orderbooks)
- **Initialized Only**: Must be initialized on DFlow (tokens exist on-chain)
- **Minimum Volume**: Requires $10,000+ total volume for liquidity
- **Result**: Users only see markets that can actually be traded without "route not found" errors

### Discovery Tab Filtering (Relaxed Mode)
The discovery tab allows more freedom:
- **Probability Range**: 1-99% probability (includes extreme odds)
- **All Markets**: Shows both initialized and uninitialized markets (with warnings)
- **No Volume Filter**: All markets visible regardless of volume

### Batched Market Loading
- **Pagination**: Backend supports `limit`, `offset`, and `excludeIds` parameters on `/api/markets`
- **Batch Size**: Frontend loads 50 markets at a time using infinite query
- **Auto-Loading**: When card deck drops below 10 cards, next batch loads automatically with loading indicator
- **Cache Management**: Response includes `cacheTimestamp`, `total`, and `hasMore` metadata
- **Session Tracking**: Swiped market IDs persisted in localStorage, excluded from future batches
- **Cache Reset**: Swipe history clears when server cache refreshes (detected via cacheTimestamp change)

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, built with Vite
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state, React Context for local settings
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS v4 with custom dark theme and CSS variables
- **Animations**: Framer Motion for swipe card interactions and gestures

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful endpoints under `/api` prefix
- **Build System**: Custom esbuild script for production bundling, Vite for development

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains user, trade, and analytics_events tables
- **Migrations**: Managed via `drizzle-kit push` command

### Analytics System
- **Tracking Hook**: `client/src/hooks/use-analytics.ts` provides usePageView, useMarketView, useBetPlaced
- **Events Table**: analytics_events tracks page views, market views, and bet placements
- **Summary Endpoint**: GET /api/analytics/summary (wallet-gated to DEV_WALLET)
- **Developer Dashboard**: /developer route - only accessible to wallet 9DZEWwT47BKZnutbyJ4L5T8uEaVkwbQY8SeL3ehHHXGY
- **Metrics Tracked**: Total users, active users (24h/7d), total bets, volume, avg bet size, page usage, popular markets

### Authentication
- **Provider**: Privy for Web3 wallet and social authentication
- **Server Verification**: Privy server SDK validates JWT tokens
- **Fallback**: App can run without Privy if environment variables are not set

### Key Design Patterns
- **Shared Types**: The `shared/` directory contains schema definitions used by both client and server
- **Path Aliases**: `@/` maps to client source, `@shared/` maps to shared code
- **Environment-based Configuration**: Privy keys controlled via environment variables; Pond API is public

## External Dependencies

### Third-Party Services
- **Privy**: Web3 authentication (wallet, email, Google login)
  - Client: `@privy-io/react-auth`
  - Server: `@privy-io/server-auth`
  - Required env vars: `VITE_PRIVY_APP_ID`, `PRIVY_APP_SECRET`

- **Kalshi API**: Prediction markets data
  - Base URL: `https://api.elections.kalshi.com/trade-api/v2`
  - Uses `/events?with_nested_markets=true` endpoint for cleaner single-market data
  - Filters out multi-leg parlay markets (MVE events with concatenated titles)
  - Provides market metadata, prices, and volume data
  - No API key required for public endpoints

- **DFlow Pond API**: Solana-native Kalshi trading
  - Quote API: `https://b.quote-api.dflow.net` (Production)
  - Metadata API: `https://b.prediction-markets-api.dflow.net` (Production)
  - Requires `DFLOW_API_KEY` secret with `x-api-key` header
  - Falls back to dev endpoints if no API key is set
  - Enables trading Kalshi markets on Solana using USDC
  - Flow: Get quote → Sign Solana transaction → Submit to network
  - **Markets Endpoint**: `/api/v1/markets` includes live prices (yesAsk, yesBid, noAsk, noBid) - use this for price data
  - **Events Endpoint**: `/api/v1/events?withNestedMarkets=true` provides metadata but NO prices - don't use for price display
  - **Performance Optimization**: All markets from DFlow /markets API are assumed tradeable to avoid slow events pagination (30+ second blocking call removed). Occasional untradeable markets fail gracefully at trade time.
  - **Redemption Flow**: For settled markets, uses `/api/v1/market/by-mint/{mint}` to check if market is "determined"/"finalized" and redemption is "open", then redeems winning tokens for $1 each
  - **Async Trade Polling**: Uses `/order-status?signature=` to get actual fill amounts for async trades
  - **Async Sell Handling**: For async sells, expectedUSDC returns 0 from API. Success toast shows "X Shares Sold - Processing..." instead of showing incorrect estimates. User should check their balance after a few seconds.
  - Required env var: `DFLOW_API_KEY` (for production access)
  - **Platform Fees**: Channel-based fees collected via DFlow's platformFeeBps parameter
    - Swipe tab: $0.05 flat fee (effective 1000 bps on $0.50 min, 200 bps on $2.50 avg)
    - Discovery tab: 0.75% (75 bps)
    - Positions tab: 0.25% (25 bps)
    - Fee account: 9DZEWwT47BKZnutbyJ4L5T8uEaVkwbQY8SeL3ehHHXGY
  - **WebSocket API (Live Prices)**: Server-side proxy streams real-time bid/ask prices
    - DFlow WS Endpoint: `wss://b.prediction-markets-api.dflow.net/api/v1/ws` (requires API key header)
    - Client WS Endpoint: `/ws/prices` (connects to our server proxy)
    - Server files: `server/ws-proxy.ts` (connects to DFlow, broadcasts to clients)
    - Client files: `client/src/lib/dflow/livePriceStore.ts` (hooks for live price subscriptions)
    - Features: Live bid/ask updates, spread calculation, price caching
    - Message format: `{ type: 'price', ticker, yesBid, yesAsk, noBid, noAsk, timestamp }`
    - Hooks: `useLivePrice(ticker)`, `useLivePrices(tickers[])`, `useConnectionStatus()`
    - Helper: `getSpreadPercent(yesBid, yesAsk)` calculates spread as percentage
  - **Trading Fee Formula (CONFIRMED by DFlow team 2026-01-07)**: `fee = scale * p * (1-p) * contracts`
    - scale = 0.09 for Frost tier taker (most users), 0.0225 for maker
    - p = fill price (probability 0-1)
    - contracts = number of contracts traded
    - Maximum fee is at 50¢: 0.09 × 0.5 × 0.5 × 1 = **$0.0225 per contract**
    - Example: 3 contracts at 50¢ = $0.0675 total fee
    - Fee tiers based on 30-day volume: Frost (<$50M), Glacier ($50-150M), Steel ($150-300M), Obsidian (>$300M)
    - Fee utility: `client/src/utils/dflowFees.ts` calculates accurate fees and net shares
    - Note: DFlow deducts fees from wager, reducing effective shares received
    - **Important**: Fees are NOT the reason trades feel expensive - the bid-ask spread has much bigger impact
  - **SpreadExplainerSheet**: Educational modal (`client/src/components/spread-explainer.tsx`) explaining bid-ask spread concept
    - Uses example 60¢/52¢ buy/sell prices to illustrate the spread concept
    - Explains why estimated values may differ from cost basis
    - Triggered from position cards help icon and discovery buy confirmation
  - **Whole Shares Constraint**:
    - Kalshi only accepts whole contracts (integers), no fractional shares
    - `calculateTradeFeesForBuy` floors shares to whole numbers before returning
    - Actual spend is recalculated: `actualSpend = platformFee + (wholeShares * price) + dflowFee`
    - Users keep unspent USDC (not charged for fractional portion)
    - If wager too small for 1 whole share, trade is blocked with helpful error message
    - Example: $1 wager at 40¢ → floor(2.5) = 2 shares, actual spend = ~$0.87
  - **Bid-Ask Spread Impact**: 
    - Markets have bid/ask prices: yesAsk (price to BUY), yesBid (price to SELL)
    - UI displays mid-price: `(yesAsk + yesBid) / 2`
    - Trading executes at: ASK price for buys, BID price for sells
    - Wide spreads cause round-trip losses: `(ask - bid) / ask`
    - Example: ask=70¢, bid=30¢ → 57% loss just from spread, before fees
    - Market interface now includes yesAsk, yesBid, noAsk, noBid fields
    - Fee calculations now use execution price (ask) not mid-price

- **Jupiter Aggregator**: SOL to USDC swaps
  - Quote API: `https://quote-api.jup.ag/v6/quote`
  - Swap API: `https://quote-api.jup.ag/v6/swap`
  - Used for auto-converting SOL deposits to USDC
  - Gas Reserves: Fixed 0.02 SOL always preserved for gas fees
  - Uses `restrictIntermediateTokens: true` and `dynamicSlippage` for reliable swaps
  - No API key required

### Onboarding Flow
- **Global Enforcement**: Onboarding handled in `App.tsx` via `OnboardingGate` component - shows on ALL pages until complete
- **No Skip**: Tutorial cannot be skipped - users must complete all steps
- **Two Phases**: 1) Tutorial slides (6 steps explaining swipe gestures), 2) Gas deposit requirement
- **User Session Tracking**: Uses `privyId` to detect user changes and reset onboarding state for new users

### Gas Deposit Requirement
- **Minimum**: 0.02 SOL required for gas fees (fully withdrawable at any time)
- **Component**: `GasDepositPrompt` shows mascot, wallet address, copy button, current balance, and "Deposit" button
- **Auto-Advance**: When user deposits enough SOL (≥0.02), screen auto-advances to success view
- **Settings**: `gasDepositComplete` boolean tracks whether user has completed gas deposit
- **Trade Guard**: Before any trade, checks that SOL balance >= 0.003 SOL (minimum for transaction fees)
- **User-Friendly**: If gas is insufficient, shows "Need More SOL for Gas" error directing to profile page

### SOL → USDC Conversion
- **Auto-Swap**: Triggers on first deposit or top-ups (30-second cooldown)
- **Manual Button**: "Convert SOL → USDC" button on profile page for manual conversion
- **Privy SDK Limitation**: Embedded wallet may not appear in `useWallets()` when user logs in with external wallet - manual button serves as fallback
- **Gas Reserves**: Always keeps 0.02 SOL for gas fees (matches minimum deposit requirement)
- **Protection**: Initial 0.02 SOL deposit is never converted to USDC - only amounts above 0.02 SOL are swapped

### Mobile Wallet Adapter (MWA) Integration
- **Purpose**: Enables Solana Seeker device users to connect Seed Vault hardware wallet via Chrome browser
- **Package**: `@solana-mobile/wallet-standard-mobile` with `registerMwa()` function
- **Privy Docs**: https://docs.privy.io/recipes/solana/adding-solana-mwa
- **Solana Mobile Docs**: https://docs.solanamobile.com/developers/mobile-wallet-adapter-web
- **Environment Detection**: `client/src/lib/mwa-env.ts` detects Android, Seeker devices, and WebViews
  - Seeker detection regex: `/Solana\s*Seeker|Seeker|SMS1|SolanaMobile/i`
  - MWA only registers when `isSupported` is true (Android Chrome or Seeker device)
  - Seeker browser is NOT a WebView - it's a full Chrome-based browser
- **Registration**: Called at app startup in `client/src/main.tsx` before React renders
- **Wallet List**: Privy configured with `['detected_solana_wallets', 'solflare', 'phantom', 'backpack']`
- **Limitation**: Desktop Chrome would need `remoteHostAuthority` (reflector server) which Solana Mobile hasn't publicly released

### Database
- **PostgreSQL**: Primary data store
  - Required env var: `DATABASE_URL`
  - ORM: Drizzle with postgres-js driver

### Key NPM Packages
- `framer-motion`: Gesture handling for swipe cards
- `@tanstack/react-query`: Data fetching and caching
- `drizzle-orm` / `drizzle-kit`: Database ORM and migrations
- `zod`: Schema validation
- `wouter`: Client-side routing