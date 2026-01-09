import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getEvents, getMarkets, getMockMarkets, diversifyMarketFeed, getEventMarkets, searchAllMarkets, startBackgroundCacheRefresh, getCacheTimestamp, setMarketCacheReadyCallback, getMarketCache, type SimplifiedMarket } from "./pond";
import { z } from "zod";
import { PrivyClient } from "@privy-io/server-auth";
import { FEE_CONFIG, DEV_WALLET, insertAnalyticsEventSchema, calculateSwayFee, type FeeChannel } from "@shared/schema";
import { placeKalshiOrder, getKalshiBalance, getKalshiPositions, verifyKalshiCredentials, cancelKalshiOrder } from "./kalshi-trading";
import { getPondQuote, getMarketTokens, getOrderStatus, checkRedemptionStatus, getAvailableDflowMarkets, getDflowMarketInfo, populateMarketInfoFromCache, SOLANA_TOKENS } from "./pond-trading";
import { isConfigured as isPrivyWalletAuthConfigured } from "./privy-wallet-auth";
// Note: Using native fetch (Node.js 20+) - no need for node-fetch

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

  // Register callback to populate market info cache from price cache
  // This is MUCH faster than separate /events pagination (~2s vs ~30s)
  setMarketCacheReadyCallback((markets) => {
    populateMarketInfoFromCache(markets);
  });
  
  // Start background cache refresh on server startup
  setTimeout(() => {
    console.log('Triggering initial market cache refresh...');
    startBackgroundCacheRefresh();
  }, 2000);
  
  // Provide RPC config to client at runtime (for production where build-time vars may be stale)
  app.get('/api/config/rpc', (_req: Request, res: Response) => {
    const heliusKey = process.env.HELIUS_API_KEY || '';
    const hasHelius = !!heliusKey;
    res.json({
      rpcUrl: hasHelius 
        ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
        : 'https://api.mainnet-beta.solana.com',
      wssUrl: hasHelius
        ? `wss://mainnet.helius-rpc.com/?api-key=${heliusKey}`
        : 'wss://api.mainnet-beta.solana.com',
      provider: hasHelius ? 'helius' : 'public'
    });
  });
  
  // Health check endpoint with RPC status - useful for debugging production
  app.get('/api/health', (_req: Request, res: Response) => {
    const heliusKey = process.env.HELIUS_API_KEY || '';
    res.json({
      status: 'ok',
      rpcProvider: heliusKey ? 'helius' : 'public',
      heliusConfigured: !!heliusKey,
      timestamp: new Date().toISOString()
    });
  });

  app.get('/api/markets', async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Parse pagination parameters with defaults for backward compatibility
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 500);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const excludeIdsParam = req.query.excludeIds as string || '';
      const excludeIds = excludeIdsParam ? new Set(excludeIdsParam.split(',').map(id => id.trim()).filter(Boolean)) : new Set<string>();
      
      // Get markets from our cached DFlow /markets data (already has prices)
      // This is fast because it uses background-refreshed cache
      let markets: SimplifiedMarket[] = await getEvents(10000);
      
      // Get DFlow market info to check which markets are actually initialized for trading
      // This uses cache and triggers background refresh if stale - doesn't block
      const marketInfo = await getDflowMarketInfo();
      
      // Add isInitialized status based on actual DFlow metadata
      const hasMarketInfo = marketInfo.size > 0;
      
      if (!hasMarketInfo) {
        // Cache still loading - return empty to prevent showing untradeable markets
        console.log('Markets: Market info cache still loading, returning empty to prevent untradeable markets');
        return res.json({ 
          markets: [],
          cacheTimestamp: getCacheTimestamp(),
          total: 0,
          hasMore: true,
          loading: true
        });
      }
      
      // Add isInitialized status - default to false for unknown markets
      markets = markets.map(m => ({
        ...m,
        isInitialized: marketInfo.get(m.id) ?? false,
      }));
      
      console.log(`Markets: ${markets.length} total markets, marketInfo cache has ${marketInfo.size} entries`);
      
      // Apply strict diversification for swipe tab (removes extreme probabilities, uninitialized markets, low volume)
      // This ensures users only see markets that can actually be traded without errors
      // DO NOT re-sort after this - diversification already produces the optimal display order
      markets = diversifyMarketFeed(markets, true); // strictMode = true for swipe tab
      
      // All markets returned are already initialized and tradeable after strict filtering
      const total = markets.length;
      
      // Apply excludeIds filter if provided (for deduplication across batches)
      let filteredMarkets = excludeIds.size > 0 
        ? markets.filter(m => !excludeIds.has(m.id))
        : markets;
      
      // Apply pagination
      const paginatedMarkets = filteredMarkets.slice(offset, offset + limit);
      const hasMore = (offset + limit) < filteredMarkets.length;
      
      const initializedCount = paginatedMarkets.filter(m => m.isInitialized).length;
      const uniqueCategories = Array.from(new Set(paginatedMarkets.map(m => m.category)));
      console.log(`Markets: Returning ${paginatedMarkets.length} (offset=${offset}, limit=${limit}, ${initializedCount} initialized, hasMore=${hasMore}) - Categories:`, uniqueCategories.join(', '));
      
      res.json({ 
        markets: paginatedMarkets,
        cacheTimestamp: getCacheTimestamp(),
        total,
        hasMore
      });
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
      
      let matchingMarkets = await searchAllMarkets(query);
      
      // Filter to only DFlow-available markets and add isInitialized status
      const dflowMarkets = await getAvailableDflowMarkets();
      const marketInfo = await getDflowMarketInfo();
      
      if (dflowMarkets.size > 0) {
        matchingMarkets = matchingMarkets.filter(m => dflowMarkets.has(m.id));
      }
      
      // Add isInitialized status
      // Default to false (NOT initialized) if metadata is unavailable - prevents showing uninitialized markets
      matchingMarkets = matchingMarkets.map(m => ({
        ...m,
        isInitialized: marketInfo.has(m.id) ? marketInfo.get(m.id) : false,
      }));
      
      // Return all matching markets for comprehensive search
      res.json({ markets: matchingMarkets });
    } catch (error) {
      console.error('Error searching markets:', error);
      res.status(500).json({ error: 'Failed to search markets' });
    }
  });

  // Market history endpoint for price charts - 7 day history using candlesticks API
  app.get('/api/markets/:ticker/history', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { ticker } = req.params;
      const KALSHI_BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2';
      
      // First get market info to extract series_ticker
      const marketResponse = await fetch(
        `${KALSHI_BASE_URL}/markets/${ticker}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );
      
      if (!marketResponse.ok) {
        console.log('Market info fetch failed:', marketResponse.status);
        return res.json({ history: [], marketInfo: null });
      }
      
      const marketData = await marketResponse.json() as { 
        market?: { 
          last_price?: number;
          previous_price?: number;
          open_time?: string;
          created_time?: string;
          series_ticker?: string;
          event_ticker?: string;
        } 
      };
      
      const market = marketData.market;
      if (!market) {
        return res.json({ history: [], marketInfo: null });
      }
      
      // Try to get 7-day candlestick history
      const history: Array<{ timestamp: number; price: number }> = [];
      const seriesTicker = market.series_ticker || market.event_ticker;
      
      if (seriesTicker) {
        const endTs = Math.floor(Date.now() / 1000);
        const startTs = endTs - (7 * 24 * 60 * 60); // 7 days ago
        
        try {
          // Use daily interval (1440 minutes) for 7-day view
          const candlesUrl = `${KALSHI_BASE_URL}/series/${seriesTicker}/markets/${ticker}/candlesticks?start_ts=${startTs}&end_ts=${endTs}&period_interval=1440`;
          const candlesResponse = await fetch(candlesUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });
          
          if (candlesResponse.ok) {
            const candlesData = await candlesResponse.json() as {
              candlesticks?: Array<{
                end_period_ts: number;
                price?: { close?: number };
              }>;
            };
            
            if (candlesData.candlesticks && candlesData.candlesticks.length > 0) {
              // Daily candles should give us 7 data points max
              for (const candle of candlesData.candlesticks) {
                // Accept candles with valid close price (including 0)
                if (candle.price?.close !== undefined) {
                  history.push({
                    timestamp: candle.end_period_ts * 1000,
                    price: candle.price.close / 100,
                  });
                }
              }
              
              // Sort by timestamp
              history.sort((a, b) => a.timestamp - b.timestamp);
            }
          } else {
            console.log(`Candlestick API returned ${candlesResponse.status} for ${ticker}`);
          }
        } catch (candleError) {
          console.log('Candlestick fetch failed, falling back to simple history');
        }
      }
      
      // Fallback to simple last/previous price if no candlestick data
      if (history.length < 2) {
        const now = Date.now();
        if (market.previous_price !== undefined) {
          history.push({
            timestamp: now - (24 * 60 * 60 * 1000),
            price: market.previous_price / 100,
          });
        }
        if (market.last_price !== undefined) {
          history.push({
            timestamp: now,
            price: market.last_price / 100,
          });
        }
      }
      
      const marketInfo = {
        lastPrice: market.last_price ? market.last_price / 100 : null,
        previousPrice: market.previous_price ? market.previous_price / 100 : null,
        openTime: market.open_time || market.created_time || null,
      };
      
      res.json({ history, marketInfo });
    } catch (error) {
      console.error('Error fetching market history:', error);
      res.json({ history: [], marketInfo: null });
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

  app.post('/api/users/onboarding/complete', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = await storage.completeOnboarding(req.userId);
      res.json({ user, success: true });
    } catch (error) {
      console.error('Error completing onboarding:', error);
      res.status(500).json({ error: 'Failed to complete onboarding' });
    }
  });

  app.post('/api/trades', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { marketId, marketTitle, marketCategory, optionLabel, direction, wagerAmount, price, actualShares, signature, executionMode } = req.body;
      
      if (!marketId || !direction || !wagerAmount || price === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Convert wagerAmount from dollars to cents (integer)
      const wagerAmountDollars = parseFloat(wagerAmount);
      const wagerAmountCents = Math.round(wagerAmountDollars * 100);
      
      console.log(`[Trade] On-chain tx successful, attempting DB write...`);
      console.log(`[Trade] Data payload: marketId=${marketId}, direction=${direction}, wagerAmount=$${wagerAmountDollars} (${wagerAmountCents} cents), price=${price}, actualShares=${actualShares}`);

      // Calculate 1% entry fee (in dollars for display)
      const entryFee = wagerAmountDollars * FEE_CONFIG.FEE_PERCENTAGE;
      const netWagerAmount = wagerAmountDollars - entryFee;
      
      // Use actual filled shares if provided (from async trade polling), otherwise calculate from quote
      // IMPORTANT: Kalshi only accepts whole contracts, so always floor to whole shares
      const newShares = actualShares 
        ? Math.floor(parseFloat(actualShares))
        : Math.floor(netWagerAmount / price);
      
      console.log(`[Trade] Using shares: ${newShares} (actualShares provided: ${!!actualShares}, executionMode: ${executionMode || 'unknown'})`);
      
      // Reject trades that result in 0 shares (wager too small)
      if (newShares < 1) {
        return res.status(400).json({ error: 'Wager amount too small to purchase at least 1 share' });
      }
      
      // Calculate ACTUAL entry price based on what was paid per share
      // This accounts for price impact and slippage, giving accurate P&L later
      // Entry price = cost / shares (what you actually paid per share)
      const actualEntryPrice = newShares > 0 ? wagerAmountDollars / newShares : price;
      console.log(`[Trade] Market mid-price: ${price}, Actual entry price: ${actualEntryPrice.toFixed(4)} (includes slippage/price impact)`);
      
      // Warn if async trade didn't provide actual shares
      if (executionMode === 'async' && !actualShares) {
        console.warn(`[Trade] WARNING: Async trade recorded without actual fill data - shares may be inaccurate`);
      }
      const newEstimatedPayout = newShares; // Each whole share pays $1 at settlement

      // Check if there's an existing open position for this market/direction
      const existingTrade = await storage.getOpenTradeForUserMarketDirection(req.userId, marketId, direction);
      
      if (existingTrade) {
        // Consolidate: update the existing position instead of creating a new one
        const existingWagerCents = existingTrade.wagerAmount;
        const existingShares = parseFloat(existingTrade.shares);
        const existingEntryFee = parseFloat(existingTrade.entryFee || '0');
        const existingPrice = parseFloat(existingTrade.price);
        
        // Calculate combined values
        // Round existing shares to handle legacy fractional data (3.99 -> 4, 3.01 -> 3)
        const totalWagerCents = existingWagerCents + wagerAmountCents;
        const existingSharesRounded = Math.round(existingShares);
        const totalShares = existingSharesRounded + newShares;
        const totalEntryFee = existingEntryFee + entryFee;
        const totalEstimatedPayout = totalShares; // Each share pays $1 at settlement
        
        // Calculate weighted average entry price based on actual cost basis
        // This uses the ACTUAL entry price (cost/shares) not the market mid-price
        // Total cost basis / total shares = true average entry price
        const weightedAvgPrice = (totalWagerCents / 100) / totalShares;
        
        console.log(`[Trade] Consolidating position: ${existingSharesRounded} shares (was ${existingShares}) + ${newShares} new = ${totalShares} total @ avg ${weightedAvgPrice.toFixed(4)}/share`);
        console.log(`[Trade] Entry fee: $${existingEntryFee.toFixed(4)} + $${entryFee.toFixed(4)} = $${totalEntryFee.toFixed(4)}`);

        const updatedTrade = await storage.updateTradePosition(existingTrade.id, {
          wagerAmount: totalWagerCents,
          shares: String(totalShares), // Store as whole number
          entryFee: totalEntryFee.toFixed(4),
          estimatedPayout: String(totalEstimatedPayout), // Store as whole number
          price: weightedAvgPrice.toFixed(4), // Store with 4 decimal precision for accurate entry price
        });

        console.log(`[Trade] Position consolidated. Total wager: $${(totalWagerCents / 100).toFixed(2)}, Total shares: ${totalShares}`);
        
        res.json({ trade: updatedTrade, entryFee, feeRecipient: FEE_CONFIG.FEE_RECIPIENT, consolidated: true });
      } else {
        // No existing position - create new trade
        console.log(`Trade created: Entry fee of $${entryFee.toFixed(4)} (1%) collected. Recipient: ${FEE_CONFIG.FEE_RECIPIENT}`);

        const trade = await storage.createTrade({
          userId: req.userId,
          marketId,
          marketTitle: marketTitle || '',
          marketCategory: marketCategory || null,
          optionLabel: optionLabel || null, // e.g., "Democratic Party"
          direction,
          wagerAmount: wagerAmountCents, // Store as cents (integer)
          price: actualEntryPrice.toFixed(4), // Store ACTUAL entry price (cost/shares) not market mid-price
          shares: String(newShares), // Store as whole number (no fractional shares)
          estimatedPayout: String(newEstimatedPayout), // Store as whole number
          entryFee: entryFee.toFixed(4),
          exitFee: null,
          isClosed: false,
          closedAt: null,
          pnl: null,
        });

        res.json({ trade, entryFee, feeRecipient: FEE_CONFIG.FEE_RECIPIENT, consolidated: false });
      }
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

  // Paginated closed trades (history) endpoint
  app.get('/api/trades/history', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(404).json({ error: 'User not found' });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await storage.getClosedTrades(req.userId, limit, offset);
      const nextOffset = offset + result.trades.length;
      const hasMore = nextOffset < result.total;
      
      res.json({ 
        trades: result.trades, 
        total: result.total,
        hasMore,
        nextOffset: hasMore ? nextOffset : null
      });
    } catch (error) {
      console.error('Error fetching trade history:', error);
      res.status(500).json({ error: 'Failed to fetch trade history' });
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

  // Update trade shares when partial fill is detected (on-chain balance differs from recorded)
  app.patch('/api/trades/:tradeId/shares', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { tradeId } = req.params;
      const { actualShares } = req.body;

      if (typeof actualShares !== 'number' || actualShares < 0) {
        return res.status(400).json({ error: 'Invalid actualShares value' });
      }

      // Get the existing trade
      const trades = await storage.getUserTrades(req.userId!);
      const trade = trades.find((t: any) => t.id === tradeId);
      
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      const currentShares = parseFloat(trade.shares);
      if (Math.abs(currentShares - actualShares) < 0.01) {
        // No significant difference, no update needed
        return res.json({ trade, updated: false });
      }

      console.log(`[Trade] Updating shares for trade ${tradeId}: ${currentShares} -> ${actualShares} (partial fill correction)`);

      // Recalculate values based on actual shares
      const price = parseFloat(trade.price);
      const entryFee = parseFloat(trade.entryFee || '0');
      
      // Adjust wager amount proportionally to the actual shares received
      const adjustedWagerCents = Math.round((actualShares / currentShares) * trade.wagerAmount);
      const adjustedEntryFee = (adjustedWagerCents / 100) * FEE_CONFIG.FEE_PERCENTAGE;
      const adjustedEstimatedPayout = actualShares;

      const updatedTrade = await storage.updateTradePosition(tradeId, {
        wagerAmount: adjustedWagerCents,
        shares: actualShares.toFixed(2),
        entryFee: adjustedEntryFee.toFixed(4),
        estimatedPayout: adjustedEstimatedPayout.toFixed(2),
        price: price.toFixed(2),
      });

      console.log(`[Trade] Trade updated: shares=${actualShares}, wager=$${(adjustedWagerCents/100).toFixed(2)}`);

      res.json({ trade: updatedTrade, updated: true });
    } catch (error) {
      console.error('Error updating trade shares:', error);
      res.status(500).json({ error: 'Failed to update trade shares' });
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

  // Quote preview endpoint - returns accurate cost breakdown for UI display
  // This endpoint includes platform fees to show users accurate numbers before trading
  app.post('/api/pond/quote', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { marketId, side, amountUSDC, userPublicKey, slippageBps = 100, channel = 'discovery' } = req.body;

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
      
      // Convert USDC amount to atomic units (USDC has 6 decimals)
      const amountAtomic = Math.floor(amountUSDC * 1_000_000);
      
      // Calculate channel-based fee for accurate preview
      const validChannel = (['swipe', 'discovery', 'positions'].includes(channel) ? channel : 'discovery') as FeeChannel;
      const { feeUSDC, feeBps, feeScale } = calculateSwayFee(amountUSDC, validChannel);

      // Get quote from DFlow WITH platform fee to get accurate numbers
      const quoteResponse = await getPondQuote(
        SOLANA_TOKENS.USDC,
        outputMint,
        amountAtomic,
        userPublicKey,
        slippageBps,
        DFLOW_API_KEY || undefined,
        feeScale > 0 ? {
          platformFeeScale: feeScale,
          feeAccount: FEE_CONFIG.FEE_RECIPIENT,
          referralAccount: FEE_CONFIG.FEE_WALLET,
        } : undefined
      );

      const quote = quoteResponse.quote;
      const dflowFeeInfo = (quoteResponse as any).platformFee;
      
      // Parse actual amounts from DFlow quote
      const actualInAmount = quote?.inAmount ? parseInt(quote.inAmount) / 1_000_000 : amountUSDC;
      const actualOutAmount = quote?.outAmount ? parseInt(quote.outAmount) / 1_000_000 : 0;
      const priceImpactPct = quote?.priceImpactPct ? parseFloat(quote.priceImpactPct) : 0;
      const actualPlatformFeeUSDC = dflowFeeInfo?.amount ? parseInt(dflowFeeInfo.amount) / 1_000_000 : feeUSDC;
      
      // Calculate effective price per share
      const effectivePricePerShare = actualOutAmount > 0 ? actualInAmount / actualOutAmount : 0;
      
      console.log('[Pond Quote Preview] Accurate quote data:', {
        channel: validChannel,
        inputUSDC: actualInAmount,
        expectedShares: actualOutAmount,
        platformFee: actualPlatformFeeUSDC,
        priceImpact: priceImpactPct
      });

      res.json({
        quote,
        marketId,
        side,
        outputMint,
        inputMint: SOLANA_TOKENS.USDC,
        // Accurate cost breakdown for UI
        costBreakdown: {
          inputUSDC: actualInAmount,           // Actual USDC being spent
          expectedShares: actualOutAmount,     // Accurate expected shares
          platformFeeUSDC: actualPlatformFeeUSDC, // Actual platform fee
          priceImpactPct,                      // Market impact percentage
          effectivePricePerShare,              // True cost per share
          channel: validChannel,
        },
      });
    } catch (error: any) {
      console.error('Error getting Pond quote:', error);
      res.status(500).json({ error: error.message || 'Failed to get quote' });
    }
  });

  // New endpoint that accepts token mints directly (client fetches them to bypass 403)
  // Accepts optional 'channel' parameter for channel-based fees (swipe, discovery, positions)
  app.post('/api/pond/order', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { inputMint, outputMint, amountUSDC, userPublicKey, slippageBps = 100, channel = 'swipe' } = req.body;

      if (!inputMint || !outputMint || !amountUSDC || !userPublicKey) {
        return res.status(400).json({ error: 'Missing required fields: inputMint, outputMint, amountUSDC, userPublicKey' });
      }

      // Convert USDC amount to atomic units (USDC has 6 decimals)
      const amountAtomic = Math.floor(amountUSDC * 1_000_000);
      
      // Calculate channel-based fee (fee is deducted from wager by DFlow)
      const validChannel = (['swipe', 'discovery', 'positions'].includes(channel) ? channel : 'swipe') as FeeChannel;
      const { feeUSDC, feeBps, feeScale } = calculateSwayFee(amountUSDC, validChannel);

      console.log('[Pond Order] Getting order for:', { 
        inputMint, outputMint, amountAtomic, userPublicKey,
        channel: validChannel, feeScale, feeBps, feeUSDC: feeUSDC.toFixed(4)
      });

      // Get order from DFlow with platform fee
      // For prediction market trades (async), use platformFeeScale instead of platformFeeBps
      // Fee is collected in USDC (settlement mint) and sent to our fee account
      console.log('[Pond Order] Requesting order with fee:', { feeScale, feeBps, feeUSDC: feeUSDC.toFixed(4), feeAccount: FEE_CONFIG.FEE_RECIPIENT });
      
      const orderResponse = await getPondQuote(
        inputMint,
        outputMint,
        amountAtomic,
        userPublicKey,
        slippageBps,
        DFLOW_API_KEY || undefined,
        feeScale > 0 ? {
          platformFeeScale: feeScale,  // Use feeScale for async prediction market trades
          feeAccount: FEE_CONFIG.FEE_RECIPIENT,
          referralAccount: FEE_CONFIG.FEE_WALLET,
        } : undefined
      );

      // Parse DFlow quote response for accurate numbers
      const dflowFeeInfo = (orderResponse as any).platformFee;
      const quote = orderResponse.quote;
      
      // Get actual amounts from DFlow quote (in atomic units, 6 decimals)
      const actualInAmount = quote?.inAmount ? parseInt(quote.inAmount) / 1_000_000 : amountUSDC;
      const actualOutAmount = quote?.outAmount ? parseInt(quote.outAmount) / 1_000_000 : 0;
      const priceImpactPct = quote?.priceImpactPct ? parseFloat(quote.priceImpactPct) : 0;
      
      // Get actual platform fee from DFlow response (in microUSDC)
      const actualPlatformFeeUSDC = dflowFeeInfo?.amount ? parseInt(dflowFeeInfo.amount) / 1_000_000 : feeUSDC;
      const actualFeeBps = dflowFeeInfo?.feeBps || feeBps;
      
      // Calculate effective price per share (what user actually pays per share)
      const effectivePricePerShare = actualOutAmount > 0 ? actualInAmount / actualOutAmount : 0;
      
      // Calculate total cost (USDC in + estimated gas in USD)
      const estimatedGasUSD = 0.02; // Rough estimate for Solana gas
      const totalCostUSDC = actualInAmount + estimatedGasUSD;
      
      console.log('[Pond Order] Response received, has transaction:', !!orderResponse.transaction);
      console.log('[Pond Order] DFlow platformFee response:', dflowFeeInfo || 'not included in response');
      console.log('[Pond Order] Accurate quote data:', {
        actualInAmount,
        actualOutAmount,
        actualPlatformFeeUSDC,
        priceImpactPct,
        effectivePricePerShare: effectivePricePerShare.toFixed(4)
      });

      res.json({
        transaction: orderResponse.transaction,
        quote: orderResponse.quote,
        executionMode: orderResponse.executionMode,
        // Accurate cost breakdown for UI
        costBreakdown: {
          inputUSDC: actualInAmount,           // Actual USDC being spent
          expectedShares: actualOutAmount,     // Accurate expected shares from DFlow
          platformFeeUSDC: actualPlatformFeeUSDC, // Actual platform fee
          priceImpactPct,                      // Market impact
          effectivePricePerShare,              // True cost per share
          estimatedGasUSD,                     // Est. gas in USD
          totalCostUSDC,                       // Total all-in cost
        },
        platformFee: {
          channel: validChannel,
          feeUSDC: actualPlatformFeeUSDC,
          feeBps: actualFeeBps,
          feeRecipient: FEE_CONFIG.FEE_RECIPIENT,
        },
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

  // Check if a market position can be redeemed (market settled)
  app.get('/api/pond/redemption-status/:outcomeMint', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { outcomeMint } = req.params;
      const status = await checkRedemptionStatus(outcomeMint);
      res.json(status);
    } catch (error: any) {
      console.error('Error checking redemption status:', error);
      res.status(500).json({ error: error.message || 'Failed to check redemption status' });
    }
  });

  // Redeem endpoint - redeems winning outcome tokens from settled markets
  // Uses 'positions' channel fee (0.25%) since redemption is a position management action
  app.post('/api/pond/redeem', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { outcomeMint, shares, userPublicKey, slippageBps = 100 } = req.body;

      if (!outcomeMint || !shares || !userPublicKey) {
        return res.status(400).json({ error: 'Missing required fields: outcomeMint, shares, userPublicKey' });
      }

      // Convert shares to atomic units (outcome tokens have 6 decimals)
      const amountAtomic = Math.floor(shares * 1_000_000);
      
      // Calculate positions channel fee for redemption (each share = $1)
      // For redemption, fee is taken from output USDC, so we don't need grossInput
      const estimatedUSDC = shares;
      const { feeUSDC, feeBps, feeScale } = calculateSwayFee(estimatedUSDC, 'positions');

      console.log('[Pond Redeem] Redeeming tokens:', { 
        outcomeMint, shares, amountAtomic, userPublicKey,
        feeScale, feeBps, feeUSDC: feeUSDC.toFixed(4)
      });

      // For redemption, input is outcome token, output is USDC
      // Use platformFeeScale for async prediction market trades
      const orderResponse = await getPondQuote(
        outcomeMint,
        SOLANA_TOKENS.USDC,
        amountAtomic,
        userPublicKey,
        slippageBps,
        DFLOW_API_KEY || undefined,
        {
          platformFeeScale: feeScale,
          feeAccount: FEE_CONFIG.FEE_RECIPIENT,
          referralAccount: FEE_CONFIG.FEE_WALLET,
        }
      );

      // Log platform fee from DFlow response
      const dflowFeeInfo = (orderResponse as any).platformFee;
      console.log('[Pond Redeem] Order received, executionMode:', orderResponse.executionMode);
      console.log('[Pond Redeem] DFlow platformFee response:', dflowFeeInfo || 'not included in response');

      res.json({
        transaction: orderResponse.transaction,
        quote: orderResponse.quote,
        executionMode: orderResponse.executionMode,
        platformFee: {
          channel: 'positions' as FeeChannel,
          feeUSDC,
          feeBps,
          feeRecipient: FEE_CONFIG.FEE_RECIPIENT,
        },
      });
    } catch (error: any) {
      console.error('Error getting redemption order:', error);
      res.status(500).json({ error: error.message || 'Failed to get redemption order' });
    }
  });

  // Sell quote endpoint - returns expected proceeds WITHOUT executing
  // This allows users to see what they'll receive before confirming
  app.post('/api/pond/sell-quote', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { marketId, side, shares, userPublicKey, slippageBps = 300 } = req.body;

      if (!marketId || !side || !shares || !userPublicKey) {
        return res.status(400).json({ error: 'Missing required fields: marketId, side, shares, userPublicKey' });
      }

      // Get market tokens
      const marketTokens = await getMarketTokens(marketId);
      if (!marketTokens) {
        return res.status(400).json({ error: 'Market not available for trading on Pond/DFlow' });
      }

      // Input is the outcome token, output is USDC
      const inputMint = side === 'yes' ? marketTokens.yesMint : marketTokens.noMint;
      const outputMint = SOLANA_TOKENS.USDC;

      // Convert shares to atomic units (outcome tokens have 6 decimals like USDC)
      const amountAtomic = Math.floor(shares * 1_000_000);

      console.log('[Pond Sell Quote] Getting quote:', { marketId, side, shares, amountAtomic });

      // Get quote from DFlow
      const orderResponse = await getPondQuote(
        inputMint,
        outputMint,
        amountAtomic,
        userPublicKey,
        slippageBps,
        DFLOW_API_KEY || undefined,
        {
          platformFeeScale: 3, // 0.25% fee for positions channel
          feeAccount: FEE_CONFIG.FEE_RECIPIENT,
          referralAccount: FEE_CONFIG.FEE_WALLET,
        }
      );

      // Calculate expected USDC from quote
      // DFlow API returns these fields at the root level, not under .quote
      const rawResponse = orderResponse as any;
      const outAmount = parseInt(rawResponse.outAmount || rawResponse.quote?.outAmount || '0');
      const expectedUSDC = outAmount / 1_000_000;
      const priceImpactPct = parseFloat(rawResponse.priceImpactPct || rawResponse.quote?.priceImpactPct || '0');
      const pricePerShare = shares > 0 ? expectedUSDC / shares : 0;

      // Calculate estimated fees (DFlow taker fee formula: 0.09 * p * (1-p) * contracts)
      // Since we're selling, p = pricePerShare
      const estimatedDFlowFee = 0.09 * pricePerShare * (1 - pricePerShare) * shares;
      const platformFeeBps = 25; // 0.25% for positions channel
      const grossValue = shares * pricePerShare;
      const platformFee = grossValue * (platformFeeBps / 10000);
      const totalFees = estimatedDFlowFee + platformFee;
      
      // Get live orderbook prices from cache (marketTokens already fetched above)
      let orderbook = { yesBid: 0, yesAsk: 0, noBid: 0, noAsk: 0 };
      // Try to get from DFlow markets cache
      const cachedMarkets = getMarketCache();
      if (cachedMarkets && cachedMarkets.length > 0) {
        const market = cachedMarkets.find((m) => m.id === marketId);
        if (market) {
          orderbook = {
            yesBid: market.yesBid || 0,
            yesAsk: market.yesAsk || 0,
            noBid: market.noBid || 0,
            noAsk: market.noAsk || 0
          };
        }
      }
      
      console.log('[Pond Sell Quote] Quote received:', {
        expectedUSDC,
        priceImpactPct,
        pricePerShare,
        executionMode: orderResponse.executionMode,
        totalFees,
        grossValue,
        orderbook
      });

      // Check if we have a production API key (any non-empty key)
      const isProduction = Boolean(DFLOW_API_KEY && DFLOW_API_KEY.trim().length > 0);
      res.json({
        expectedUSDC,
        priceImpactPct,
        pricePerShare,
        shares,
        executionMode: orderResponse.executionMode,
        warning: priceImpactPct > 5 ? 'High price impact detected. This market may have low liquidity.' : null,
        isProduction,
        feeBreakdown: {
          grossValue: grossValue,
          totalFees: totalFees,
          netAmount: expectedUSDC
        },
        orderbook
      });
    } catch (error: any) {
      console.error('Error getting sell quote:', error);
      res.status(500).json({ error: error.message || 'Failed to get sell quote' });
    }
  });

  // Sell endpoint - converts outcome tokens back to USDC
  // Uses 'positions' channel fee by default (0.25%)
  app.post('/api/pond/sell', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { marketId, side, shares, userPublicKey, slippageBps = 300, channel = 'positions' } = req.body;

      if (!marketId || !side || !shares || !userPublicKey) {
        return res.status(400).json({ error: 'Missing required fields: marketId, side, shares, userPublicKey' });
      }

      // Get market tokens
      const marketTokens = await getMarketTokens(marketId);
      if (!marketTokens) {
        return res.status(400).json({ error: 'Market not available for trading on Pond/DFlow' });
      }

      // Input is the outcome token, output is USDC
      const inputMint = side === 'yes' ? marketTokens.yesMint : marketTokens.noMint;
      const outputMint = SOLANA_TOKENS.USDC;

      // Convert shares to atomic units (outcome tokens have 6 decimals like USDC)
      const amountAtomic = Math.floor(shares * 1_000_000);

      console.log('[Pond Sell] Selling position:', { marketId, side, shares, amountAtomic, inputMint, outputMint, userPublicKey });
      
      // Check if user actually has the outcome tokens in their wallet
      const HELIUS_API_KEY_CHECK = process.env.HELIUS_API_KEY || '';
      const HELIUS_RPC = HELIUS_API_KEY_CHECK 
        ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY_CHECK}`
        : 'https://api.mainnet-beta.solana.com';
      
      try {
        const tokenCheckResponse = await fetch(HELIUS_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTokenAccountsByOwner',
            params: [
              userPublicKey,
              { mint: inputMint },
              { encoding: 'jsonParsed' }
            ]
          })
        });
        const tokenData = await tokenCheckResponse.json() as any;
        
        let tokenBalance = 0;
        if (tokenData.result?.value) {
          for (const account of tokenData.result.value) {
            const tokenAmount = account.account?.data?.parsed?.info?.tokenAmount;
            if (tokenAmount) {
              tokenBalance += parseFloat(tokenAmount.uiAmountString || '0');
            }
          }
        }
        
        console.log('[Pond Sell] User token balance for', inputMint, ':', tokenBalance);
        
        if (tokenBalance < shares) {
          console.log('[Pond Sell] Insufficient token balance! User has', tokenBalance, 'but trying to sell', shares);
          // If user has SOME tokens, allow selling what they have
          if (tokenBalance > 0.01) {
            console.log('[Pond Sell] Adjusting sell amount to available balance:', tokenBalance);
            return res.status(400).json({ 
              error: `You only have ${tokenBalance.toFixed(2)} tokens available. Your async trade may have partially filled.`,
              tokenBalance,
              requiredBalance: shares,
              canSellAmount: tokenBalance,
              partialFill: true
            });
          }
          return res.status(400).json({ 
            error: `No tokens found in wallet. Your trade may still be processing - check order status.`,
            tokenBalance: 0,
            requiredBalance: shares
          });
        }
      } catch (tokenCheckError) {
        console.error('[Pond Sell] Token balance check failed:', tokenCheckError);
        // Continue anyway - the transaction will fail if tokens aren't there
      }

      // Calculate expected USDC from selling (estimate based on shares - will be refined by quote)
      // For sells, fee is taken from output USDC, so we don't need grossInput
      const estimatedUSDC = shares; // Approximate, actual quote may differ
      
      // Calculate channel-based fee for sell
      const validChannel = (['swipe', 'discovery', 'positions'].includes(channel) ? channel : 'positions') as FeeChannel;
      const { feeUSDC, feeBps, feeScale } = calculateSwayFee(estimatedUSDC, validChannel);
      
      console.log('[Pond Sell] Fee calculation:', { channel: validChannel, feeScale, feeBps, feeUSDC: feeUSDC.toFixed(4) });

      // Get sell order from DFlow (swap outcome tokens -> USDC) with platform fee
      // Use platformFeeScale for async prediction market trades
      const orderResponse = await getPondQuote(
        inputMint,
        outputMint,
        amountAtomic,
        userPublicKey,
        slippageBps,
        DFLOW_API_KEY || undefined,
        {
          platformFeeScale: feeScale,
          feeAccount: FEE_CONFIG.FEE_RECIPIENT,
          referralAccount: FEE_CONFIG.FEE_WALLET,
        }
      );

      // Log platform fee from DFlow response
      const dflowFeeInfo = (orderResponse as any).platformFee;
      console.log('[Pond Sell] Response received, has transaction:', !!orderResponse.transaction);
      console.log('[Pond Sell] DFlow platformFee response:', dflowFeeInfo || 'not included in response');
      console.log('[Pond Sell] Expected USDC out:', orderResponse.quote?.outAmount ? parseInt(orderResponse.quote.outAmount) / 1_000_000 : 'unknown');

      res.json({
        transaction: orderResponse.transaction,
        quote: orderResponse.quote,
        executionMode: orderResponse.executionMode,
        expectedUSDC: orderResponse.quote?.outAmount ? parseInt(orderResponse.quote.outAmount) / 1_000_000 : 0,
        platformFee: {
          channel: validChannel,
          feeUSDC,
          feeBps,
          feeRecipient: FEE_CONFIG.FEE_RECIPIENT,
        },
      });
    } catch (error: any) {
      console.error('Error getting Pond sell order:', error);
      res.status(500).json({ error: error.message || 'Failed to get sell order' });
    }
  });

  // Helius RPC endpoint for Solana
  const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';
  const HELIUS_RPC_URL = HELIUS_API_KEY 
    ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
    : 'https://api.mainnet-beta.solana.com';
  
  console.log(`[Solana RPC] Using ${HELIUS_API_KEY ? 'Helius' : 'public Solana'} RPC`);

  // Solana balance endpoint using Helius RPC
  app.get('/api/solana/balance/:address', async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      
      if (!address) {
        return res.status(400).json({ error: 'Missing wallet address' });
      }

      // Check if we have Helius key - if not, return a clear error
      if (!HELIUS_API_KEY) {
        console.error('[Solana RPC] HELIUS_API_KEY not configured - public RPC may be rate limited');
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
      
      if (!solResponse.ok) {
        console.error(`[Solana RPC] SOL balance request failed: ${solResponse.status} ${solResponse.statusText}`);
        return res.status(503).json({ 
          error: 'RPC endpoint unavailable', 
          details: `Status ${solResponse.status}`,
          rpc: HELIUS_API_KEY ? 'helius' : 'public'
        });
      }
      
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
      
      if (!usdcResponse.ok) {
        console.error(`[Solana RPC] USDC balance request failed: ${usdcResponse.status}`);
        // Return SOL balance even if USDC fails
        console.log(`[Helius] Partial balance for ${address}: ${solBalance} SOL, USDC failed`);
        return res.json({ solBalance, usdcBalance: 0 });
      }
      
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
      console.error('[Helius] Balance fetch error:', error.message);
      res.status(500).json({ 
        error: 'Failed to fetch balance', 
        details: error.message,
        rpc: HELIUS_API_KEY ? 'helius' : 'public'
      });
    }
  });

  // CoinGecko price proxy with caching (to avoid CORS and rate limits)
  let cachedSolPrice = { usd: 130, timestamp: 0 };
  const PRICE_CACHE_TTL = 60000; // 1 minute cache
  
  app.get('/api/price/sol', async (_req: Request, res: Response) => {
    try {
      const now = Date.now();
      
      // Return cached price if still valid
      if (now - cachedSolPrice.timestamp < PRICE_CACHE_TTL) {
        return res.json({ solana: { usd: cachedSolPrice.usd } });
      }
      
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) {
        // On rate limit, return cached price (even if stale)
        if (cachedSolPrice.usd > 0) {
          return res.json({ solana: { usd: cachedSolPrice.usd } });
        }
        return res.status(response.status).json({ error: 'Failed to fetch SOL price' });
      }
      
      const data = await response.json() as any;
      const solPrice = data.solana?.usd || cachedSolPrice.usd;
      
      // Update cache
      cachedSolPrice = { usd: solPrice, timestamp: now };
      
      res.json({ solana: { usd: solPrice } });
    } catch (error: any) {
      // On error, return cached price
      if (cachedSolPrice.usd > 0) {
        return res.json({ solana: { usd: cachedSolPrice.usd } });
      }
      console.error('[CoinGecko] Price fetch error:', error.message);
      res.status(500).json({ error: 'Failed to fetch SOL price' });
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
          'User-Agent': 'SWAY-Prediction-Markets/1.0',
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

  // AI Market Insights endpoint - uses Perplexity for real-time web search
  app.post('/api/ai/market-insight', async (req: Request, res: Response) => {
    try {
      const { marketTitle, category, yesPrice, noPrice } = req.body;
      
      if (!marketTitle) {
        return res.status(400).json({ error: 'Market title required' });
      }
      
      const yesPercent = Math.round((yesPrice || 0.5) * 100);
      
      // Use Perplexity API for real-time web search
      const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            {
              role: 'system',
              content: 'You are a market research assistant. Provide brief, factual, up-to-date context. In 1-2 sentences, share recent news or developments. Be neutral and factual.'
            },
            {
              role: 'user',
              content: `What is the latest news about: ${marketTitle}? Give me the most recent developments in 1-2 sentences.`
            }
          ],
          max_tokens: 150,
          temperature: 0.2,
          search_recency_filter: 'month',
          stream: false,
        }),
      });
      
      if (!perplexityResponse.ok) {
        const errorText = await perplexityResponse.text();
        console.error('[Perplexity] API error:', perplexityResponse.status, errorText);
        throw new Error(`Perplexity API error: ${perplexityResponse.status}`);
      }
      
      const data = await perplexityResponse.json();
      const insight = data.choices?.[0]?.message?.content || 'No insight available';
      
      res.json({ insight });
    } catch (error: any) {
      console.error('[AI Insight] Error:', error);
      res.status(500).json({ error: 'Failed to generate insight', fallback: 'Check out the latest news to form your own view!' });
    }
  });

  return httpServer;
}
