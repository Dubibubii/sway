# SWAY - Prediction Markets Trading App

A mobile-first Solana prediction markets application that lets users swipe to bet on 500+ markets from DFlow/Kalshi across multiple categories. Built with React, TypeScript, and Solana blockchain integration.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Core Features](#core-features)
- [External Integrations](#external-integrations)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Authentication](#authentication)
- [Trading Flow](#trading-flow)
- [Fee Structure](#fee-structure)
- [Environment Variables](#environment-variables)
- [Development Setup](#development-setup)
- [Key Implementation Details](#key-implementation-details)

---

## Overview

SWAY is a Tinder-style prediction markets app where users can:
- **Swipe right** to bet YES on a market
- **Swipe left** to bet NO on a market
- **Swipe down** to skip a market

The app integrates with DFlow's Solana-native prediction markets infrastructure, which provides access to Kalshi market data. Users deposit SOL for gas fees and trade with USDC.

### Key Business Logic

1. **Embedded Wallet**: Users get a Privy-managed Solana wallet on signup
2. **Gas Deposit**: Minimum 0.02 SOL required for transaction fees
3. **Market Initialization**: Some markets require a ~0.002 SOL initialization fee (paid by user)
4. **Trading**: All trades executed in USDC via DFlow's Pond API
5. **Automatic Redemption**: Settled markets are automatically redeemed for winnings

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (React/Vite)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │  Home    │  │ Discovery│  │ Activity │  │     Profile      │ │
│  │ (Swipe)  │  │  (Browse)│  │(Positions)│  │(Wallet/Settings)│ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘ │
│       │             │             │                 │           │
│       └─────────────┴─────────────┴─────────────────┘           │
│                            │                                     │
│  ┌─────────────────────────┴─────────────────────────────────┐  │
│  │                    React Query + Hooks                     │  │
│  │  use-pond-trading | use-solana-balance | use-analytics    │  │
│  └─────────────────────────┬─────────────────────────────────┘  │
└────────────────────────────┼────────────────────────────────────┘
                             │ HTTP/WebSocket
┌────────────────────────────┼────────────────────────────────────┐
│                    SERVER (Express/Node.js)                      │
│  ┌─────────────────────────┴─────────────────────────────────┐  │
│  │                      routes.ts                             │  │
│  │  /api/markets | /api/trades | /api/users | /api/positions │  │
│  └───────┬───────────────┬───────────────┬───────────────────┘  │
│          │               │               │                       │
│  ┌───────┴───────┐ ┌─────┴─────┐ ┌───────┴───────┐              │
│  │   pond.ts     │ │pond-trading│ │  storage.ts  │              │
│  │ (Market Data) │ │  (Trades)  │ │  (Database)  │              │
│  └───────┬───────┘ └─────┬─────┘ └───────┬───────┘              │
└──────────┼───────────────┼───────────────┼──────────────────────┘
           │               │               │
    ┌──────┴──────┐  ┌─────┴─────┐  ┌──────┴──────┐
    │ DFlow Pond  │  │  Solana   │  │ PostgreSQL  │
    │  Metadata   │  │ Blockchain│  │  (Neon)     │
    │    API      │  │ (Helius)  │  │             │
    └─────────────┘  └───────────┘  └─────────────┘
```

---

## Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| React 18 | UI framework |
| TypeScript | Type safety |
| Vite | Build tool & dev server |
| Wouter | Lightweight client-side routing |
| TanStack React Query | Server state management |
| Framer Motion | Swipe gestures & animations |
| Tailwind CSS v4 | Styling |
| shadcn/ui + Radix UI | Component library |
| Recharts | Charts for price history |

### Backend
| Technology | Purpose |
|------------|---------|
| Node.js + Express | API server |
| TypeScript (ESM) | Type-safe backend |
| Drizzle ORM | Database queries |
| PostgreSQL (Neon) | Data persistence |
| WebSocket | Real-time price updates |

### Blockchain
| Technology | Purpose |
|------------|---------|
| Solana Web3.js | Blockchain interaction |
| Privy | Embedded wallet & auth |
| Helius RPC | Solana node provider |
| Jupiter | SOL to USDC swaps |

---

## Project Structure

```
├── client/
│   ├── src/
│   │   ├── components/          # React components
│   │   │   ├── ui/              # shadcn/ui components
│   │   │   ├── swipe-card.tsx   # Tinder-style card component
│   │   │   ├── ai-mascot.tsx    # AI chat assistant
│   │   │   ├── layout.tsx       # App shell with nav
│   │   │   ├── discovery-overlay.tsx  # Market detail modal
│   │   │   ├── gas-deposit-prompt.tsx # SOL deposit onboarding
│   │   │   ├── geo-restriction-check.tsx # Location verification
│   │   │   ├── onboarding-tour.tsx    # First-time user tutorial
│   │   │   ├── spread-explainer.tsx   # Bid/ask spread tooltip
│   │   │   └── withdraw-modal.tsx     # USDC/SOL withdrawal
│   │   ├── pages/               # Route pages
│   │   │   ├── home.tsx         # Main swipe interface
│   │   │   ├── discovery.tsx    # Browse/search markets
│   │   │   ├── activity.tsx     # Positions & history
│   │   │   ├── profile.tsx      # Wallet & settings
│   │   │   ├── developer.tsx    # Analytics dashboard (dev only)
│   │   │   ├── docs.tsx         # API documentation
│   │   │   ├── license.tsx      # License agreement
│   │   │   ├── copyright.tsx    # Copyright notice
│   │   │   ├── privacy.tsx      # Privacy policy
│   │   │   └── not-found.tsx    # 404 page
│   │   ├── hooks/               # Custom React hooks
│   │   │   ├── use-pond-trading.ts    # Trade execution logic
│   │   │   ├── use-solana-balance.ts  # Wallet balance fetching
│   │   │   ├── use-solana-transaction.ts # Tx signing
│   │   │   ├── use-analytics.ts       # Event tracking
│   │   │   ├── use-auto-swap.ts       # SOL→USDC automation
│   │   │   ├── use-swipe-history.ts   # Swipe tracking
│   │   │   ├── use-debounce.ts        # Input debouncing
│   │   │   ├── use-error-feedback.ts  # Error handling
│   │   │   ├── use-settings.ts        # User settings context
│   │   │   ├── use-privy-safe.ts      # Safe Privy hook wrapper
│   │   │   └── use-toast.ts           # Toast notifications
│   │   ├── utils/               # Utility functions
│   │   │   ├── dflowFees.ts     # Fee calculations
│   │   │   ├── pondTrade.ts     # Trade helpers
│   │   │   ├── jupiterSwap.ts   # SOL→USDC swap logic
│   │   │   └── withdraw.ts      # Withdrawal transaction building
│   │   ├── lib/
│   │   │   ├── api.ts           # API client functions
│   │   │   ├── queryClient.ts   # React Query config
│   │   │   ├── privy-provider.tsx # Privy auth context
│   │   │   └── dflow/
│   │   │       └── livePriceStore.ts # WebSocket price streaming
│   │   └── App.tsx              # Root component & routing
│   └── index.html
│
├── server/
│   ├── index.ts                 # Server entry point
│   ├── routes.ts                # API route definitions (~2200 lines)
│   ├── pond.ts                  # DFlow market data fetching & caching
│   ├── pond-trading.ts          # DFlow trade execution & quotes
│   ├── storage.ts               # Database operations (IStorage interface)
│   ├── kalshi.ts                # Kalshi API (legacy/backup)
│   ├── kalshi-trading.ts        # Kalshi trading (legacy)
│   ├── privy-wallet-auth.ts     # Auth verification middleware
│   ├── ws-proxy.ts              # WebSocket proxy for live prices
│   ├── github.ts                # GitHub integration
│   ├── static.ts                # Static file serving
│   └── vite.ts                  # Vite dev server integration
│
├── shared/
│   └── schema.ts                # Database schema, types, fee config
│
├── drizzle.config.ts            # Drizzle ORM configuration
├── vite.config.ts               # Vite build configuration
├── tailwind.config.ts           # Tailwind CSS configuration
├── tsconfig.json                # TypeScript configuration
└── package.json
```

---

## Core Features

### 1. Swipe Trading (Home Page - `/`)
- **Tinder-like card stack** with Framer Motion gestures
- **Real-time price updates** via WebSocket connection
- **Configurable wager amounts** (separate for YES/NO bets)
- **Visual feedback during swipe** (green overlay = YES, red = NO)
- **Smart filtering**: 10-90% probability, $100k+ volume, <2¢ spread
- **Category diversification**: Same-event markets spread apart
- **Market batching**: Loads 50 markets at a time with infinite scroll

### 2. Discovery (Browse Page - `/discovery`)
- **Full-text search** across 500+ markets
- **Category filters**: All, Crypto, AI, Politics, Sports, Economics, Tech, Weather, General
- **Short-term filter**: Daily crypto markets and markets ending within 72 hours
- **Market detail modals** with 24h price charts
- **Relaxed filtering** compared to swipe tab
- **Direct trading** from discovery cards

### 3. Activity (Positions Page - `/activity`)
- **Open positions** with live P&L calculation
- **Trade history** with win/loss/pending status
- **Position management**: Sell open positions or redeem settled markets
- **Leaderboard** showing top traders by realized profit
- **Auto-redemption fallback**: If sell fails due to no liquidity, tries redemption

### 4. Profile (Wallet Page - `/profile`)
- **SOL and USDC balance display** with USD conversion
- **Deposit instructions** showing wallet address with copy button
- **Manual SOL→USDC conversion** via Jupiter aggregator
- **Withdrawal modal** for sending funds to external wallet
- **Wager configuration** for YES and NO bet defaults
- **Settings persistence** across sessions

### 5. AI Assistant (AIMascot component)
- **Perplexity-powered** market insights with real-time web search
- **Context-aware analysis** specific to each market
- **Floating mascot UI** in top-left of swipe cards
- **Expandable chat box** with scrollable responses
- **Neutral, factual tone** - no betting recommendations

### 6. Onboarding Flow
- **Geo-restriction check**: Verifies user location is allowed
- **Tutorial walkthrough**: Explains swipe mechanics
- **Gas deposit prompt**: Ensures minimum 0.02 SOL for transactions

---

## External Integrations

### DFlow Pond API
Primary trading infrastructure for Solana-native Kalshi markets.

```
Base URLs:
- Metadata: https://pond.dflow.net
- Trading: https://pond-api.dflow.net
```

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/markets` | List all markets with current prices |
| `GET /api/v1/events` | Get events with nested markets |
| `GET /api/v1/markets/{id}` | Single market details |
| `POST /api/v1/quote` | Get trade quote with transaction |
| `POST /api/v1/swap` | Execute signed trade transaction |
| `GET /api/v1/positions/{wallet}` | Get user's open positions |
| `POST /api/v1/redeem` | Redeem settled position for payout |
| `GET /api/v1/order/{signature}` | Check order status |
| WebSocket `/api/v1/ws` | Real-time price stream |

**Authentication**: Requires `x-api-key` header with `DFLOW_API_KEY`.

### Privy
Embedded wallet and authentication provider.

- **Creates Solana wallet** on signup (no seed phrase for users)
- **Handles transaction signing** via embedded wallet SDK
- **Manages user sessions** with JWT tokens
- **Server-side verification** via `@privy-io/server-auth`
- **Supports external wallets** (Phantom, etc.) via wallet adapter

**Required env vars**: `VITE_PRIVY_APP_ID`, `PRIVY_APP_SECRET`

### Helius RPC
Solana node provider for blockchain queries.

- **Token balance fetching** (SOL, USDC via `getTokenAccountsByOwner`)
- **Transaction broadcasting** and confirmation
- **Account lookups** for position verification

**Required env var**: `HELIUS_API_KEY`

### Jupiter Aggregator
DEX aggregator for SOL to USDC conversions.

```
Base URL: https://quote-api.jup.ag/v6
```

| Endpoint | Purpose |
|----------|---------|
| `GET /quote` | Get best swap route |
| `POST /swap` | Build swap transaction |

- **No API key required** for public endpoints
- **Slippage protection**: 0.5% default
- **Preserves gas reserve**: Always keeps 0.02 SOL

### Perplexity AI
AI-powered market analysis and real-time web search.

- **Model**: `sonar` (search-enabled)
- **Endpoint**: `https://api.perplexity.ai/chat/completions`
- **Use case**: Contextual market insights with current news

**Required env var**: `PERPLEXITY_API_KEY`

### OpenAI (via Replit Integration)
Used for fallback AI features.

- **Endpoint**: Replit-provided base URL
- **Model**: GPT-4 variants

**Required env var**: `AI_INTEGRATIONS_OPENAI_API_KEY`

---

## Database Schema

Located in `shared/schema.ts`. Uses Drizzle ORM with PostgreSQL.

### users
```sql
id                    VARCHAR PRIMARY KEY
privy_id              TEXT UNIQUE NOT NULL
wallet_address        TEXT
yes_wager             INTEGER DEFAULT 5    -- Default YES bet amount in USDC
no_wager              INTEGER DEFAULT 5    -- Default NO bet amount in USDC
interests             TEXT[] DEFAULT '{}'  -- User interest categories
onboarding_completed  BOOLEAN DEFAULT FALSE
created_at            TIMESTAMP DEFAULT NOW()
```

### trades
```sql
id                VARCHAR PRIMARY KEY (UUID)
user_id           VARCHAR REFERENCES users(id)
market_id         TEXT NOT NULL         -- DFlow/Kalshi market ticker
market_title      TEXT NOT NULL         -- Human-readable title
market_category   TEXT                  -- Category for analytics
option_label      TEXT                  -- What user bet on (e.g., "Democratic Party")
direction         TEXT NOT NULL         -- 'yes' or 'no'
wager_amount      INTEGER               -- Amount in cents (e.g., 500 = $5.00)
price             DECIMAL(10,2)         -- Entry price (0.00-1.00)
shares            DECIMAL(10,2)         -- Number of contracts purchased
estimated_payout  DECIMAL(10,2)         -- Potential payout if win
entry_fee         DECIMAL(10,4)         -- Platform fee on entry
exit_fee          DECIMAL(10,4)         -- Platform fee on exit
is_closed         BOOLEAN DEFAULT FALSE
closed_at         TIMESTAMP
closure_reason    TEXT                  -- 'user_sold' or 'market_resolved'
pnl               DECIMAL(10,2)         -- Realized profit/loss
created_at        TIMESTAMP DEFAULT NOW()
```

### analytics_events
```sql
id            UUID PRIMARY KEY
user_id       VARCHAR REFERENCES users(id)
session_id    TEXT
event_type    TEXT NOT NULL    -- 'page_view', 'market_view', 'bet_placed'
page          TEXT             -- Route path
market_id     TEXT
market_title  TEXT
wager_amount  DECIMAL(10,2)
created_at    TIMESTAMP DEFAULT NOW()
```

---

## API Endpoints

### Markets

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/markets` | Paginated market list with strict filtering for swipe tab |
| `GET` | `/api/markets?mode=discovery` | Relaxed filtering for discovery tab |
| `GET` | `/api/markets/short-term` | Daily crypto & markets ending within 72 hours |
| `GET` | `/api/markets/search?q={query}` | Full-text search across all markets |
| `GET` | `/api/markets/:id/lookup` | Single market by ID |
| `GET` | `/api/events/:ticker/markets` | All markets for an event |
| `GET` | `/api/markets/:id/history` | 24h price history for charts |

### Trading (DFlow/Pond)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/pond/quote` | Get trade quote with unsigned transaction |
| `POST` | `/api/pond/swap` | Submit signed transaction for execution |
| `GET` | `/api/pond/positions/:wallet` | Get user's open positions |
| `POST` | `/api/pond/redeem` | Redeem settled position |
| `POST` | `/api/pond/sell` | Sell open position |
| `GET` | `/api/pond/order/:signature` | Check async order status |

### Trades (Database)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/trades` | Record new trade |
| `GET` | `/api/trades/:userId` | Get user's trade history |
| `PUT` | `/api/trades/:id/close` | Mark trade as closed |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/users` | Create or update user on auth |
| `PUT` | `/api/users/:id` | Update user settings |
| `GET` | `/api/users/:id` | Get user profile |

### Blockchain

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/solana/balance/:address` | Get SOL & USDC balances |
| `GET` | `/api/price/sol` | Current SOL/USD price from CoinGecko |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/analytics` | Track event (page_view, market_view, bet_placed) |
| `GET` | `/api/analytics/dashboard` | Dev dashboard metrics (wallet-gated) |

### AI

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ai/market-insight` | Get Perplexity-powered market analysis |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `/ws/prices` | Real-time market price updates (proxied from DFlow) |

---

## Authentication

Authentication uses Privy with JWT verification.

### Client-Side
```typescript
import { usePrivy } from '@privy-io/react-auth';

const { authenticated, user, getAccessToken, login, logout } = usePrivy();

// Get token for API calls
const token = await getAccessToken();

// Make authenticated request
fetch('/api/trades', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'x-privy-user-id': user.id
  }
});
```

### Server-Side
```typescript
import { PrivyClient } from '@privy-io/server-auth';

const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

// Verify JWT
const authHeader = req.headers.authorization;
const token = authHeader?.replace('Bearer ', '');
const verifiedClaims = await privy.verifyAuthToken(token);
```

### Required Headers
```
Authorization: Bearer <privy_access_token>
x-privy-user-id: <privy_user_id>
```

---

## Trading Flow

### Buy Position (Swipe/Click)

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  User   │    │ Client  │    │ Server  │    │  DFlow  │
│ swipes  │───▶│ detects │───▶│ /quote  │───▶│ builds  │
│  right  │    │   YES   │    │         │    │   tx    │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
                    │                             │
                    ▼                             │
              ┌─────────┐    ┌─────────┐         │
              │ Privy   │◀───│ returns │◀────────┘
              │ signs   │    │   tx    │
              │   tx    │    │         │
              └────┬────┘    └─────────┘
                   │
                   ▼
              ┌─────────┐    ┌─────────┐    ┌─────────┐
              │ Client  │───▶│ Server  │───▶│  DFlow  │
              │ submits │    │  /swap  │    │ executes│
              │         │    │         │    │         │
              └─────────┘    └─────────┘    └─────────┘
                                  │
                                  ▼
                            ┌─────────┐
                            │  Save   │
                            │  trade  │
                            │  to DB  │
                            └─────────┘
```

### Sell Position

1. User clicks "Sell" on open position
2. Client calls `POST /api/pond/sell` with position details
3. Server gets quote from DFlow for selling shares
4. Client signs returned transaction with Privy
5. Client submits signed transaction
6. If `route_not_found` error (no liquidity) → automatically try redemption
7. Update trade record with closure details

### Redemption (Settled Markets)

1. Market resolves (win/lose determined)
2. User clicks "Redeem" or automatic detection triggers
3. Client calls `POST /api/pond/redeem`
4. Server builds redemption transaction
5. Client signs and submits
6. Winning payout credited to USDC balance

---

## Fee Structure

SWAY uses DFlow-style fees at 50% of their VIP 0 (Frost tier) rates.

### Fee Formula
```
platformFee = scale × price × (1 - price) × contracts
```

Where:
- `scale` = 0.045 (50% of DFlow's 0.09 taker rate)
- `price` = fill probability (0.01 to 0.99)
- `contracts` = number of shares

### Fee Rates

| Type | DFlow VIP 0 Rate | SWAY Rate (50% off) |
|------|------------------|---------------------|
| Taker | 0.09 | 0.045 |
| Maker | 0.0225 | 0.01125 |

### Fee Recipient

All platform fees are collected by:
```
Wallet Address: 9DZEWwT47BKZnutbyJ4L5T8uEaVkwbQY8SeL3ehHHXGY
USDC Token Account (ATA): Csdoc9fHj4XBw6HcDq69SVx5dHQtubb9dCkXGGbus7Zy
```

### Fee Configuration (in `shared/schema.ts`)

```typescript
export const FEE_CONFIG = {
  FEE_RECIPIENT: 'Csdoc9fHj4XBw6HcDq69SVx5dHQtubb9dCkXGGbus7Zy',
  FEE_WALLET: '9DZEWwT47BKZnutbyJ4L5T8uEaVkwbQY8SeL3ehHHXGY',
  PLATFORM_TAKER_SCALE: 0.045,
  PLATFORM_MAKER_SCALE: 0.01125,
  PLATFORM_FEE_SCALE: 45,  // For DFlow API (thousandths)
};
```

---

## Environment Variables

### Required

```bash
# Database (PostgreSQL via Neon)
DATABASE_URL=postgresql://user:password@host/database?sslmode=require

# Privy Authentication
PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret
VITE_PRIVY_APP_ID=your_privy_app_id  # Client-side

# DFlow Trading API
DFLOW_API_KEY=your_dflow_api_key

# Solana RPC (Helius)
HELIUS_API_KEY=your_helius_api_key
```

### Optional

```bash
# AI Features
PERPLEXITY_API_KEY=your_perplexity_key

# OpenAI (via Replit integration)
AI_INTEGRATIONS_OPENAI_API_KEY=auto_populated_by_replit
AI_INTEGRATIONS_OPENAI_BASE_URL=auto_populated_by_replit

# Email (Resend)
RESEND_API_KEY=your_resend_key

# GitHub Integration
GITHUB_TOKEN=your_github_token
```

---

## Development Setup

### Prerequisites

- Node.js 20+
- PostgreSQL database (Neon recommended)
- Privy account with Solana enabled
- DFlow API access
- Helius RPC account

### Installation

```bash
# Clone repository
git clone <repo-url>
cd sway

# Install dependencies
npm install

# Push database schema
npm run db:push

# Start development server
npm run dev
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (port 5000) |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run db:push` | Push Drizzle schema to database |
| `npm run check` | TypeScript type checking |

### Path Aliases

- `@/` → `client/src/`
- `@shared/` → `shared/`
- `@assets/` → `attached_assets/`

---

## Key Implementation Details

### Market Caching (`server/pond.ts`)

Markets are cached server-side with background refresh:

- **Cache TTL**: 60 seconds
- **Batch size**: 100 markets per API call
- **Max pages**: 50 (up to 5000 markets)
- **Priority series**: Certain market types fetched first
- **Non-blocking**: Background refresh doesn't block requests

```typescript
// Cache refresh flow
1. Request comes in → return cached data immediately
2. If cache TTL expired → trigger background refresh
3. Background fetches all markets with pagination
4. Cache updated → next request gets fresh data
```

### Real-Time Prices (`server/ws-proxy.ts`)

WebSocket proxy for DFlow price stream:

```typescript
// Server proxies DFlow WebSocket
client ←→ server ←→ DFlow WebSocket

// Client subscribes to market prices
socket.send(JSON.stringify({ 
  action: 'subscribe', 
  markets: ['KXBTCD-26JAN...'] 
}));

// Receives price updates
{ ticker: 'KXBTCD-26JAN...', yesBid: 0.55, yesAsk: 0.56, ... }
```

### Position Detection

Open positions are detected via multiple sources:

1. **DFlow API**: `GET /positions/{wallet}` returns on-chain positions
2. **Database**: Match against `trades` table for metadata
3. **Live calculation**: P&L computed from current prices

### Settled Market Detection

Markets are considered settled when:

- `status === 'finalized'` or `status === 'settled'`
- `endDate` has passed AND status indicates resolution
- Position has `redemptionStatus === 'pending'`

### Error Handling Patterns

| Error | Cause | Solution |
|-------|-------|----------|
| `route_not_found` | No liquidity for trade | Fallback to redemption |
| `403 Forbidden` | RPC rate limit | Retry with exponential backoff |
| `blockhash_expired` | Network congestion | Auto-retry with fresh blockhash |
| Insufficient SOL | Not enough gas | Prompt user to deposit |
| `market_not_initialized` | First trade on market | User pays ~0.002 SOL init fee |

### Mobile Optimization

- **Touch gestures**: Optimized for mobile swipe detection
- **Responsive breakpoints**: `sm:`, `md:`, `lg:` Tailwind classes
- **Safe area insets**: Respects device notches/cutouts
- **100dvh**: Uses dynamic viewport height for proper mobile display
- **Reduced motion**: Respects user preference for reduced animations

---

## Legal Pages

Three legal document pages are available:

- `/license` - License agreement for app usage
- `/copyright` - Copyright notice and IP protection
- `/privacy` - Privacy policy for data collection

---

## Analytics Tracking

Events tracked via `analytics_events` table:

| Event Type | Data | Trigger |
|------------|------|---------|
| `page_view` | page, sessionId | Route navigation |
| `market_view` | marketId, marketTitle | Card displayed |
| `bet_placed` | marketId, direction, wagerAmount | Trade executed |

Developer dashboard at `/developer` (wallet-gated to dev address in `shared/schema.ts`).

---

## Contributing Guidelines

When modifying this codebase:

1. **Schema changes**: Update `shared/schema.ts` first, then run `npm run db:push`
2. **API changes**: Update both `server/routes.ts` and `client/src/lib/api.ts`
3. **New features**: Add appropriate analytics tracking
4. **UI changes**: Maintain mobile-first responsive design
5. **Trading logic**: Test thoroughly on devnet/testnet first
6. **New hooks**: Place in `client/src/hooks/` with `use-` prefix
7. **New components**: Add `data-testid` attributes for testing

---

## License

MIT License - See `/license` page for full terms.

---

*Last updated: January 2026*
