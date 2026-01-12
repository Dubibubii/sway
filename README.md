# SWAY - Prediction Markets Trading App

A mobile-first prediction markets trading application with a Tinder-style swipe interface. Users can swipe right to bet "Yes", left to bet "No", or down to skip markets. The app integrates with DFlow/Pond API for on-chain Solana trading and features AI-powered market insights with real-time web search.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Styling**: Tailwind CSS v4 + shadcn/ui + Radix UI
- **Animations**: Framer Motion (swipe gestures)
- **State Management**: TanStack React Query + React Context
- **Routing**: Wouter (client-side)
- **Authentication**: Privy (Web3 wallet + social auth)
- **Blockchain**: Solana (via DFlow/Pond API)

## Project Structure

```
├── client/                     # Frontend React application
│   ├── src/
│   │   ├── components/         # React components
│   │   │   ├── ui/             # shadcn/ui primitives
│   │   │   ├── swipe-card.tsx  # Main swipe card component
│   │   │   ├── ai-mascot.tsx   # AI insights mascot dropdown
│   │   │   ├── discovery-market-card.tsx
│   │   │   ├── position-card.tsx
│   │   │   ├── purchase-modal.tsx
│   │   │   ├── spread-explainer.tsx
│   │   │   └── ...
│   │   ├── pages/              # Route pages
│   │   │   ├── home.tsx        # Swipe tab (main trading interface)
│   │   │   ├── discovery.tsx   # Discovery/browse markets
│   │   │   ├── positions.tsx   # User's open positions
│   │   │   ├── profile.tsx     # User profile & wallet
│   │   │   └── developer.tsx   # Analytics dashboard (dev only)
│   │   ├── hooks/              # Custom React hooks
│   │   │   ├── use-pond-trading.ts    # DFlow trading logic
│   │   │   ├── use-markets.ts         # Market data fetching
│   │   │   ├── use-analytics.ts       # Event tracking
│   │   │   └── ...
│   │   ├── lib/                # Utility libraries
│   │   │   ├── dflow/          # DFlow API integration
│   │   │   │   ├── livePriceStore.ts  # WebSocket price streaming
│   │   │   │   └── ...
│   │   │   ├── privy-provider.tsx     # Privy auth context
│   │   │   └── queryClient.ts
│   │   ├── utils/              # Utility functions
│   │   │   ├── dflowFees.ts    # Fee calculations
│   │   │   └── ...
│   │   ├── assets/             # Static assets (mascot.png, etc.)
│   │   ├── App.tsx             # Main app with routing
│   │   └── main.tsx            # Entry point
│   └── index.html
│
├── server/                     # Backend Express application
│   ├── routes.ts               # All API endpoints
│   ├── storage.ts              # Database interface (IStorage)
│   ├── ws-proxy.ts             # WebSocket proxy for live prices
│   ├── index.ts                # Server entry point
│   └── vite.ts                 # Vite dev server integration
│
├── shared/                     # Shared code between client/server
│   └── schema.ts               # Drizzle schema + Zod types
│
├── drizzle.config.ts           # Drizzle ORM configuration
├── vite.config.ts              # Vite build configuration
├── tailwind.config.ts          # Tailwind CSS configuration
├── tsconfig.json               # TypeScript configuration
└── package.json
```

## Database Schema (`shared/schema.ts`)

### Tables

- **users**: User accounts linked to Privy auth
  - `id`, `privyId`, `walletAddress`, `email`, `createdAt`

- **trades**: Trade history and open positions
  - `id`, `userId`, `marketId`, `marketTitle`, `marketCategory`
  - `optionLabel`, `direction` (YES/NO), `wagerAmount`, `price`, `shares`
  - `estimatedPayout`, `entryFee`, `exitFee`, `isClosed`, `closedAt`, `pnl`

- **analytics_events**: Event tracking for analytics
  - `id`, `eventType`, `userId`, `marketId`, `data`, `createdAt`

## API Endpoints (`server/routes.ts`)

### Markets
- `GET /api/markets` - Fetch markets with pagination
  - Query params: `limit`, `offset`, `excludeIds`, `mode` (swipe/discovery)
  - Returns: Sorted markets with DFlow pricing data

### Positions
- `GET /api/positions` - Get user's open positions
- `POST /api/positions` - Create new position after trade
- `PATCH /api/positions/:id` - Update position (close, update PnL)

### Trading
- `POST /api/dflow/quote` - Get trade quote from DFlow
- `POST /api/dflow/submit` - Submit signed transaction
- `GET /api/dflow/order-status` - Check async order status

### Wallet
- `GET /api/solana/balance/:address` - Get SOL balance
- `GET /api/usdc/balance/:address` - Get USDC balance

### AI Insights
- `POST /api/ai/market-insight` - Get AI-powered market context
  - Uses Perplexity API for real-time web search
  - Request: `{ marketTitle, category, yesPrice }`
  - Response: `{ insight }` (cleaned text, no citations)

### Analytics
- `POST /api/analytics/events` - Track analytics event
- `GET /api/analytics/summary` - Get analytics dashboard (dev wallet only)

### Authentication
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout user

## External Services

### DFlow/Pond API (Solana Trading)
- **Quote API**: `https://b.quote-api.dflow.net`
- **Metadata API**: `https://b.prediction-markets-api.dflow.net`
- **WebSocket**: `wss://b.prediction-markets-api.dflow.net/api/v1/ws`
- Requires `DFLOW_API_KEY` environment variable

### Privy (Authentication)
- Client: `@privy-io/react-auth`
- Server: `@privy-io/server-auth`
- Requires: `VITE_PRIVY_APP_ID`, `PRIVY_APP_SECRET`

### Perplexity (AI Insights)
- API: `https://api.perplexity.ai/chat/completions`
- Model: `sonar` (online search-enabled)
- Requires: `PERPLEXITY_API_KEY`

### Jupiter (SOL→USDC Swaps)
- Quote API: `https://quote-api.jup.ag/v6/quote`
- Swap API: `https://quote-api.jup.ag/v6/swap`
- No API key required

## Key Components

### SwipeCard (`client/src/components/swipe-card.tsx`)
Main trading interface using Framer Motion gestures:
- Swipe right → Buy YES
- Swipe left → Buy NO  
- Swipe down → Skip
- Includes AI mascot button, live prices, category badges

### AIMascot (`client/src/components/ai-mascot.tsx`)
AI-powered market insights:
- Positioned in top-left of swipe cards
- Drops down with real-time web search results
- Uses Perplexity API for current news/context
- Neutral, factual tone (no betting recommendations)

### PurchaseModal (`client/src/components/purchase-modal.tsx`)
Trade confirmation modal:
- Shows shares, fees, estimated payout
- Whole shares only (Kalshi constraint)
- Platform fees + DFlow trading fees
- Instant close with background processing

### LivePriceStore (`client/src/lib/dflow/livePriceStore.ts`)
WebSocket-based real-time price streaming:
- Server proxies DFlow WebSocket
- Client hooks: `useLivePrice(ticker)`, `useLivePrices(tickers[])`
- Caches prices, shows bid/ask spreads

## Trading Flow

1. **Get Quote**: POST `/api/dflow/quote` with market ticker, side, amount
2. **Build Transaction**: Server creates Solana transaction
3. **Sign Transaction**: Client signs with Privy embedded wallet
4. **Submit**: POST `/api/dflow/submit` with signed transaction
5. **Poll Status**: GET `/api/dflow/order-status?signature=...`
6. **Record Position**: POST `/api/positions` on success

## Fee Structure

### Platform Fees (collected via `platformFeeBps`)
- Swipe tab: $0.05 flat fee
- Discovery tab: 0.75% (75 bps)
- Positions tab: 0.25% (25 bps)
- Fee account: `9DZEWwT47BKZnutbyJ4L5T8uEaVkwbQY8SeL3ehHHXGY`

### DFlow Trading Fees
Formula: `fee = scale × p × (1-p) × contracts`
- scale = 0.09 for Frost tier taker
- p = fill price (probability 0-1)
- Max fee at 50¢: $0.0225 per contract

## Market Filtering

### Swipe Tab (Strict)
- Probability: 10-90% (balanced odds)
- Volume: ≥$10,000
- Must be initialized on DFlow
- Binary markets only

### Discovery Tab (Relaxed)
- Probability: 1-99%
- No volume filter
- Shows uninitialized markets (with warnings)

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...

# Privy Authentication
VITE_PRIVY_APP_ID=...
PRIVY_APP_SECRET=...

# DFlow Trading
DFLOW_API_KEY=...

# AI Insights
PERPLEXITY_API_KEY=...

# Optional: Replit AI Integrations
AI_INTEGRATIONS_OPENAI_API_KEY=...
AI_INTEGRATIONS_OPENAI_BASE_URL=...
```

## Development

```bash
# Install dependencies
npm install

# Start development server (frontend + backend)
npm run dev

# Database migrations
npx drizzle-kit push

# Build for production
npm run build
```

## Path Aliases

- `@/` → `client/src/`
- `@shared/` → `shared/`
- `@assets/` → `attached_assets/`

## Key Design Decisions

1. **Whole Shares Only**: Kalshi only accepts integer contracts, so fractional shares are floored
2. **Bid-Ask Spread**: UI shows mid-price, trading executes at ask (buy) or bid (sell)
3. **Gas Reserves**: 0.02 SOL always kept for transaction fees
4. **Async Trade Polling**: Orders are async, poll `/order-status` for fill amounts
5. **Event Diversification**: Markets from same event spaced 5+ positions apart
6. **Mobile-First**: Designed for swipe gestures on mobile devices

## Analytics Events

Tracked via `analytics_events` table:
- `page_view`: Route navigation
- `market_view`: Market card displayed
- `bet_placed`: Trade executed

Developer dashboard at `/developer` (wallet-gated to dev address).
