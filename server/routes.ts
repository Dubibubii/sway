import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getMarkets, getMockMarkets, type SimplifiedMarket } from "./kalshi";
import { z } from "zod";

interface AuthenticatedRequest extends Request {
  userId?: string;
  privyId?: string;
}

async function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const privyId = req.headers['x-privy-user-id'] as string;
  if (privyId) {
    req.privyId = privyId;
    const user = await storage.getUserByPrivyId(privyId);
    if (user) {
      req.userId = user.id;
    }
  }
  next();
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const privyId = req.headers['x-privy-user-id'] as string;
  if (!privyId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.privyId = privyId;
  const user = await storage.getUserByPrivyId(privyId);
  if (user) {
    req.userId = user.id;
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
      
      markets = await getMarkets(50);
      
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

      const shares = wagerAmount / price;
      const estimatedPayout = shares * 1;

      const trade = await storage.createTrade({
        userId: req.userId,
        marketId,
        marketTitle: marketTitle || '',
        marketCategory: marketCategory || null,
        direction,
        wagerAmount,
        price: price.toString(),
        shares: shares.toString(),
        estimatedPayout: estimatedPayout.toString(),
        isClosed: false,
        closedAt: null,
        pnl: null,
      });

      res.json({ trade });
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
      const { pnl } = req.body;

      const trade = await storage.closeTrade(tradeId, pnl || 0);
      res.json({ trade });
    } catch (error) {
      console.error('Error closing trade:', error);
      res.status(500).json({ error: 'Failed to close trade' });
    }
  });

  return httpServer;
}
