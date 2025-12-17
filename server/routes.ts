import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getEvents, getMarkets, getMockMarkets, diversifyMarketFeed, type SimplifiedMarket } from "./pond";
import { z } from "zod";
import { PrivyClient } from "@privy-io/server-auth";
import { FEE_CONFIG } from "@shared/schema";

const PRIVY_APP_ID = process.env.VITE_PRIVY_APP_ID || '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || '';

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
      const category = req.query.category as string;
      let markets: SimplifiedMarket[];
      
      markets = await getEvents(500);
      
      markets = diversifyMarketFeed(markets);
      
      const categoryBreakdownAfter: Record<string, number> = {};
      for (const m of markets) {
        categoryBreakdownAfter[m.category] = (categoryBreakdownAfter[m.category] || 0) + 1;
      }
      console.log('After diversification:', categoryBreakdownAfter);
      
      if (category && category !== 'all') {
        markets = markets.filter(m => 
          m.category.toLowerCase() === category.toLowerCase()
        );
      }
      
      res.json({ markets });
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

  return httpServer;
}
