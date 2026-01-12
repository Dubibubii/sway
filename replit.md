# SWAY - Prediction Markets App

## Overview

SWAY is a mobile-first prediction markets trading application designed to simplify access to prediction markets. Users can intuitively swipe to place bets on binary markets, integrating with the Kalshi API for market data and leveraging Privy for Web3 authentication on Solana. The application focuses on providing a curated, liquid trading experience while also offering a broader discovery mode. Key business goals include increasing user engagement in prediction markets and providing a seamless mobile trading platform.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, built with Vite.
- **Routing**: Wouter for lightweight client-side routing.
- **State Management**: TanStack React Query for server state, React Context for local settings.
- **UI Components**: shadcn/ui with Radix UI primitives.
- **Styling**: Tailwind CSS v4 with custom dark theme.
- **Animations**: Framer Motion for swipe card interactions.
- **UI/UX**: Tinder-like swipe interface for market interaction (right for "Yes", left for "No", down to skip). Strict filtering on the swipe tab ensures high liquidity and minimal spread (10-90% probability, $100k+ volume, <2 cent spread). A relaxed filtering mode is available in the "Discovery" tab.
- **Market Loading**: Batched loading of 50 markets at a time with infinite query and automatic loading when the card deck is low.

### Backend Architecture
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript with ESM modules.
- **API Design**: RESTful endpoints under `/api`.
- **Build System**: Custom esbuild script for production, Vite for development.

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM.
- **Schema**: Shared `shared/schema.ts` for user, trade, and analytics events.
- **Migrations**: Managed via `drizzle-kit push`.

### Authentication
- **Provider**: Privy for Web3 wallet and social authentication.
- **Server Verification**: Privy server SDK validates JWT tokens.

### Analytics System
- Tracks page views, market views, and bet placements.
- Provides a developer dashboard with key metrics (total users, active users, total bets, volume).

### Key Design Patterns
- **Shared Types**: `shared/` directory for client and server schema definitions.
- **Path Aliases**: `@/` for client source, `@shared/` for shared code.
- **Environment-based Configuration**: Privy keys and other sensitive data managed via environment variables.

### Solana Integration
- **Onboarding**: Mandatory two-phase onboarding (tutorial, gas deposit).
- **Gas Deposit**: Requires a minimum of 0.02 SOL for gas fees, which is fully withdrawable. Trades are guarded by a minimum SOL balance check.
- **SOL to USDC Conversion**: Automatic and manual conversion of SOL deposits to USDC, always preserving 0.02 SOL for gas.
- **Mobile Wallet Adapter (MWA)**: Integration for Solana Seeker devices to connect hardware wallets via Chrome.

## External Dependencies

### Third-Party Services
- **Privy**: Web3 authentication (`@privy-io/react-auth`, `@privy-io/server-auth`).
- **Kalshi API**: Prediction market data (public endpoints).
- **DFlow Pond API**: Solana-native Kalshi trading, including live prices via WebSocket, trade execution, and redemption flows. Requires `DFLOW_API_KEY`.
- **Jupiter Aggregator**: SOL to USDC swaps (public API endpoints).

### Database
- **PostgreSQL**: Primary data store.

### Key NPM Packages
- `framer-motion`: Gesture handling.
- `@tanstack/react-query`: Data fetching and caching.
- `drizzle-orm` / `drizzle-kit`: ORM and migrations.
- `zod`: Schema validation.
- `wouter`: Client-side routing.