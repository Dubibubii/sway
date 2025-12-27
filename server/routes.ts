import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getEvents, getMarkets, getMockMarkets, diversifyMarketFeed, getEventMarkets, searchAllMarkets, startBackgroundCacheRefresh, type SimplifiedMarket } from "./pond";
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

  // Start background cache refresh on server startup
  setTimeout(() => {
    console.log('Triggering initial market cache refresh...');
    startBackgroundCacheRefresh();
  }, 2000);

  app.get('/api/markets', async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Get up to 10,000 markets from cache
      let markets: SimplifiedMarket[] = await getEvents(10000);
      
      // Apply diversification (removes extreme probabilities, deduplicates, applies round-robin category rotation)
      // DO NOT re-sort after this - diversification already produces the optimal display order
      markets = diversifyMarketFeed(markets);
      
      // Return up to 400 diverse markets for discovery page
      const displayMarkets = markets.slice(0, 400);
      
      const uniqueCategories = Array.from(new Set(displayMarkets.map(m => m.category)));
      console.log('Markets: Total', displayMarkets.length, '- Categories:', uniqueCategories.join(', '));
      
      res.json({ markets: displayMarkets });
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
      
      // Return all matching markets for comprehensive search
      res.json({ markets: matchingMarkets });
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

      const { marketId, marketTitle, marketCategory, direction, wagerAmount, price, actualShares, signature, executionMode } = req.body;
      
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
      const newShares = actualShares 
        ? Math.round(parseFloat(actualShares) * 100) / 100
        : Math.round((netWagerAmount / price) * 100) / 100;
      
      console.log(`[Trade] Using shares: ${newShares} (actualShares provided: ${!!actualShares}, executionMode: ${executionMode || 'unknown'})`);
      
      // Warn if async trade didn't provide actual shares
      if (executionMode === 'async' && !actualShares) {
        console.warn(`[Trade] WARNING: Async trade recorded without actual fill data - shares may be inaccurate`);
      }
      const newEstimatedPayout = Math.round(newShares * 100) / 100;

      // Check if there's an existing open position for this market/direction
      const existingTrade = await storage.getOpenTradeForUserMarketDirection(req.userId, marketId, direction);
      
      if (existingTrade) {
        // Consolidate: update the existing position instead of creating a new one
        const existingWagerCents = existingTrade.wagerAmount;
        const existingShares = parseFloat(existingTrade.shares);
        const existingEntryFee = parseFloat(existingTrade.entryFee || '0');
        const existingPrice = parseFloat(existingTrade.price);
        
        // Calculate combined values
        const totalWagerCents = existingWagerCents + wagerAmountCents;
        const totalShares = existingShares + newShares;
        const totalEntryFee = existingEntryFee + entryFee;
        const totalEstimatedPayout = totalShares; // Each share pays $1 at settlement
        
        // Calculate weighted average price
        // Old cost basis: existingShares * existingPrice
        // New cost basis: newShares * price
        // Total cost = old + new, divide by total shares
        const oldCostBasis = existingShares * existingPrice;
        const newCostBasis = newShares * price;
        const weightedAvgPrice = (oldCostBasis + newCostBasis) / totalShares;
        
        console.log(`[Trade] Consolidating position: ${existingShares} shares @ $${existingPrice} + ${newShares} shares @ $${price} = ${totalShares} shares @ $${weightedAvgPrice.toFixed(2)}`);
        console.log(`[Trade] Entry fee: $${existingEntryFee.toFixed(4)} + $${entryFee.toFixed(4)} = $${totalEntryFee.toFixed(4)}`);

        const updatedTrade = await storage.updateTradePosition(existingTrade.id, {
          wagerAmount: totalWagerCents,
          shares: totalShares.toFixed(2),
          entryFee: totalEntryFee.toFixed(4),
          estimatedPayout: totalEstimatedPayout.toFixed(2),
          price: weightedAvgPrice.toFixed(2),
        });

        console.log(`[Trade] Position consolidated. Total wager: $${(totalWagerCents / 100).toFixed(2)}, Total shares: ${totalShares.toFixed(2)}`);
        
        res.json({ trade: updatedTrade, entryFee, feeRecipient: FEE_CONFIG.FEE_RECIPIENT, consolidated: true });
      } else {
        // No existing position - create new trade
        console.log(`Trade created: Entry fee of $${entryFee.toFixed(4)} (1%) collected. Recipient: ${FEE_CONFIG.FEE_RECIPIENT}`);

        const trade = await storage.createTrade({
          userId: req.userId,
          marketId,
          marketTitle: marketTitle || '',
          marketCategory: marketCategory || null,
          direction,
          wagerAmount: wagerAmountCents, // Store as cents (integer)
          price: price.toFixed(2),
          shares: newShares.toFixed(2),
          estimatedPayout: newEstimatedPayout.toFixed(2),
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

  // Sell endpoint - converts outcome tokens back to USDC
  app.post('/api/pond/sell', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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

      // Get sell order from DFlow (swap outcome tokens -> USDC)
      const orderResponse = await getPondQuote(
        inputMint,
        outputMint,
        amountAtomic,
        userPublicKey,
        slippageBps,
        DFLOW_API_KEY || undefined
      );

      console.log('[Pond Sell] Response received, has transaction:', !!orderResponse.transaction);
      console.log('[Pond Sell] Expected USDC out:', orderResponse.quote?.outAmount ? parseInt(orderResponse.quote.outAmount) / 1_000_000 : 'unknown');

      res.json({
        transaction: orderResponse.transaction,
        quote: orderResponse.quote,
        executionMode: orderResponse.executionMode,
        expectedUSDC: orderResponse.quote?.outAmount ? parseInt(orderResponse.quote.outAmount) / 1_000_000 : 0,
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

  return httpServer;
}
