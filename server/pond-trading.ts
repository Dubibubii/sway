// DFlow Dev API endpoints for testing (will switch to prod once API keys are provided)
// Note: Using real capital on dev endpoints - be willing to lose test capital
const DFLOW_API_BASE = process.env.DFLOW_QUOTE_API_BASE || 'https://dev-quote-api.dflow.net';
const POND_METADATA_API = process.env.DFLOW_PREDICTION_API_BASE || 'https://dev-prediction-markets-api.dflow.net';

// Cache for available DFlow market tickers
let dflowMarketCache: Set<string> | null = null;
let dflowMarketCacheTime: number = 0;
const DFLOW_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
  platformFeeBps?: number;     // Fee in basis points (e.g., 75 = 0.75%)
  feeAccount?: string;         // USDC token account to receive fees
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
  queryParams.append('amount', amount.toString());
  queryParams.append('slippageBps', slippageBps.toString());
  queryParams.append('userPublicKey', userPublicKey);
  
  // Add platform fee parameters if provided
  // For outcome token trades, fee is always collected in settlement mint (USDC)
  if (feeParams?.platformFeeBps && feeParams.platformFeeBps > 0) {
    queryParams.append('platformFeeBps', feeParams.platformFeeBps.toString());
    if (feeParams.feeAccount) {
      queryParams.append('feeAccount', feeParams.feeAccount);
    }
    // Note: platformFeeMode parameter may not be supported by all API versions
    // DEV API may not support this parameter - only add if needed
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  console.log('[Pond] Order request with fee params:', {
    inputMint: inputMint.slice(0, 8) + '...',
    outputMint: outputMint.slice(0, 8) + '...',
    amount,
    platformFeeBps: feeParams?.platformFeeBps || 0,
    feeAccount: feeParams?.feeAccount?.slice(0, 8) + '...' || 'none'
  });

  const response = await fetch(
    `${DFLOW_API_BASE}/order?${queryParams.toString()}`,
    { headers }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DFlow API error: ${response.status} - ${error}`);
  }

  return response.json();
}

export async function getMarketTokens(marketId: string): Promise<{ yesMint: string; noMint: string; isInitialized: boolean } | null> {
  try {
    const url = `${POND_METADATA_API}/api/v1/market/${marketId}`;
    console.log('[Pond] Fetching market tokens from:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('[Pond] Failed to fetch market tokens:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    console.log('[Pond] Market data received:', JSON.stringify(data).slice(0, 500));
    
    // Token mints are nested under settlement mints in the accounts object
    // Structure: accounts: { "USDC_MINT": { yesMint, noMint, isInitialized }, ... }
    const accounts = data.accounts || {};
    
    // Look for USDC settlement mint first (preferred), then any other settlement mint
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    let settlementData = accounts[USDC_MINT];
    
    // If USDC not found, try to find any settlement mint with token data
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
    return { yesMint, noMint, isInitialized: isInitialized ?? false };
  } catch (error) {
    console.error('[Pond] Error fetching market tokens:', error);
    return null;
  }
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
    
    while (hasMore) {
      const response = await fetch(
        `${POND_METADATA_API}/api/v1/events?withNestedMarkets=true&status=active&limit=${pageSize}&offset=${offset}`,
        { headers: { 'Content-Type': 'application/json' } }
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
          { headers: { 'Content-Type': 'application/json' } }
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
  if (apiKey) {
    headers['x-api-key'] = apiKey;
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
    
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' }
    });
    
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
