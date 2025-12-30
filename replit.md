# SWAY - Prediction Markets App

## Overview

SWAY is a mobile-first prediction markets trading application that allows users to swipe on markets (similar to Tinder) to place bets. The app integrates with the Kalshi API for market data and uses Privy for Web3 wallet authentication on Solana. Users can swipe right to bet "Yes", left to bet "No", or down to skip markets.

### Market Organization
- **Trending First**: Top 50 markets sorted by volume (highest to lowest)
- **Category Rotation**: After trending, cycles through categories (Politics, Sports, Economics, Tech, Weather, General) one market at a time
- **Binary Markets Only**: Filters out non-binary markets with extreme probabilities (≥97% or ≤3%)

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
  - Provides market metadata, prices, and volume data
  - No API key required for public endpoints

- **DFlow Pond API**: Solana-native Kalshi trading
  - Quote API: `https://dev-quote-api.dflow.net` (Dev) / `https://quote-api.dflow.net` (Prod)
  - Metadata API: `https://dev-prediction-markets-api.dflow.net` (Dev) / `https://prediction-markets-api.dflow.net` (Prod)
  - Currently using DEV endpoints for testing with real capital
  - Enables trading Kalshi markets on Solana using USDC
  - Flow: Get quote → Sign Solana transaction → Submit to network
  - **Redemption Flow**: For settled markets, uses `/api/v1/market/by-mint/{mint}` to check if market is "determined"/"finalized" and redemption is "open", then redeems winning tokens for $1 each
  - **Async Trade Polling**: Uses `/order-status?signature=` to get actual fill amounts for async trades
  - Required env var: `DFLOW_API_KEY` (for production access)
  - **Platform Fees**: Channel-based fees collected via DFlow's platformFeeBps parameter
    - Swipe tab: $0.05 flat fee (effective 1000 bps on $0.50 min, 200 bps on $2.50 avg)
    - Discovery tab: 0.75% (75 bps)
    - Positions tab: 0.25% (25 bps)
    - Fee account: 9DZEWwT47BKZnutbyJ4L5T8uEaVkwbQY8SeL3ehHHXGY

- **Jupiter Aggregator**: SOL to USDC swaps
  - Quote API: `https://quote-api.jup.ag/v6/quote`
  - Swap API: `https://quote-api.jup.ag/v6/swap`
  - Used for auto-converting SOL deposits to USDC
  - Dynamic Gas Reserves: 0.004 SOL for balances < 0.1 SOL, 0.02 SOL for larger balances
  - Uses `restrictIntermediateTokens: true` and `dynamicSlippage` for reliable swaps
  - No API key required

### SOL → USDC Conversion
- **Auto-Swap**: Triggers on first deposit or top-ups (30-second cooldown)
- **Manual Button**: "Convert SOL → USDC" button on profile page for manual conversion
- **Privy SDK Limitation**: Embedded wallet may not appear in `useWallets()` when user logs in with external wallet - manual button serves as fallback
- **Gas Reserves**: 0.004 SOL kept for small balances, 0.02 SOL for larger balances

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