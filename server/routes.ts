import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getEvents, getMarkets, getMockMarkets, diversifyMarketFeed, getEventMarkets, searchAllMarkets, type SimplifiedMarket } from "./pond";
import { z } from "zod";
import { PrivyClient } from "@privy-io/server-auth";
import { FEE_CONFIG, DEV_WALLET, insertAnalyticsEventSchema } from "@shared/schema";
import { placeKalshiOrder, getKalshiBalance, getKalshiPositions, verifyKalshiCredentials, cancelKalshiOrder } from "./kalshi-trading";
import { getPondQuote, getMarketTokens, getOrderStatus, SOLANA_TOKENS } from "./pond-trading";
import fetch from "node-fetch";

const PRIVY_APP_ID = process.env.VITE_PRIVY_APP_ID || '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || '';
const KALSHI_API_KEY_ID = process.env.KALSHI_API_KEY_ID || '';
const KALSHI_PRIVATE_KEY = process.env.KALSHI_PRIVATE_KEY || '';
const KALSHI_USE_DEMO = process.env.KALSHI_USE_DEMO === 'true';
const DFLOW_API_KEY = process.env.DFLOW_API_KEY || '';

const privyClient = PRIVY_APP_ID && PRIVY_APP_SECRET 
  ? new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET)
  : null;

interface AuthenticatedRequest extends Request {
  userId?: string;
  privyId?: string;
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const privyIdHeader = req.headers['x-privy-user-id'] as string;
  
  if (privyClient && authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const claims = await privyClient.verifyAuthToken(token);
      req.privyId = claims.userId;
    } catch (error) {
      console.error('JWT verification failed:', error);
      return res.status(401).json({ error: 'Invalid token' });
    }
  } else if (privyIdHeader) {
    req.privyId = privyIdHeader;
  } else {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (req.privyId) {
    const user = await storage.getUserByPrivyId(req.privyId);
    if (user) {
      req.userId = user.id;
    }
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get('/api/markets', async (req: AuthenticatedRequest, res: Response) => {
    try {
      let markets: SimplifiedMarket[];
      
      markets = await getEvents(1000);
      
      markets = diversifyMarketFeed(markets);
      
      const trendingCount = Math.min(50, markets.length);
      const trendingMarkets = markets.slice(0, trendingCount);
      
      const remainingMarkets = markets.slice(trendingCount);
      const categories = ['Politics', 'Sports', 'Economics', 'Tech', 'Weather', 'General'];
      const categoryMarkets: SimplifiedMarket[] = [];
      
      let hasMore = true;
      let index = 0;
      while (hasMore) {
        hasMore = false;
        for (const cat of categories) {
          const catMarkets = remainingMarkets.filter(m => m.category === cat);
          if (catMarkets[index]) {
            categoryMarkets.push(catMarkets[index]);
            hasMore = true;
          }
        }
        index++;
      }
      
      let organizedMarkets = [...trendingMarkets, ...categoryMarkets];
      
      organizedMarkets = organizedMarkets.reverse();
      
      console.log('Markets: Total', organizedMarkets.length, '- Top 3 by 24h vol:', organizedMarkets.slice(-3).map(m => ({ title: m.title?.slice(0,25), vol24h: m.volume24h })));
      
      res.json({ markets: organizedMarkets });
    } catch (error) {
      console.error('Error fetching markets:', error);
      res.status(500).json({ error: 'Failed to fetch markets' });
    }
  });

  app.get('/api/events/:eventTicker/markets', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { eventTicker } = req.params;
      const markets = await getEventMarkets(eventTicker);
      res.json({ markets });
    } catch (error) {
      console.error('Error fetching event markets:', error);
      res.status(500).json({ error: 'Failed to fetch event markets' });
    }
  });

  // Search endpoint - uses cached markets for comprehensive search
  app.get('/api/markets/search', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const query = (req.query.q as string || '').trim();
      
      if (!query || query.length < 2) {
        return res.json({ markets: [] });
      }
      
      const matchingMarkets = await searchAllMarkets(query);
      
      res.json({ markets: matchingMarkets.slice(0, 100) });
    } catch (error) {
      console.error('Error searching markets:', error);
      res.status(500).json({ error: 'Failed to search markets' });
    }
  });

  // Market history endpoint for price charts
  app.get('/api/markets/:ticker/history', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { ticker } = req.params;
      const KALSHI_BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2';
      
      // Get last 7 days of hourly data
      const endTs = Math.floor(Date.now() / 1000);
      const startTs = endTs - (7 * 24 * 60 * 60); // 7 days ago
      
      // Fetch candlestick history from Kalshi API
      const response = await fetch(
        `${KALSHI_BASE_URL}/markets/${ticker}/candlesticks?period_interval=60&start_ts=${startTs}&end_ts=${endTs}`, 
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );
      
      if (!response.ok) {
        console.error('Kalshi history API error:', response.status);
        return res.json({ history: [] });
      }
      
      const data = await response.json() as { 
        candlesticks?: Array<{ 
          end_period_ts: number; 
          price?: { close: number };
        }> 
      };
      const candlesticks = data.candlesticks || [];
      
      // Transform to simpler format for chart (prices are in cents, convert to decimal)
      const history = candlesticks.map((c) => ({
        timestamp: c.end_period_ts * 1000,
        price: (c.price?.close || 0) / 100,
      })).filter((h) => h.price > 0);
      
      res.json({ history });
    } catch (error) {
      console.error('Error fetching market history:', error);
      res.json({ history: [] });
    }
  });

  app.post('/api/users', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { privyId, walletAddress } = req.body;
      
      if (!privyId) {
        return res.status(400).json({ error: 'privyId is required' });
      }

      let user = await storage.getUserByPrivyId(privyId);
      
      if (!user) {
        user = await storage.createUser({
          privyId,
          walletAddress: walletAddress || null,
          yesWager: 5,
          noWager: 5,
          interests: [],
        });
      }

      res.json({ user });
    } catch (error) {
      console.error('Error creating/fetching user:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  app.get('/api/users/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await storage.getUserByPrivyId(req.privyId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json({ user });
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  app.patch('/api/users/settings', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { yesWager, noWager, interests } = req.body;
      const updates: { yesWager?: number; noWager?: number; interests?: string[] } = {};
      
      if (typeof yesWager === 'number') updates.yesWager = yesWager;
      if (typeof noWager === 'number') updates.noWager = noWager;
      if (Array.isArray(interests)) updates.interests = interests;

      const user = await storage.updateUserSettings(req.userId, updates);
      res.json({ user });
    } catch (error) {
      console.error('Error updating settings:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  app.post('/api/trades', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { marketId, marketTitle, marketCategory, direction, wagerAmount, price } = req.body;
      
      if (!marketId || !direction || !wagerAmount || price === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Calculate 1% entry fee
      const entryFee = wagerAmount * FEE_CONFIG.FEE_PERCENTAGE;
      const netWagerAmount = wagerAmount - entryFee;
      
      const shares = Math.round((netWagerAmount / price) * 100) / 100;
      const estimatedPayout = Math.round(shares * 100) / 100;

      console.log(`Trade created: Entry fee of $${entryFee.toFixed(4)} (1%) collected. Recipient: ${FEE_CONFIG.FEE_RECIPIENT}`);

      const trade = await storage.createTrade({
        userId: req.userId,
        marketId,
        marketTitle: marketTitle || '',
        marketCategory: marketCategory || null,
        direction,
        wagerAmount,
        price: price.toFixed(2),
        shares: shares.toFixed(2),
        estimatedPayout: estimatedPayout.toFixed(2),
        entryFee: entryFee.toFixed(4),
        exitFee: null,
        isClosed: false,
        closedAt: null,
        pnl: null,
      });

      res.json({ trade, entryFee, feeRecipient: FEE_CONFIG.FEE_RECIPIENT });
    } catch (error) {
      console.error('Error creating trade:', error);
      res.status(500).json({ error: 'Failed to create trade' });
    }
  });

  app.get('/api/trades', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(404).json({ error: 'User not found' });
      }

      const trades = await storage.getUserTrades(req.userId);
      res.json({ trades });
    } catch (error) {
      console.error('Error fetching trades:', error);
      res.status(500).json({ error: 'Failed to fetch trades' });
    }
  });

  app.get('/api/positions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(404).json({ error: 'User not found' });
      }

      const positions = await storage.getOpenPositions(req.userId);
      res.json({ positions });
    } catch (error) {
      console.error('Error fetching positions:', error);
      res.status(500).json({ error: 'Failed to fetch positions' });
    }
  });

  app.post('/api/trades/:tradeId/close', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { tradeId } = req.params;
      const { pnl, payout } = req.body;

      // Calculate 1% exit fee on the payout amount
      const payoutAmount = payout || 0;
      const exitFee = payoutAmount * FEE_CONFIG.FEE_PERCENTAGE;
      const netPayout = payoutAmount - exitFee;
      const adjustedPnl = pnl ? (parseFloat(pnl) - exitFee) : (netPayout - payoutAmount);

      console.log(`Trade closed: Exit fee of $${exitFee.toFixed(4)} (1%) collected. Recipient: ${FEE_CONFIG.FEE_RECIPIENT}`);

      const trade = await storage.closeTrade(tradeId, adjustedPnl, exitFee);
      res.json({ trade, exitFee, feeRecipient: FEE_CONFIG.FEE_RECIPIENT });
    } catch (error) {
      console.error('Error closing trade:', error);
      res.status(500).json({ error: 'Failed to close trade' });
    }
  });

  // Kalshi Trading API endpoints
  app.get('/api/kalshi/status', async (req: AuthenticatedRequest, res: Response) => {
    const hasCredentials = !!(KALSHI_API_KEY_ID && KALSHI_PRIVATE_KEY);
    res.json({ 
      configured: hasCredentials,
      mode: KALSHI_USE_DEMO ? 'demo' : 'live'
    });
  });

  app.get('/api/kalshi/balance', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!KALSHI_API_KEY_ID || !KALSHI_PRIVATE_KEY) {
        return res.status(400).json({ error: 'Kalshi API credentials not configured' });
      }

      const balance = await getKalshiBalance({
        apiKeyId: KALSHI_API_KEY_ID,
        privateKey: KALSHI_PRIVATE_KEY,
        useDemo: KALSHI_USE_DEMO,
      });

      res.json(balance);
    } catch (error: any) {
      console.error('Error fetching Kalshi balance:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch Kalshi balance' });
    }
  });

  app.get('/api/kalshi/positions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!KALSHI_API_KEY_ID || !KALSHI_PRIVATE_KEY) {
        return res.status(400).json({ error: 'Kalshi API credentials not configured' });
      }

      const positions = await getKalshiPositions({
        apiKeyId: KALSHI_API_KEY_ID,
        privateKey: KALSHI_PRIVATE_KEY,
        useDemo: KALSHI_USE_DEMO,
      });

      res.json(positions);
    } catch (error: any) {
      console.error('Error fetching Kalshi positions:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch Kalshi positions' });
    }
  });

  app.post('/api/kalshi/order', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!KALSHI_API_KEY_ID || !KALSHI_PRIVATE_KEY) {
        return res.status(400).json({ error: 'Kalshi API credentials not configured' });
      }

      const { ticker, side, count, price, type = 'limit' } = req.body;

      if (!ticker || !side || !count) {
        return res.status(400).json({ error: 'Missing required fields: ticker, side, count' });
      }

      const orderResult = await placeKalshiOrder(
        {
          apiKeyId: KALSHI_API_KEY_ID,
          privateKey: KALSHI_PRIVATE_KEY,
          useDemo: KALSHI_USE_DEMO,
        },
        {
          ticker,
          action: 'buy',
          side: side.toLowerCase() as 'yes' | 'no',
          count: parseInt(count),
          type: type as 'limit' | 'market',
          yesPrice: side.toLowerCase() === 'yes' ? Math.round(price * 100) : undefined,
          noPrice: side.toLowerCase() === 'no' ? Math.round(price * 100) : undefined,
        }
      );

      // Also record in our local database
      if (req.userId) {
        const entryFee = count * price * FEE_CONFIG.FEE_PERCENTAGE;
        await storage.createTrade({
          userId: req.userId,
          marketId: ticker,
          marketTitle: `Kalshi: ${ticker}`,
          marketCategory: 'Kalshi',
          direction: side.toUpperCase(),
          wagerAmount: count * price,
          price: price.toFixed(2),
          shares: count.toString(),
          estimatedPayout: count.toFixed(2),
          entryFee: entryFee.toFixed(4),
          exitFee: null,
          isClosed: false,
          closedAt: null,
          pnl: null,
        });
      }

      console.log(`Kalshi order placed: ${side} ${count} contracts on ${ticker} at ${price}`);
      res.json({ order: orderResult, success: true });
    } catch (error: any) {
      console.error('Error placing Kalshi order:', error);
      res.status(500).json({ error: error.message || 'Failed to place Kalshi order' });
    }
  });

  app.delete('/api/kalshi/order/:orderId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!KALSHI_API_KEY_ID || !KALSHI_PRIVATE_KEY) {
        return res.status(400).json({ error: 'Kalshi API credentials not configured' });
      }

      const { orderId } = req.params;

      await cancelKalshiOrder(
        {
          apiKeyId: KALSHI_API_KEY_ID,
          privateKey: KALSHI_PRIVATE_KEY,
          useDemo: KALSHI_USE_DEMO,
        },
        orderId
      );

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error canceling Kalshi order:', error);
      res.status(500).json({ error: error.message || 'Failed to cancel Kalshi order' });
    }
  });

  // Pond/DFlow Trading API - Trade Kalshi markets on Solana
  app.get('/api/pond/market/:marketId/tokens', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { marketId } = req.params;
      const tokens = await getMarketTokens(marketId);
      
      if (!tokens) {
        return res.status(404).json({ error: 'Market tokens not found' });
      }
      
      res.json(tokens);
    } catch (error: any) {
      console.error('Error fetching market tokens:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch market tokens' });
    }
  });

  app.post('/api/pond/quote', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { marketId, side, amountUSDC, userPublicKey, slippageBps = 100 } = req.body;

      if (!marketId || !side || !amountUSDC || !userPublicKey) {
        return res.status(400).json({ error: 'Missing required fields: marketId, side, amountUSDC, userPublicKey' });
      }

      // Get market token mints
      const tokens = await getMarketTokens(marketId);
      if (!tokens) {
        return res.status(404).json({ error: 'Market tokens not found for this market' });
      }

      // Determine which token to buy (YES or NO outcome)
      const outputMint = side.toLowerCase() === 'yes' ? tokens.yesMint : tokens.noMint;
      
      // Convert USDC amount to lamports (USDC has 6 decimals)
      const amountLamports = Math.floor(amountUSDC * 1_000_000);

      // Get quote from DFlow
      const quote = await getPondQuote(
        SOLANA_TOKENS.USDC,
        outputMint,
        amountLamports,
        userPublicKey,
        slippageBps,
        DFLOW_API_KEY || undefined
      );

      res.json({
        quote,
        marketId,
        side,
        outputMint,
        inputMint: SOLANA_TOKENS.USDC,
      });
    } catch (error: any) {
      console.error('Error getting Pond quote:', error);
      res.status(500).json({ error: error.message || 'Failed to get quote' });
    }
  });

  // New endpoint that accepts token mints directly (client fetches them to bypass 403)
  app.post('/api/pond/order', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { inputMint, outputMint, amountUSDC, userPublicKey, slippageBps = 100 } = req.body;

      if (!inputMint || !outputMint || !amountUSDC || !userPublicKey) {
        return res.status(400).json({ error: 'Missing required fields: inputMint, outputMint, amountUSDC, userPublicKey' });
      }

      // Convert USDC amount to atomic units (USDC has 6 decimals)
      const amountAtomic = Math.floor(amountUSDC * 1_000_000);

      console.log('[Pond Order] Getting order for:', { inputMint, outputMint, amountAtomic, userPublicKey });

      // Get order from DFlow
      const orderResponse = await getPondQuote(
        inputMint,
        outputMint,
        amountAtomic,
        userPublicKey,
        slippageBps,
        DFLOW_API_KEY || undefined
      );

      console.log('[Pond Order] Response received, has transaction:', !!orderResponse.transaction);

      res.json({
        transaction: orderResponse.transaction,
        quote: orderResponse.quote,
        executionMode: orderResponse.executionMode,
      });
    } catch (error: any) {
      console.error('Error getting Pond order:', error);
      res.status(500).json({ error: error.message || 'Failed to get order' });
    }
  });

  app.get('/api/pond/order-status/:signature', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { signature } = req.params;
      const status = await getOrderStatus(signature, DFLOW_API_KEY || undefined);
      res.json(status);
    } catch (error: any) {
      console.error('Error getting order status:', error);
      res.status(500).json({ error: error.message || 'Failed to get order status' });
    }
  });

  // Helius RPC endpoint for Solana
  const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';
  const HELIUS_RPC_URL = HELIUS_API_KEY 
    ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
    : 'https://api.mainnet-beta.solana.com';

  // Solana balance endpoint using Helius RPC
  app.get('/api/solana/balance/:address', async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      
      if (!address) {
        return res.status(400).json({ error: 'Missing wallet address' });
      }

      // Fetch SOL balance
      const solResponse = await fetch(HELIUS_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBalance',
          params: [address]
        })
      });
      const solData = await solResponse.json() as any;
      const solBalance = (solData.result?.value || 0) / 1e9;

      // Fetch USDC balance using getTokenAccountsByOwner
      const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const usdcResponse = await fetch(HELIUS_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'getTokenAccountsByOwner',
          params: [
            address,
            { mint: USDC_MINT },
            { encoding: 'jsonParsed' }
          ]
        })
      });
      const usdcData = await usdcResponse.json() as any;
      
      let usdcBalance = 0;
      if (usdcData.result?.value) {
        for (const account of usdcData.result.value) {
          const tokenAmount = account.account?.data?.parsed?.info?.tokenAmount;
          if (tokenAmount) {
            usdcBalance += parseFloat(tokenAmount.uiAmountString || '0');
          }
        }
      }

      console.log(`[Helius] Balance for ${address}: ${solBalance} SOL, ${usdcBalance} USDC`);
      res.json({ solBalance, usdcBalance });
    } catch (error: any) {
      console.error('[Helius] Balance fetch error:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch balance' });
    }
  });

  // Jupiter swap proxy endpoints (to avoid CORS issues)
  // Using public.jupiterapi.com as alternative (jup.ag has DNS issues on some servers)
  const JUPITER_QUOTE_API = 'https://public.jupiterapi.com';
  const JUPITER_SWAP_API = 'https://public.jupiterapi.com/swap';

  app.get('/api/jupiter/quote', async (req: Request, res: Response) => {
    try {
      const { inputMint, outputMint, amount, slippageBps } = req.query;
      
      if (!inputMint || !outputMint || !amount) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const params = new URLSearchParams({
        inputMint: inputMint as string,
        outputMint: outputMint as string,
        amount: amount as string,
        slippageBps: (slippageBps as string) || '50',
        restrictIntermediateTokens: 'true',
      });

      const url = `${JUPITER_QUOTE_API}/quote?${params.toString()}`;
      console.log('[Jupiter] Fetching quote from:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Pulse-Prediction-Markets/1.0',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Jupiter] Quote error:', response.status, errorText);
        return res.status(response.status).json({ error: errorText });
      }

      const quote = await response.json() as any;
      console.log('[Jupiter] Quote received, outAmount:', quote.outAmount);
      res.json(quote);
    } catch (error: any) {
      console.error('[Jupiter] Quote fetch error:', error.message, error.cause);
      res.status(500).json({ error: error.message || 'Failed to get Jupiter quote' });
    }
  });

  app.post('/api/jupiter/swap', async (req: Request, res: Response) => {
    try {
      const { quoteResponse, userPublicKey } = req.body;
      
      if (!quoteResponse || !userPublicKey) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      console.log('[Jupiter] Creating swap transaction for:', userPublicKey);
      const response = await fetch(JUPITER_SWAP_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto',
          dynamicSlippage: {
            minBps: 50,
            maxBps: 300,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Jupiter] Swap error:', response.status, errorText);
        return res.status(response.status).json({ error: errorText });
      }

      const result = await response.json();
      console.log('[Jupiter] Swap transaction created');
      res.json(result);
    } catch (error: any) {
      console.error('[Jupiter] Swap fetch error:', error);
      res.status(500).json({ error: error.message || 'Failed to create swap transaction' });
    }
  });

  // Analytics API endpoints
  app.post('/api/analytics/events', async (req: Request, res: Response) => {
    try {
      const event = insertAnalyticsEventSchema.parse(req.body);
      await storage.logAnalyticsEvent(event);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error logging analytics event:', error);
      res.status(400).json({ error: error.message || 'Failed to log event' });
    }
  });

  app.get('/api/analytics/summary', async (req: Request, res: Response) => {
    try {
      const walletAddress = req.headers['x-wallet-address'] as string;
      
      if (walletAddress !== DEV_WALLET) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const summary = await storage.getAnalyticsSummary();
      res.json(summary);
    } catch (error: any) {
      console.error('Error fetching analytics summary:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch analytics' });
    }
  });

  return httpServer;
}
