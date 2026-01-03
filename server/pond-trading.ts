// DFlow Production API endpoints (requires DFLOW_API_KEY)
// Production endpoints: b.quote-api.dflow.net and b.prediction-markets-api.dflow.net
const DFLOW_API_KEY = process.env.DFLOW_API_KEY;
const DFLOW_API_BASE = DFLOW_API_KEY 
  ? 'https://b.quote-api.dflow.net' 
  : 'https://dev-quote-api.dflow.net';
const POND_METADATA_API = DFLOW_API_KEY 
  ? 'https://b.prediction-markets-api.dflow.net' 
  : 'https://dev-prediction-markets-api.dflow.net';

console.log('[DFlow] Using API base:', DFLOW_API_BASE, DFLOW_API_KEY ? '(production with API key)' : '(dev - no API key)');

// Cache for available DFlow market tickers
let dflowMarketCache: Set<string> | null = null;
let dflowMarketCacheTime: number = 0;
const DFLOW_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Persistent cache for market tokens (survives API outages)
// This allows trades to proceed even when DFlow metadata API returns 503
const marketTokenCache: Map<string, { yesMint: string; noMint: string; isInitialized: boolean; cachedAt: number }> = new Map();
const MARKET_TOKEN_CACHE_TTL = 30 * 60 * 1000; // 30 minutes - tokens don't change often

export interface PondQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  slippageBps: number;
  executionMode: 'sync' | 'async';
  transaction: string;
}

export interface PondOrderResponse {
  quote: PondQuote;
  transaction: string;
  executionMode: 'sync' | 'async';
}

export interface PondMarketToken {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  marketId: string;
  outcome: 'yes' | 'no';
}

export interface PlatformFeeParams {
  platformFeeBps?: number;     // Fee in basis points for sync swaps (e.g., 75 = 0.75%)
  platformFeeScale?: number;   // Fee scale for async prediction market swaps (e.g., 50 = 5%)
  feeAccount?: string;         // USDC token account to receive fees
  referralAccount?: string;    // Wallet address to auto-create fee account if needed
}

export async function getPondQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
  userPublicKey: string,
  slippageBps: number = 100,
  apiKey?: string,
  feeParams?: PlatformFeeParams
): Promise<PondOrderResponse> {
  const queryParams = new URLSearchParams();
  queryParams.append('inputMint', inputMint);
  queryParams.append('outputMint', outputMint);
  queryParams.append('amount', amount.toString()); // DFlow requires 'amount'
  queryParams.append('slippageBps', slippageBps.toString());
  queryParams.append('userPublicKey', userPublicKey);
  
  // Add platform fee parameters if provided
  // For async prediction market trades, use platformFeeScale (not platformFeeBps)
  // See: https://pond.dflow.net/quickstart/platform-fees
  // platformFeeScale: 3 decimals, e.g., 50 = 0.050 = 5%, 10 = 0.010 = 1%
  if (feeParams?.platformFeeScale && feeParams.platformFeeScale > 0) {
    // Use platformFeeScale for prediction market (async) trades
    queryParams.append('platformFeeScale', feeParams.platformFeeScale.toString());
    if (feeParams.feeAccount) {
      queryParams.append('feeAccount', feeParams.feeAccount);
    }
    if (feeParams.referralAccount) {
      queryParams.append('referralAccount', feeParams.referralAccount);
    }
  } else if (feeParams?.platformFeeBps && feeParams.platformFeeBps > 0) {
    // Fallback to platformFeeBps for sync swaps (non-prediction market)
    queryParams.append('platformFeeBps', feeParams.platformFeeBps.toString());
    if (feeParams.feeAccount) {
      queryParams.append('feeAccount', feeParams.feeAccount);
    }
    if (feeParams.referralAccount) {
      queryParams.append('referralAccount', feeParams.referralAccount);
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  // Use provided apiKey or fall back to environment variable
  const effectiveApiKey = apiKey || DFLOW_API_KEY;
  if (effectiveApiKey) {
    headers['x-api-key'] = effectiveApiKey;
  }

  console.log('[Pond] Order request with fee params:', {
    inputMint: inputMint.slice(0, 8) + '...',
    outputMint: outputMint.slice(0, 8) + '...',
    amount,
    platformFeeScale: feeParams?.platformFeeScale || 0,
    platformFeeBps: feeParams?.platformFeeBps || 0,
    feeAccount: feeParams?.feeAccount?.slice(0, 8) + '...' || 'none'
  });

  // DFlow API uses /order endpoint directly (NOT /api/v1/order)
  const orderUrl = `${DFLOW_API_BASE}/order?${queryParams.toString()}`;
  console.log('[Pond] Calling quote API:', orderUrl.split('?')[0]);
  
  const response = await fetch(orderUrl, { headers });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DFlow API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  console.log('[Pond] DFlow API response keys:', Object.keys(data));
  console.log('[Pond] DFlow API response (truncated):', JSON.stringify(data).slice(0, 500));
  return data;
}

export async function getMarketTokens(marketId: string): Promise<{ yesMint: string; noMint: string; isInitialized: boolean } | null> {
  const url = `${POND_METADATA_API}/api/v1/market/${marketId}`;
  console.log('[Pond] Fetching market tokens from:', url);
  
  // Check cache first (serves as fallback during API outages)
  const cached = marketTokenCache.get(marketId);
  const now = Date.now();
  if (cached && (now - cached.cachedAt) < MARKET_TOKEN_CACHE_TTL) {
    console.log('[Pond] Using cached market tokens for', marketId);
    return { yesMint: cached.yesMint, noMint: cached.noMint, isInitialized: cached.isInitialized };
  }
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = process.env.DFLOW_API_KEY;
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  
  // Retry with exponential backoff for transient 503 errors
  const maxRetries = 3;
  let lastError: string = '';
  let apiUnavailable = false;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, { headers });
      
      if (response.ok) {
        // Success - continue with parsing
        const data = await response.json();
        console.log('[Pond] Market data received:', JSON.stringify(data).slice(0, 500));
        
        const accounts = data.accounts || {};
        const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        let settlementData = accounts[USDC_MINT];
        
        if (!settlementData) {
          for (const [mintKey, mintData] of Object.entries(accounts)) {
            if (mintData && typeof mintData === 'object' && (mintData as any).yesMint && (mintData as any).noMint) {
              settlementData = mintData;
              console.log('[Pond] Using settlement mint:', mintKey);
              break;
            }
          }
        }
        
        if (!settlementData) {
          console.error('[Pond] No settlement mint data found. Accounts:', JSON.stringify(accounts));
          return null;
        }
        
        const { yesMint, noMint, isInitialized } = settlementData as { yesMint: string; noMint: string; isInitialized: boolean };
        
        if (!yesMint || !noMint) {
          console.error('[Pond] Market tokens not found in settlement data:', JSON.stringify(settlementData));
          return null;
        }
        
        console.log('[Pond] Found token mints - YES:', yesMint, 'NO:', noMint, 'isInitialized:', isInitialized);
        
        // Cache the successful result
        marketTokenCache.set(marketId, { yesMint, noMint, isInitialized: isInitialized ?? false, cachedAt: now });
        
        return { yesMint, noMint, isInitialized: isInitialized ?? false };
      }
      
      // Handle retryable errors (503, 502, 500)
      if (response.status >= 500) {
        apiUnavailable = true;
        if (attempt < maxRetries - 1) {
          const waitTime = Math.pow(2, attempt) * 500; // 500ms, 1000ms, 2000ms
          console.log(`[Pond] Got ${response.status}, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }
      
      // Non-retryable error or max retries reached
      lastError = await response.text();
      console.error('[Pond] Failed to fetch market tokens:', response.status, lastError);
    } catch (error) {
      apiUnavailable = true;
      console.error('[Pond] Error fetching market tokens (attempt', attempt + 1, '):', error);
      if (attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt) * 500;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
    }
  }
  
  // API is unavailable - try using stale cache as fallback
  if (apiUnavailable && cached) {
    console.log('[Pond] API unavailable, using stale cached tokens for', marketId, '(cached', Math.round((now - cached.cachedAt) / 1000), 'seconds ago)');
    return { yesMint: cached.yesMint, noMint: cached.noMint, isInitialized: cached.isInitialized };
  }
  
  console.error('[Pond] Max retries exceeded for market tokens and no cache available');
  return null;
}

// Fetch all available markets from DFlow and cache them
export async function getAvailableDflowMarkets(): Promise<Set<string>> {
  const now = Date.now();
  
  // Return cached data if still valid
  if (dflowMarketCache && (now - dflowMarketCacheTime) < DFLOW_CACHE_TTL) {
    return dflowMarketCache;
  }
  
  console.log('[Pond] Fetching all available DFlow markets with pagination...');
  const marketTickers = new Set<string>();
  
  try {
    // Fetch events with nested markets - paginate to get ALL available markets
    let offset = 0;
    const pageSize = 500;
    let hasMore = true;
    
    const metadataHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    const metadataApiKey = process.env.DFLOW_API_KEY;
    if (metadataApiKey) {
      metadataHeaders['x-api-key'] = metadataApiKey;
    }
    
    while (hasMore) {
      const response = await fetch(
        `${POND_METADATA_API}/api/v1/events?withNestedMarkets=true&status=active&limit=${pageSize}&offset=${offset}`,
        { headers: metadataHeaders }
      );
      
      if (!response.ok) {
        console.error('[Pond] Failed to fetch DFlow events:', response.status);
        break;
      }
      
      const data = await response.json();
      const events = data.events || [];
      
      // Extract all market tickers
      for (const event of events) {
        if (event.markets && Array.isArray(event.markets)) {
          for (const market of event.markets) {
            if (market.ticker) {
              marketTickers.add(market.ticker);
            }
          }
        }
      }
      
      // Check if we should fetch more
      if (events.length < pageSize) {
        hasMore = false;
      } else {
        offset += pageSize;
        // Safety limit to prevent infinite loops
        if (offset > 10000) {
          hasMore = false;
        }
      }
    }
    
    console.log(`[Pond] Found ${marketTickers.size} markets from events endpoint`);
    
    // Also fetch from direct markets endpoint with pagination
    offset = 0;
    hasMore = true;
    
    while (hasMore) {
      try {
        const marketsResponse = await fetch(
          `${POND_METADATA_API}/api/v1/markets?status=active&limit=${pageSize}&offset=${offset}`,
          { headers: metadataHeaders }
        );
        
        if (marketsResponse.ok) {
          const marketsData = await marketsResponse.json();
          const markets = marketsData.markets || marketsData || [];
          if (Array.isArray(markets)) {
            for (const market of markets) {
              if (market.ticker) {
                marketTickers.add(market.ticker);
              }
            }
            
            // Check if we should fetch more
            if (markets.length < pageSize) {
              hasMore = false;
            } else {
              offset += pageSize;
              // Safety limit
              if (offset > 10000) {
                hasMore = false;
              }
            }
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      } catch (err) {
        hasMore = false;
      }
    }
    
    console.log(`[Pond] Found ${marketTickers.size} total available markets on DFlow`);
    
    // Update cache
    dflowMarketCache = marketTickers;
    dflowMarketCacheTime = now;
    
    return marketTickers;
  } catch (error) {
    console.error('[Pond] Error fetching DFlow markets:', error);
    return dflowMarketCache || new Set();
  }
}

// Check if a specific market is available on DFlow
export async function isMarketAvailableOnDflow(marketId: string): Promise<boolean> {
  const availableMarkets = await getAvailableDflowMarkets();
  return availableMarkets.has(marketId);
}

export async function getOrderStatus(signature: string, apiKey?: string): Promise<any> {
  const headers: Record<string, string> = {};
  const effectiveApiKey = apiKey || DFLOW_API_KEY;
  if (effectiveApiKey) {
    headers['x-api-key'] = effectiveApiKey;
  }

  const response = await fetch(
    `${DFLOW_API_BASE}/order-status?signature=${signature}`,
    { headers }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Order status error: ${response.status} - ${error}`);
  }

  return response.json();
}

export interface RedemptionStatus {
  isRedeemable: boolean;
  marketStatus: string;
  result: string;
  redemptionStatus: string;
  outcomeMint: string;
  settlementMint: string;
  scalarOutcomePct?: number;
  marketTitle?: string;
}

export async function checkRedemptionStatus(
  outcomeMint: string
): Promise<RedemptionStatus> {
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  
  try {
    const url = `${POND_METADATA_API}/api/v1/market/by-mint/${outcomeMint}`;
    console.log('[Pond] Checking redemption status:', url);
    
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (DFLOW_API_KEY) {
      headers['x-api-key'] = DFLOW_API_KEY;
    }
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      console.error('[Pond] Failed to check redemption status:', response.status);
      return {
        isRedeemable: false,
        marketStatus: 'unknown',
        result: '',
        redemptionStatus: 'unknown',
        outcomeMint,
        settlementMint: USDC_MINT,
      };
    }
    
    const market = await response.json();
    console.log('[Pond] Market status:', market.status, 'Result:', market.result);
    
    // Check if market is determined or finalized
    if (market.status !== 'determined' && market.status !== 'finalized') {
      return {
        isRedeemable: false,
        marketStatus: market.status || 'active',
        result: market.result || '',
        redemptionStatus: 'not_settled',
        outcomeMint,
        settlementMint: USDC_MINT,
        marketTitle: market.title,
      };
    }
    
    // Check USDC account for redemption status
    const accounts = market.accounts || {};
    const usdcAccount = accounts[USDC_MINT];
    
    if (!usdcAccount) {
      return {
        isRedeemable: false,
        marketStatus: market.status,
        result: market.result || '',
        redemptionStatus: 'no_usdc_account',
        outcomeMint,
        settlementMint: USDC_MINT,
        marketTitle: market.title,
      };
    }
    
    const result = market.result; // "yes", "no", or "" for scalar
    let isRedeemable = false;
    
    if (usdcAccount.redemptionStatus === 'open') {
      // Case 1: Standard determined outcome (result is "yes" or "no")
      if (result === 'yes' || result === 'no') {
        if ((result === 'yes' && usdcAccount.yesMint === outcomeMint) ||
            (result === 'no' && usdcAccount.noMint === outcomeMint)) {
          isRedeemable = true;
        }
      }
      // Case 2: Scalar outcome (result is empty, use scalarOutcomePct)
      else if (result === '' && usdcAccount.scalarOutcomePct !== null && usdcAccount.scalarOutcomePct !== undefined) {
        if (usdcAccount.yesMint === outcomeMint || usdcAccount.noMint === outcomeMint) {
          isRedeemable = true;
        }
      }
    }
    
    console.log('[Pond] Redemption check result:', { isRedeemable, result, redemptionStatus: usdcAccount.redemptionStatus });
    
    return {
      isRedeemable,
      marketStatus: market.status,
      result: result || '',
      redemptionStatus: usdcAccount.redemptionStatus || 'unknown',
      outcomeMint,
      settlementMint: USDC_MINT,
      scalarOutcomePct: usdcAccount.scalarOutcomePct,
      marketTitle: market.title,
    };
  } catch (error) {
    console.error('[Pond] Error checking redemption status:', error);
    return {
      isRedeemable: false,
      marketStatus: 'error',
      result: '',
      redemptionStatus: 'error',
      outcomeMint,
      settlementMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    };
  }
}

export const SOLANA_TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};
