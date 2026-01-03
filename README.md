# SWAY - Prediction Markets

A mobile-first prediction markets trading app with swipe-based interactions.

## Prerequisites

- **Node.js**: v22+ (tested with v22.21.1)
- **PostgreSQL**: v16+
- **Package Manager**: npm (v10+)

## Local Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example env file:

```bash
cp .env.example .env
```

**Required variables:**
- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Server port (default: 3000)
- `VITE_HELIUS_API_KEY` - Solana RPC access key

**Optional variables:**
- `VITE_PRIVY_APP_ID` - Enables wallet authentication (app runs in demo mode without this)
- `PRIVY_APP_SECRET` - Server-side Privy auth

### 3. Set Up Database

Start PostgreSQL (if not already running):

```bash
sudo service postgresql start
```

Create the database:

```bash
sudo -u postgres psql -c "CREATE DATABASE sway;"
```

Push the schema:

```bash
npm run db:push
```

### 4. Start Development Server

**Using the startup script:**

```bash
./start-dev.sh
```

**Or manually:**

```bash
export $(cat .env | xargs) && npm run dev
```

The app will be available at **http://localhost:3000**

## Development Mode Features

When running in development mode, you'll see a dev panel in the bottom-right showing:
- Privy status (Enabled / Demo Mode)
- Helius API status
- Missing environment variable warnings

## Troubleshooting

### Blank Page

If you see a blank page:

1. **Check the browser console** (F12) for JavaScript errors
2. **Verify the dev server is running** - you should see "serving on port 3000" in terminal
3. **Hard refresh** the browser (Ctrl+Shift+R or Cmd+Shift+R)
4. **Check environment variables** - run `curl http://localhost:3000/@vite/client` to verify Vite is serving

### Demo Mode Limitations

Without `VITE_PRIVY_APP_ID`, the app runs in demo mode:
- ✅ Browse markets
- ✅ View UI/UX
- ❌ Connect wallet
- ❌ Place trades
- ❌ Access profile features

## Architecture

- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS
- **Backend**: Express.js + TypeScript (ESM)
- **Database**: PostgreSQL + Drizzle ORM
- **Deployment**: Single server serves both API and client (Vite middleware in dev)

## Key Scripts

```bash
npm run dev          # Start development server (backend + Vite middleware)
npm run dev:client   # Start Vite dev server standalone (port 3000)
npm run build        # Build for production
npm run start        # Run production build
npm run db:push      # Push database schema changes
npm run check        # Type check with TypeScript
```

## Contributing

This is a monorepo with:
- `/client` - React frontend
- `/server` - Express backend
- `/shared` - Shared types/schema
- `/db` - Database utilities

Path aliases:
- `@/` → `client/src/`
- `@shared/` → `shared/`
