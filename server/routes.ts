import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getEvents, getMarkets, getMockMarkets, diversifyMarketFeed, type SimplifiedMarket } from "./pond";
import { z } from "zod";
import { PrivyClient } from "@privy-io/server-auth";
import { FEE_CONFIG } from "@shared/schema";
import { placeKalshiOrder, getKalshiBalance, getKalshiPositions, verifyKalshiCredentials, cancelKalshiOrder } from "./kalshi-trading";

const PRIVY_APP_ID = process.env.VITE_PRIVY_APP_ID || '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || '';
const KALSHI_API_KEY_ID = process.env.KALSHI_API_KEY_ID || '';
const KALSHI_PRIVATE_KEY = process.env.KALSHI_PRIVATE_KEY || '';
const KALSHI_USE_DEMO = process.env.KALSHI_USE_DEMO === 'true';

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

  return httpServer;
}
