# Pulse - Prediction Markets App

## Overview

Pulse is a mobile-first prediction markets trading application that allows users to swipe on markets (similar to Tinder) to place bets. The app integrates with the Pond/dflow.net prediction markets metadata API for Solana-based trading and uses Privy for Web3 wallet authentication. Users can swipe right to bet "Yes", left to bet "No", or down to skip markets.

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
- **Schema Location**: `shared/schema.ts` contains user and trade tables
- **Migrations**: Managed via `drizzle-kit push` command

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

- **Pond/dflow.net API**: Prediction markets metadata API
  - Base URL: `https://prediction-markets-api.dflow.net/api/v1`
  - Provides Solana account data (yesMint, noMint, marketLedger) for on-chain trading
  - No API key required for public endpoints

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