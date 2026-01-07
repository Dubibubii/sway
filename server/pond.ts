const KALSHI_BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2';

// DFlow Prediction Market Metadata API - for cleaner market discovery
// Use production API (b.* prefix) when API key is available
const DFLOW_API_KEY = process.env.DFLOW_API_KEY;
const DFLOW_METADATA_API = DFLOW_API_KEY 
  ? 'https://b.prediction-markets-api.dflow.net'
  : 'https://dev-prediction-markets-api.dflow.net';

// Cache for comprehensive market search
let marketCache: SimplifiedMarket[] = [];
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function getCacheTimestamp(): number {
  return cacheTimestamp;
}

export interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle: string;
  event_ticker: string;
  status: string;
  market_type: string;
  volume: number;
  volume_24h: number;
  open_interest: number;
  close_time: string;
  expiration_time: string;
  yes_ask: number;
  yes_bid: number;
  no_ask: number;
  no_bid: number;
  yes_sub_title: string;
  no_sub_title: string;
  rules_primary: string;
  last_price: number;
  category: string;
}

export interface KalshiEvent {
  event_ticker: string;
  title: string;
  sub_title: string;
  series_ticker: string;
  category: string;
  markets?: KalshiMarket[] | null;
}

export interface PondMarketAccount {
  isInitialized: boolean;
  marketLedger: string;
  noMint: string;
  yesMint: string;
  redemptionStatus?: string | null;
  scalarOutcomePct?: number | null;
}

export interface SimplifiedMarket {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  yesPrice: number;
  noPrice: number;
  yesAsk?: number; // Price to BUY YES tokens (user pays this)
  yesBid?: number; // Price to SELL YES tokens (user receives this)
  noAsk?: number;  // Price to BUY NO tokens
  noBid?: number;  // Price to SELL NO tokens
  yesLabel: string;
  noLabel: string;
  volume: number;
  volume24h: number;
  endDate: string;
  status: string;
  imageUrl?: string;
  accounts?: Record<string, PondMarketAccount>;
  eventTicker?: string;
  isInitialized?: boolean; // Whether the market is ready for trading on DFlow
}

export async function getMarkets(limit = 50, cursor?: string): Promise<SimplifiedMarket[]> {
  const params = new URLSearchParams({
    limit: limit.toString(),
  });
  if (cursor) params.append('cursor', cursor);
  
  try {
    const response = await fetch(`${KALSHI_BASE_URL}/markets?${params}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      console.error('Kalshi API error:', response.status, await response.text());
      return getMockMarkets();
    }
    
    const data = await response.json();
    return data.markets?.map((m: KalshiMarket) => transformKalshiMarket(m)) || getMockMarkets();
  } catch (error) {
    console.error('Error fetching Kalshi markets:', error);
    return getMockMarkets();
  }
}

// Start background cache refresh
let cacheRefreshInProgress = false;

// Callback to notify when market cache is populated (for initialization status extraction)
let onMarketCacheReady: ((markets: SimplifiedMarket[]) => void) | null = null;

export function setMarketCacheReadyCallback(callback: (markets: SimplifiedMarket[]) => void): void {
  onMarketCacheReady = callback;
  // If cache already exists, call immediately
  if (marketCache.length > 0) {
    callback(marketCache);
  }
}

export function startBackgroundCacheRefresh(): void {
  if (cacheRefreshInProgress) return;
  
  cacheRefreshInProgress = true;
  console.log('Starting background market cache refresh...');
  
  fetchAllMarkets().then(markets => {
    if (markets.length > 0) {
      marketCache = markets;
      cacheTimestamp = Date.now();
      console.log(`Background cache refresh complete: ${marketCache.length} markets`);
      
      // Notify callback that cache is ready (for initialization status extraction)
      if (onMarketCacheReady) {
        onMarketCacheReady(markets);
      }
    }
    cacheRefreshInProgress = false;
  }).catch(err => {
    console.error('Background cache refresh failed:', err);
    cacheRefreshInProgress = false;
  });
}

export async function getEvents(maxMarkets = 500, withNestedMarkets = true): Promise<SimplifiedMarket[]> {
  const now = Date.now();
  
  // Use cache if available and not expired (15 min TTL for discovery)
  if (marketCache.length > 0 && now - cacheTimestamp < 15 * 60 * 1000) {
    console.log(`Using cached markets: ${marketCache.length} markets`);
    return marketCache.slice(0, maxMarkets);
  }
  
  // If cache expired or empty, trigger background refresh
  if (!cacheRefreshInProgress) {
    startBackgroundCacheRefresh();
  }
  
  // Return existing cache while refresh happens in background
  if (marketCache.length > 0) {
    console.log(`Returning stale cache (${marketCache.length} markets) while refreshing...`);
    return marketCache.slice(0, maxMarkets);
  }
  
  // No cache available - wait for background refresh to get some data
  // Poll for up to 10 seconds for initial data
  console.log('No cache available, waiting for background refresh...');
  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (marketCache.length > 0) {
      console.log(`Got ${marketCache.length} markets from background refresh`);
      return marketCache.slice(0, maxMarkets);
    }
  }
  
  // Still no cache after waiting - return mock
  console.log('Background refresh taking too long, returning mock data');
  return getMockMarkets();
}

// Helper function to detect multi-leg parlay markets that should be filtered out
// These markets have titles like "yes Player A,yes Player B,yes Team X wins..."
function isMultiLegParlay(market: { 
  title?: string; 
  ticker?: string; 
  event_ticker?: string;
  mve_collection_ticker?: string;
  mve_selected_legs?: any[];
}): boolean {
  // Pattern 1: Has MVE (multi-variable event) fields - definitive parlay indicator
  if (market.mve_collection_ticker || (market.mve_selected_legs && market.mve_selected_legs.length > 0)) {
    return true;
  }
  
  // Pattern 2: Event ticker starts with KXMVE (multi-variable event)
  const eventTicker = market.event_ticker || '';
  if (eventTicker.startsWith('KXMVE') || eventTicker.includes('-S20')) {
    return true;
  }
  
  // Pattern 3: Title is comma-separated "yes/no X" selections
  const title = market.title || '';
  if (/^(yes |no )/i.test(title) && title.includes(',')) {
    return true;
  }
  
  return false;
}

// Important series tickers to always include (high-traffic markets)
const PRIORITY_SERIES = [
  'KXGOVSHUT',    // Government shutdown
  'KXDEBTCEILING', // Debt ceiling
  'KXFEDCHAIR',   // Fed chair
  'KXFEDRATE',    // Fed rate decisions
  'KXBTC',        // Bitcoin price
  'KXETH',        // Ethereum price
  'KXSOL',        // Solana price
  'KXSPOTIFYGLOBALD', // Daily Global Spotify songs
  'KXSPOTIFYTOP',    // Spotify top artist
  'KXTOPSONGSPOTIFY', // Top Song on Spotify
  'KXSNOWS',        // White Christmas weather
  'KXCHRISTMASHORNETS', // Christmas Hornets
];

// Transform DFlow event/market to SimplifiedMarket format
function transformDFlowMarket(market: any, event: any): SimplifiedMarket {
  // DFlow returns prices in different formats - handle appropriately
  const yesAskRaw = market.yesAsk || market.yes_ask || 0;
  const yesBidRaw = market.yesBid || market.yes_bid || 0;
  const noAskRaw = market.noAsk || market.no_ask || 0;
  const noBidRaw = market.noBid || market.no_bid || 0;
  
  // Convert to decimal (0-1 range) - DFlow legacy format may use cents (1-100)
  const needsConversion = yesAskRaw > 1 || yesBidRaw > 1;
  const yesAsk = yesAskRaw > 0 ? (needsConversion ? yesAskRaw / 100 : yesAskRaw) : undefined;
  const yesBid = yesBidRaw > 0 ? (needsConversion ? yesBidRaw / 100 : yesBidRaw) : undefined;
  const noAsk = noAskRaw > 0 ? (needsConversion ? noAskRaw / 100 : noAskRaw) : undefined;
  const noBid = noBidRaw > 0 ? (needsConversion ? noBidRaw / 100 : noBidRaw) : undefined;
  
  let yesPrice: number;
  if (yesAskRaw > 0 && yesBidRaw > 0) {
    yesPrice = needsConversion ? (yesAskRaw + yesBidRaw) / 2 / 100 : (yesAskRaw + yesBidRaw) / 2;
  } else if (yesAskRaw > 0) {
    yesPrice = needsConversion ? yesAskRaw / 100 : yesAskRaw;
  } else if (yesBidRaw > 0) {
    yesPrice = needsConversion ? yesBidRaw / 100 : yesBidRaw;
  } else if (market.lastPrice) {
    yesPrice = market.lastPrice > 1 ? market.lastPrice / 100 : market.lastPrice;
  } else {
    yesPrice = 0.5;
  }
  const noPrice = 1 - yesPrice;
  
  // Get category from event or detect from title
  const category = event?.category || detectCategoryFromTitle(market.title || event?.title || '', event?.seriesTicker || '');
  
  // Get image URL from series ticker
  const seriesTicker = event?.seriesTicker || '';
  const imageUrl = seriesTicker 
    ? `https://kalshi-public-docs.s3.amazonaws.com/series-images-webp/${seriesTicker}.webp`
    : undefined;
  
  return {
    id: market.ticker,
    title: market.title || event?.title || '',
    subtitle: market.subtitle || event?.subtitle || '',
    category: category || 'General',
    yesPrice: isNaN(yesPrice) ? 0.5 : yesPrice,
    noPrice: isNaN(noPrice) ? 0.5 : noPrice,
    yesAsk, // Actual price to BUY YES
    yesBid, // Actual price to SELL YES
    noAsk,  // Actual price to BUY NO
    noBid,  // Actual price to SELL NO
    yesLabel: market.yesSubTitle || market.yes_sub_title || 'Yes',
    noLabel: market.noSubTitle || market.no_sub_title || 'No',
    volume: market.volume || 0,
    volume24h: market.volume24h || market.volume_24h || 0,
    endDate: market.closeTime || market.close_time || new Date().toISOString(),
    status: market.status || 'active',
    imageUrl,
    eventTicker: event?.ticker,
    accounts: market.accounts,
  };
}

// Fetch markets from DFlow Prediction Market Metadata API using /markets endpoint (includes prices!)
async function fetchMarketsFromDFlow(): Promise<SimplifiedMarket[]> {
  const markets: SimplifiedMarket[] = [];
  const marketIds = new Set<string>();
  
  try {
    // Build headers with API key if available
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (DFLOW_API_KEY) {
      headers['x-api-key'] = DFLOW_API_KEY;
    }
    
    // Use /api/v1/markets endpoint which includes yesAsk, yesBid, noAsk, noBid prices
    // Paginate to get all markets
    let cursor: number | undefined = 0;
    const pageSize = 200;
    let pagesFetched = 0;
    const maxPages = 20;
    
    console.log('Fetching markets from DFlow /markets endpoint (includes prices)');
    console.log('DFlow API key present:', !!DFLOW_API_KEY);
    
    while (pagesFetched < maxPages) {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        status: 'active',
        sort: 'volume',
      });
      if (cursor !== undefined && cursor > 0) {
        params.append('cursor', cursor.toString());
      }
      
      const url = `${DFLOW_METADATA_API}/api/v1/markets?${params}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('DFlow Markets API error:', response.status, errorText.slice(0, 200));
        break;
      }
      
      const data = await response.json();
      const apiMarkets = data.markets || [];
      
      if (apiMarkets.length === 0) break;
      
      for (const market of apiMarkets) {
        if (market.status !== 'active') continue;
        if (marketIds.has(market.ticker)) continue;
        
        // Filter out multi-leg parlay markets
        if (isMultiLegParlay({ title: market.title, event_ticker: market.eventTicker })) continue;
        
        // Transform market with price data from /markets endpoint
        markets.push(transformDFlowMarketWithPrices(market));
        marketIds.add(market.ticker);
      }
      
      cursor = data.cursor;
      pagesFetched++;
      
      if (!cursor) break;
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log(`DFlow /markets: Got ${markets.length} markets with prices from ${pagesFetched} pages`);
    return markets;
  } catch (error) {
    console.error('Error fetching from DFlow Markets API:', error);
    return [];
  }
}

// Transform DFlow /markets endpoint response (includes yesAsk, yesBid, noAsk, noBid)
function transformDFlowMarketWithPrices(market: any): SimplifiedMarket {
  // DFlow /markets endpoint returns prices as strings like "0.85" (already in 0-1 range)
  const yesAskRaw = market.yesAsk ? parseFloat(market.yesAsk) : 0;
  const yesBidRaw = market.yesBid ? parseFloat(market.yesBid) : 0;
  const noAskRaw = market.noAsk ? parseFloat(market.noAsk) : 0;
  const noBidRaw = market.noBid ? parseFloat(market.noBid) : 0;
  
  // Store actual bid/ask values for frontend (only if valid)
  const yesAsk = yesAskRaw > 0 ? yesAskRaw : undefined;
  const yesBid = yesBidRaw > 0 ? yesBidRaw : undefined;
  const noAsk = noAskRaw > 0 ? noAskRaw : undefined;
  const noBid = noBidRaw > 0 ? noBidRaw : undefined;
  
  // Calculate mid-price for display (but UI should use ask/bid for trades)
  let yesPrice: number;
  if (yesAskRaw > 0 && yesBidRaw > 0) {
    yesPrice = (yesAskRaw + yesBidRaw) / 2;
  } else if (yesAskRaw > 0) {
    yesPrice = yesAskRaw;
  } else if (yesBidRaw > 0) {
    yesPrice = yesBidRaw;
  } else {
    yesPrice = 0.5;
  }
  const noPrice = 1 - yesPrice;
  
  // Get category from event ticker or detect from title
  const eventTicker = market.eventTicker || '';
  const seriesTicker = eventTicker.split('-')[0] || '';
  const category = detectCategoryFromTitle(market.title || '', seriesTicker);
  
  // Get image URL from series ticker
  const imageUrl = seriesTicker 
    ? `https://kalshi-public-docs.s3.amazonaws.com/series-images-webp/${seriesTicker}.webp`
    : undefined;
  
  // Check if market has any initialized accounts
  const accounts = market.accounts || {};
  const isInitialized = Object.values(accounts).some((acc: any) => acc?.isInitialized === true);
  
  return {
    id: market.ticker,
    title: market.title || '',
    subtitle: market.subtitle || '',
    category: category || 'General',
    yesPrice: isNaN(yesPrice) ? 0.5 : yesPrice,
    noPrice: isNaN(noPrice) ? 0.5 : noPrice,
    yesAsk, // Actual price to BUY YES
    yesBid, // Actual price to SELL YES
    noAsk,  // Actual price to BUY NO
    noBid,  // Actual price to SELL NO
    yesLabel: market.yesSubTitle || 'Yes',
    noLabel: market.noSubTitle || 'No',
    volume: market.volume || 0,
    volume24h: market.volume24h || 0,
    endDate: market.closeTime || new Date().toISOString(),
    status: market.status || 'active',
    imageUrl,
    eventTicker,
    accounts,
    isInitialized,
  };
}

// Price data including bid/ask for accurate execution pricing
interface KalshiPriceData {
  yesPrice: number;
  noPrice: number;
  yesAsk?: number;
  yesBid?: number;
  noAsk?: number;
  noBid?: number;
}

// Fetch live prices from Kalshi for all markets (paginated)
async function fetchKalshiPrices(tickers: string[]): Promise<Map<string, KalshiPriceData>> {
  const priceMap = new Map<string, KalshiPriceData>();
  let cursor: string | undefined;
  let pagesFetched = 0;
  const maxPages = 20; // Limit to prevent too many requests
  
  try {
    while (pagesFetched < maxPages) {
      const params = new URLSearchParams({
        limit: '200',
        status: 'open',
      });
      
      if (cursor) {
        params.append('cursor', cursor);
      }
      
      const response = await fetch(`${KALSHI_BASE_URL}/markets?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        console.error('Kalshi prices API error:', response.status);
        break;
      }
      
      const data = await response.json();
      const markets = data.markets || [];
      
      if (markets.length === 0) break;
      
      for (const market of markets) {
        const yesAskRaw = market.yes_ask || 0;
        const yesBidRaw = market.yes_bid || 0;
        
        // Convert to decimal and store actual bid/ask values
        const yesAsk = yesAskRaw > 0 ? yesAskRaw / 100 : undefined;
        const yesBid = yesBidRaw > 0 ? yesBidRaw / 100 : undefined;
        const noAsk = yesBidRaw > 0 ? (100 - yesBidRaw) / 100 : undefined;
        const noBid = yesAskRaw > 0 ? (100 - yesAskRaw) / 100 : undefined;
        
        let yesPrice: number;
        if (yesAskRaw > 0 && yesBidRaw > 0) {
          yesPrice = (yesAskRaw + yesBidRaw) / 2 / 100;
        } else if (yesAskRaw > 0) {
          yesPrice = yesAskRaw / 100;
        } else if (yesBidRaw > 0) {
          yesPrice = yesBidRaw / 100;
        } else if (market.last_price > 0) {
          yesPrice = market.last_price / 100;
        } else {
          continue; // Skip if no price data
        }
        
        priceMap.set(market.ticker, {
          yesPrice: isNaN(yesPrice) ? 0.5 : yesPrice,
          noPrice: isNaN(yesPrice) ? 0.5 : 1 - yesPrice,
          yesAsk,
          yesBid,
          noAsk,
          noBid,
        });
      }
      
      cursor = data.cursor;
      pagesFetched++;
      
      if (!cursor) break;
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    
    console.log(`Fetched prices for ${priceMap.size} markets from Kalshi (${pagesFetched} pages)`);
  } catch (error) {
    console.error('Error fetching Kalshi prices:', error);
  }
  
  return priceMap;
}

// Fetch ALL markets - tries DFlow first, falls back to Kalshi
async function fetchAllMarkets(): Promise<SimplifiedMarket[]> {
  // Try DFlow /markets API which includes yesAsk, yesBid prices directly
  let markets = await fetchMarketsFromDFlow();
  
  if (markets.length > 0) {
    console.log(`Using ${markets.length} markets from DFlow /markets API (prices included)`);
    return markets;
  }
  
  // Fallback to Kalshi Events API if DFlow fails (cleaner than /markets endpoint)
  console.log('DFlow API returned no markets, falling back to Kalshi events...');
  
  const marketIds = new Set<string>();
  let cursor: string | undefined;
  const pageSize = 100;
  let pagesFetched = 0;
  const maxPages = 30;
  let retryCount = 0;
  const maxRetries = 3;
  
  try {
    while (pagesFetched < maxPages) {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        status: 'open',
        with_nested_markets: 'true',
      });
      
      if (cursor) {
        params.append('cursor', cursor);
      }
      
      const response = await fetch(`${KALSHI_BASE_URL}/events?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          retryCount++;
          if (retryCount <= maxRetries) {
            const backoffTime = Math.pow(2, retryCount) * 1000;
            console.log(`Rate limited on page ${pagesFetched}, waiting ${backoffTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
            continue;
          } else {
            break;
          }
        }
        console.error('Kalshi events API error:', response.status);
        break;
      }
      
      retryCount = 0;
      const data = await response.json();
      const events = data.events || [];
      
      if (events.length === 0) break;
      
      for (const event of events) {
        // Skip MVE (multi-variable event) containers
        if (event.event_ticker?.startsWith('KXMVE')) continue;
        
        const eventMarkets = event.markets || [];
        for (const market of eventMarkets) {
          if (market.status !== 'active' && market.status !== 'open') continue;
          if (marketIds.has(market.ticker)) continue;
          if (isMultiLegParlay(market)) continue;
          
          // Transform with event context for better categorization
          const simplified = transformKalshiMarket(market);
          simplified.category = event.category || simplified.category;
          markets.push(simplified);
          marketIds.add(market.ticker);
        }
      }
      
      cursor = data.cursor;
      pagesFetched++;
      
      // Update cache progressively
      if (pagesFetched % 3 === 0) {
        marketCache = [...markets];
        cacheTimestamp = Date.now();
      }
      
      if (pagesFetched % 5 === 0) {
        console.log(`Fetched ${pagesFetched} event pages, ${markets.length} markets...`);
      }
      
      if (!cursor) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log(`Kalshi events: Got ${markets.length} markets from ${pagesFetched} pages`);
    return markets;
  } catch (error) {
    console.error('Error fetching markets:', error);
    return markets;
  }
}

export async function getMarketsByCategory(category: string): Promise<SimplifiedMarket[]> {
  const allMarkets = await getEvents(100);
  return allMarkets.filter(m => 
    m.category.toLowerCase().includes(category.toLowerCase())
  );
}

// Comprehensive search function that caches all markets
export async function searchAllMarkets(query: string): Promise<SimplifiedMarket[]> {
  const now = Date.now();
  
  // Refresh cache if expired or empty
  if (marketCache.length === 0 || now - cacheTimestamp > CACHE_TTL) {
    console.log('Refreshing market cache for search...');
    await refreshMarketCache();
  }
  
  const searchTerm = query.toLowerCase().trim();
  if (searchTerm.length < 2) return [];
  
  // Search through cached markets
  const results = marketCache.filter(market => {
    const title = market.title.toLowerCase();
    const subtitle = (market.subtitle || '').toLowerCase();
    const id = market.id.toLowerCase();
    const yesLabel = (market.yesLabel || '').toLowerCase();
    const noLabel = (market.noLabel || '').toLowerCase();
    
    return title.includes(searchTerm) || 
           subtitle.includes(searchTerm) || 
           id.includes(searchTerm) ||
           yesLabel.includes(searchTerm) ||
           noLabel.includes(searchTerm);
  });
  
  // Sort by relevance (title match first, then by volume)
  results.sort((a, b) => {
    const aTitle = a.title.toLowerCase().includes(searchTerm);
    const bTitle = b.title.toLowerCase().includes(searchTerm);
    if (aTitle && !bTitle) return -1;
    if (!aTitle && bTitle) return 1;
    return (b.volume24h || 0) - (a.volume24h || 0);
  });
  
  console.log(`Search "${query}" in cache (${marketCache.length} markets): Found ${results.length}`);
  
  return results;
}

// Refresh the market cache with resilient fetching
async function refreshMarketCache(): Promise<void> {
  const allMarkets: SimplifiedMarket[] = [];
  const marketIds = new Set<string>();
  let cursor: string | undefined;
  const pageSize = 100; // Smaller pages to avoid rate limits
  let pagesFetched = 0;
  const maxPages = 50; // Fetch up to 5000 markets
  let retryCount = 0;
  const maxRetries = 3;
  
  console.log('Starting comprehensive market cache refresh...');
  
  try {
    // First, fetch priority series with delays
    for (const seriesTicker of PRIORITY_SERIES) {
      try {
        const response = await fetch(`${KALSHI_BASE_URL}/events?series_ticker=${seriesTicker}&with_nested_markets=true&limit=50`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        
        if (response.ok) {
          const data = await response.json();
          for (const event of data.events || []) {
            if (event.markets) {
              for (const market of event.markets) {
                if (market.status !== 'active') continue;
                if (marketIds.has(market.ticker)) continue;
                // Filter out multi-leg parlay markets
                if (isMultiLegParlay(market)) continue;
                allMarkets.push(transformKalshiMarket(market, event));
                marketIds.add(market.ticker);
              }
            }
          }
        } else if (response.status === 429) {
          // Rate limited - wait longer
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        // Delay between series requests
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.error(`Cache refresh: Error fetching series ${seriesTicker}:`, e);
      }
    }
    
    console.log(`Priority series loaded: ${allMarkets.length} markets`);
    
    // Then fetch from markets endpoint with pagination and retry logic
    while (pagesFetched < maxPages) {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        status: 'open',
      });
      
      if (cursor) {
        params.append('cursor', cursor);
      }
      
      const response = await fetch(`${KALSHI_BASE_URL}/markets?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          retryCount++;
          if (retryCount <= maxRetries) {
            // Exponential backoff: 2s, 4s, 8s
            const backoffTime = Math.pow(2, retryCount) * 1000;
            console.log(`Rate limited, waiting ${backoffTime}ms before retry ${retryCount}/${maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
            continue; // Retry same page
          } else {
            console.log(`Max retries reached after ${pagesFetched} pages, using partial cache`);
            break;
          }
        }
        console.error('Cache refresh error:', response.status);
        break;
      }
      
      // Reset retry count on success
      retryCount = 0;
      
      const data = await response.json();
      const rawMarkets = data.markets || [];
      
      if (rawMarkets.length === 0) {
        console.log('No more markets to fetch');
        break;
      }
      
      for (const market of rawMarkets) {
        if (marketIds.has(market.ticker)) continue;
        // Filter out multi-leg parlay markets
        if (isMultiLegParlay(market)) continue;
        allMarkets.push(transformKalshiMarket(market));
        marketIds.add(market.ticker);
      }
      
      cursor = data.cursor;
      pagesFetched++;
      
      // Log progress every 10 pages
      if (pagesFetched % 10 === 0) {
        console.log(`Cache progress: ${pagesFetched} pages, ${allMarkets.length} markets`);
      }
      
      if (!cursor) {
        console.log('Reached end of market list');
        break;
      }
      
      // Delay between requests to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 600));
    }
    
    marketCache = allMarkets;
    cacheTimestamp = Date.now();
    console.log(`Market cache complete: ${marketCache.length} markets from ${pagesFetched} pages`);
  } catch (error) {
    console.error('Error refreshing market cache:', error);
    // Keep existing cache if refresh fails
    if (allMarkets.length > marketCache.length) {
      marketCache = allMarkets;
      cacheTimestamp = Date.now();
    }
  }
}

export async function getEventMarkets(eventTicker: string): Promise<SimplifiedMarket[]> {
  try {
    const response = await fetch(`${KALSHI_BASE_URL}/events/${eventTicker}?with_nested_markets=true`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      console.error('Kalshi API error fetching event:', response.status);
      return [];
    }
    
    const data = await response.json();
    const event: KalshiEvent = data.event;
    
    if (!event || !event.markets) {
      return [];
    }
    
    return event.markets
      .filter((m: KalshiMarket) => m.status === 'active')
      .map((m: KalshiMarket) => transformKalshiMarket(m, event))
      .sort((a, b) => b.yesPrice - a.yesPrice);
  } catch (error) {
    console.error('Error fetching event markets:', error);
    return [];
  }
}

function mapKalshiCategory(kalshiCategory: string): string {
  const categoryMap: Record<string, string> = {
    'Science and Technology': 'Tech',
    'Financials': 'Economics',
    'Climate and Weather': 'Weather',
    'Politics': 'Politics',
    'World': 'Politics',
    'Entertainment': 'General',
    'Social': 'General',
    'Sports': 'Sports',
  };
  return categoryMap[kalshiCategory] || '';
}

function detectCategoryFromTitle(title: string, eventTicker?: string): string {
  const upperTitle = title.toUpperCase();
  const upperTicker = (eventTicker || '').toUpperCase();
  
  // Ticker-based detection (more reliable than title keywords)
  const tickerCategories: Record<string, string> = {
    // Crypto
    'KXBTC': 'Crypto', 'KXETH': 'Crypto', 'KXSOL': 'Crypto', 'KXXRP': 'Crypto',
    'KXDOGE': 'Crypto', 'KXCRYPTO': 'Crypto', 'KXSOLD': 'Crypto', 'KXETHD': 'Crypto',
    'KXBTCD': 'Crypto', 'BTCUSD': 'Crypto', 'ETHUSD': 'Crypto',
    // AI/Tech
    'KXIPO': 'Tech', 'OAIAGI': 'AI', 'KXOPENAI': 'AI', 'KXGPT': 'AI',
    'TESLAOPTIMUS': 'Tech', 'GTA6': 'Tech', 'KXTESLA': 'Tech',
    'KXSPACEX': 'Tech', 'KXTIKTOK': 'Tech', 'KXMETA': 'Tech',
    // Economics
    'KXFED': 'Economics', 'KXRATE': 'Economics', 'KXINFLATION': 'Economics',
    'KXGDP': 'Economics', 'KXRATECUTCOUNT': 'Economics', 'KXFEDEND': 'Economics',
    'KXRECESSION': 'Economics', 'WRECSS': 'Economics', 'KXCPI': 'Economics',
    // Weather
    'KXSNOW': 'Weather', 'KXTEMP': 'Weather', 'KXHURRICANE': 'Weather',
    'KXWEATHER': 'Weather', 'KXRAIN': 'Weather',
    // Politics - be careful, many tickers start with KX
    'KXPRES': 'Politics', 'KXGOV': 'Politics', 'KXSENATE': 'Politics',
    'SENATE': 'Politics', 'GOVPARTY': 'Politics', 'KXHOUSE': 'Politics',
    'KXTRUMP': 'Politics', 'KXBIDEN': 'Politics', 'KXIMPEACH': 'Politics',
    'KXCABOUT': 'Politics', 'KXCABINET': 'Politics',
    // Sports
    'KXNFL': 'Sports', 'KXNBA': 'Sports', 'KXMLB': 'Sports', 'KXNHL': 'Sports',
    'KXNCAA': 'Sports', 'KXUFC': 'Sports', 'KXMENWORLDCUP': 'Sports',
    'KXLALIGA': 'Sports', 'KXUCL': 'Sports', 'KXPFAPOY': 'Sports',
    // Entertainment/General markers
    'KXOSCAR': 'Entertainment', 'KXGRAM': 'Entertainment', 'KXGG': 'Entertainment',
    'KXSAG': 'Entertainment', 'KXCRITICS': 'Entertainment', 'KXBOND': 'Entertainment',
  };
  
  // Check ticker prefixes
  for (const [prefix, category] of Object.entries(tickerCategories)) {
    if (upperTicker.startsWith(prefix)) return category;
  }
  
  // Expanded keyword detection
  const cryptoKeywords = ['BITCOIN', 'BTC', 'ETHEREUM', 'ETH', 'SOLANA', 'SOL PRICE', 'CRYPTO', 'XRP', 'DOGECOIN', 'DOGE', 'ALTCOIN', 'STABLECOIN', 'USDC', 'USDT', 'DEFI', 'NFT'];
  for (const keyword of cryptoKeywords) {
    if (upperTitle.includes(keyword)) return 'Crypto';
  }
  
  const aiKeywords = ['ARTIFICIAL INTELLIGENCE', 'OPENAI', 'GPT-', 'CHATGPT', 'ANTHROPIC', 'CLAUDE', 'AGI', 'MACHINE LEARNING', 'DEEPMIND', 'GEMINI', 'LLAMA', 'MISTRAL', 'XAI', 'CURSOR', 'COPILOT'];
  for (const keyword of aiKeywords) {
    if (upperTitle.includes(keyword)) return 'AI';
  }
  // Special check for standalone "AI" - needs word boundary check
  if (/\bAI\b/.test(upperTitle) && !upperTitle.includes('SAID') && !upperTitle.includes('AGAIN')) return 'AI';
  
  const techKeywords = ['TESLA', 'APPLE', 'GOOGLE', 'AMAZON', 'MICROSOFT', 'NVIDIA', 'META ', 'SPACEX', 'TWITTER', 'TIKTOK', 'IPO', 'STARTUP', 'IPHONE', 'ANDROID', 'STARLINK', 'NEURALINK', 'OPTIMUS', 'GTA', 'CYBERTRUCK', 'CHIP', 'SEMICONDUCTOR'];
  for (const keyword of techKeywords) {
    if (upperTitle.includes(keyword)) return 'Tech';
  }
  
  const sportsKeywords = ['NFL', 'NBA', 'MLB', 'NHL', 'SUPER BOWL', 'WORLD SERIES', 'PLAYOFF', 'MVP', 'TOUCHDOWN', 'HOME RUN', 'QUARTERBACK', 'COACH OF THE YEAR', 'ROOKIE OF THE YEAR', 'STANLEY CUP', 'WORLD CUP', 'CHAMPIONS LEAGUE', 'LA LIGA', 'PREMIER LEAGUE', 'HEAD COACH', 'DEFENSIVE PLAYER', 'PRO FOOTBALL', 'PRO BASKETBALL', 'PRO BASEBALL'];
  for (const keyword of sportsKeywords) {
    if (upperTitle.includes(keyword)) return 'Sports';
  }
  
  const economicsKeywords = ['FED ', 'FEDERAL RESERVE', 'INTEREST RATE', 'INFLATION', 'GDP', 'UNEMPLOYMENT', 'S&P 500', 'S&P500', 'NASDAQ', 'DOW JONES', 'RECESSION', 'RATE CUT', 'RATE HIKE', 'CPI', 'PCE', 'TREASURY', 'YIELD', 'BOND MARKET'];
  for (const keyword of economicsKeywords) {
    if (upperTitle.includes(keyword)) return 'Economics';
  }
  
  const politicsKeywords = ['TRUMP', 'BIDEN', 'PRESIDENT', 'CONGRESS', 'SENATE', 'ELECTION', 'GOVERNOR', 'REPUBLICAN', 'DEMOCRAT', 'IMPEACH', 'CABINET', 'WHITE HOUSE', 'DEPARTMENT OF', 'DOGE ', 'MUSK', 'RAMASWAMY', 'NOMINEE', 'PRESIDENTIAL'];
  for (const keyword of politicsKeywords) {
    if (upperTitle.includes(keyword)) return 'Politics';
  }
  
  const weatherKeywords = ['SNOW', 'TEMPERATURE', 'HURRICANE', 'TORNADO', 'FLOOD', 'DROUGHT', 'HEAT WAVE', 'COLD WAVE', 'RAINFALL', 'WEATHER'];
  for (const keyword of weatherKeywords) {
    if (upperTitle.includes(keyword)) return 'Weather';
  }
  
  const entertainmentKeywords = ['OSCAR', 'GRAMMY', 'EMMY', 'GOLDEN GLOBE', 'BEST ACTOR', 'BEST ACTRESS', 'BEST PICTURE', 'BEST ALBUM', 'BEST SONG', 'SPOTIFY', 'BILLBOARD', 'JAMES BOND', 'MOVIE', 'FILM'];
  for (const keyword of entertainmentKeywords) {
    if (upperTitle.includes(keyword)) return 'Entertainment';
  }
  
  return 'General';
}

function transformKalshiMarket(market: KalshiMarket, event?: KalshiEvent): SimplifiedMarket {
  const yesAskRaw = market.yes_ask || 0;
  const yesBidRaw = market.yes_bid || 0;
  
  // Convert Kalshi cents to decimal (0-1 range)
  // Also derive NO prices (no_ask = 1 - yes_bid, no_bid = 1 - yes_ask)
  const yesAskDecimal = yesAskRaw > 0 ? yesAskRaw / 100 : undefined;
  const yesBidDecimal = yesBidRaw > 0 ? yesBidRaw / 100 : undefined;
  const noAskDecimal = yesBidRaw > 0 ? (100 - yesBidRaw) / 100 : undefined;
  const noBidDecimal = yesAskRaw > 0 ? (100 - yesAskRaw) / 100 : undefined;
  
  let yesPrice: number;
  if (yesAskRaw > 0 && yesBidRaw > 0) {
    yesPrice = (yesAskRaw + yesBidRaw) / 2 / 100;
  } else if (yesAskRaw > 0) {
    yesPrice = yesAskRaw / 100;
  } else if (yesBidRaw > 0) {
    yesPrice = yesBidRaw / 100;
  } else if (market.last_price > 0) {
    yesPrice = market.last_price / 100;
  } else {
    yesPrice = 0.5;
  }
  const noPrice = 1 - yesPrice;
  
  const kalshiCategory = event?.category || market.category || '';
  const mappedCategory = mapKalshiCategory(kalshiCategory);
  const seriesTicker = event?.series_ticker || market.event_ticker?.split('-')[0] || '';
  const eventTicker = market.event_ticker || event?.event_ticker || '';
  const category = mappedCategory || formatCategory(seriesTicker) || detectCategoryFromTitle(market.title, eventTicker);
  
  const title = market.title || event?.title || '';
  
  const getKalshiImageUrl = (): string => {
    const eventTicker = market.event_ticker || event?.event_ticker || '';
    
    if (eventTicker) {
      const baseTicker = eventTicker.split('-')[0];
      return `https://kalshi-public-docs.s3.amazonaws.com/series-images-webp/${baseTicker}.webp`;
    }
    
    if (seriesTicker) {
      return `https://kalshi-public-docs.s3.amazonaws.com/series-images-webp/${seriesTicker}.webp`;
    }
    
    return `https://kalshi-public-docs.s3.amazonaws.com/series-images-webp/default.webp`;
  };
  
  return {
    id: market.ticker,
    title,
    subtitle: market.subtitle || event?.sub_title || '',
    category: category || 'General',
    yesPrice: isNaN(yesPrice) ? 0.5 : yesPrice,
    noPrice: isNaN(noPrice) ? 0.5 : noPrice,
    yesAsk: yesAskDecimal, // Actual price to BUY YES
    yesBid: yesBidDecimal, // Actual price to SELL YES
    noAsk: noAskDecimal,   // Actual price to BUY NO
    noBid: noBidDecimal,   // Actual price to SELL NO
    yesLabel: market.yes_sub_title || 'Yes',
    noLabel: market.no_sub_title || 'No',
    volume: market.volume || 0,
    volume24h: market.volume_24h || 0,
    endDate: market.close_time || new Date().toISOString(),
    status: market.status || 'active',
    imageUrl: getKalshiImageUrl(),
    eventTicker: market.event_ticker,
  };
}

function transformMarket(market: any, event?: any): SimplifiedMarket {
  const yesAskVal = market.yesAsk ? parseFloat(market.yesAsk) : null;
  const yesBidVal = market.yesBid ? parseFloat(market.yesBid) : null;
  const noAskVal = market.noAsk ? parseFloat(market.noAsk) : null;
  const noBidVal = market.noBid ? parseFloat(market.noBid) : null;
  
  // Store valid bid/ask values for execution price calculations
  const yesAsk = yesAskVal !== null && yesAskVal > 0 ? yesAskVal : undefined;
  const yesBid = yesBidVal !== null && yesBidVal > 0 ? yesBidVal : undefined;
  const noAsk = noAskVal !== null && noAskVal > 0 ? noAskVal : undefined;
  const noBid = noBidVal !== null && noBidVal > 0 ? noBidVal : undefined;
  
  // API returns prices as decimals (0-1 range) - just use them directly
  let yesPrice: number;
  if (yesAskVal !== null && yesBidVal !== null) {
    yesPrice = (yesAskVal + yesBidVal) / 2;
  } else if (yesAskVal !== null) {
    yesPrice = yesAskVal;
  } else if (yesBidVal !== null) {
    yesPrice = yesBidVal;
  } else {
    yesPrice = 0.5;
  }
  const noPrice = 1 - yesPrice;
  
  const category = event?.seriesTicker?.split('-')[0] || 
                   market.eventTicker?.split('-')[0] || 
                   'General';
  
  let title = market.title || event?.title || '';
  
  if (title.toLowerCase().includes('who will') && market.ticker) {
    const tickerParts = market.ticker.split('-');
    if (tickerParts.length >= 3) {
      const companyCode = tickerParts[tickerParts.length - 1];
      const companyNames: Record<string, string> = {
        'STRIPE': 'Stripe',
        'OPENAI': 'OpenAI',
        'SPACEX': 'SpaceX',
        'DISCORD': 'Discord',
        'DATABRICKS': 'Databricks',
        'ANTHROPIC': 'Anthropic',
        'KLARNA': 'Klarna',
        'RIPPLING': 'Rippling',
        'RAMP': 'Ramp',
        'CEREBRAS': 'Cerebras',
        'BREX': 'Brex',
        'ANDURIL': 'Anduril',
        'DEEL': 'Deel',
        'VANTA': 'Vanta',
        'GLEAN': 'Glean',
        'MISTRAL': 'Mistral AI',
        'XAI': 'xAI',
        'ANYSPHERE': 'Anysphere (Cursor)',
        'AINTUITION': 'AI Intuition',
        'REMOTE': 'Remote',
        'CELONIS': 'Celonis',
        'MED': 'Medtronic',
        'KRAK': 'Kraken',
        'BEAS': 'Beasley',
        'RIP': 'Ripple',
      };
      const companyName = companyNames[companyCode.toUpperCase()] || companyCode;
      if (title.toLowerCase().includes('ipo')) {
        title = `Will ${companyName} IPO in 2025?`;
      }
    }
  }
  
  return {
    id: market.ticker,
    title,
    subtitle: market.subtitle || event?.subtitle || '',
    category: formatCategory(category),
    yesPrice: isNaN(yesPrice) ? 0.5 : yesPrice,
    noPrice: isNaN(noPrice) ? 0.5 : noPrice,
    yesAsk, // Actual price to BUY YES
    yesBid, // Actual price to SELL YES
    noAsk,  // Actual price to BUY NO
    noBid,  // Actual price to SELL NO
    yesLabel: market.yesSubTitle || 'Yes',
    noLabel: market.noSubTitle || 'No',
    volume: market.volume || event?.volume || 0,
    volume24h: market.volume24h || event?.volume24h || 0,
    endDate: market.closeTime 
      ? new Date(market.closeTime * 1000).toISOString() 
      : new Date().toISOString(),
    status: market.status || 'active',
    imageUrl: event?.imageUrl || undefined,
    accounts: market.accounts,
    eventTicker: market.eventTicker,
  };
}

function formatCategory(ticker: string): string {
  const upperTicker = ticker.toUpperCase();
  
  const categoryMap: Record<string, string> = {
    'KXNCAA': 'Sports',
    'KXNFL': 'Sports',
    'KXNBA': 'Sports',
    'KXNHL': 'Sports',
    'KXMLB': 'Sports',
    'KXSOCCER': 'Sports',
    'KXEURO': 'Sports',
    'KXPREMIER': 'Sports',
    'KXEFL': 'Sports',
    'KXMEN': 'Sports',
    'KXWOMEN': 'Sports',
    'KXUFC': 'Sports',
    'KXBOXING': 'Sports',
    'KXTENNIS': 'Sports',
    'KXGOLF': 'Sports',
    'KXF1': 'Sports',
    'KXNASCAR': 'Sports',
    'KXOLYMPIC': 'Sports',
    'KXWORLDCUP': 'Sports',
    'KXCRYPTO': 'Crypto',
    'KXBTC': 'Crypto',
    'KXETH': 'Crypto',
    'KXSOL': 'Crypto',
    'KXXRP': 'Crypto',
    'KXDOGE': 'Crypto',
    'KXADA': 'Crypto',
    'KXBNB': 'Crypto',
    'KXFED': 'Economics',
    'KXCPI': 'Economics',
    'KXGDP': 'Economics',
    'KXRATE': 'Economics',
    'KXNASDAQ': 'Economics',
    'KXSP500': 'Economics',
    'KXDOW': 'Economics',
    'KXUNEMPLOY': 'Economics',
    'KXINFLATION': 'Economics',
    'KXJOBS': 'Economics',
    'KXPRES': 'Politics',
    'KXSENATE': 'Politics',
    'KXHOUSE': 'Politics',
    'KXTRUMP': 'Politics',
    'KXBIDEN': 'Politics',
    'KXPOWEL': 'Politics',
    'KXELECTION': 'Politics',
    'KXGOV': 'Politics',
    'KXCONGRESS': 'Politics',
    'KXSUPREME': 'Politics',
    'KXREDIS': 'Politics',
    'KXPORT': 'Politics',
    'KXNEXT': 'Politics',
    'LEAVE': 'Politics',
    'KXTECH': 'Tech',
    'KXTSLA': 'Tech',
    'KXAPPLE': 'Tech',
    'KXAAPL': 'Tech',
    'KXGOOG': 'Tech',
    'KXMETA': 'Tech',
    'KXMSFT': 'Tech',
    'KXAMZN': 'Tech',
    'KXNVDA': 'Tech',
    'KXFAANG': 'Tech',
    'KXIPO': 'Tech',
    'ROBOTAXI': 'Tech',
    'KXTAKEOVE': 'Tech',
    'KXACQU': 'Tech',
    'KXMERGE': 'Tech',
    'KXSPAC': 'Tech',
    'KXSPACEX': 'Tech',
    'KXTWITTER': 'Tech',
    'KXTIKTOK': 'Tech',
    'KXAI': 'AI',
    'KXCHATGPT': 'AI',
    'KXOPENAI': 'AI',
    'KXGPT': 'AI',
    'KXANTHROP': 'AI',
    'KXWEATHER': 'Weather',
    'KXHURRICANE': 'Weather',
    'KXTEMP': 'Weather',
    'KXCLIMATE': 'Weather',
    'INDIACLIMATE': 'Weather',
    'KXOSCAR': 'Entertainment',
    'KXGRAM': 'Entertainment',
    'KXSAG': 'Entertainment',
    'KXGOLDEN': 'Entertainment',
    'KXGG': 'Entertainment',
    'KXEMMY': 'Entertainment',
    'KXBOND': 'Entertainment',
    'KXTAYLOR': 'Entertainment',
    'KXSPOTIFY': 'Entertainment',
    'KXNETFLIX': 'Entertainment',
    'KXDISNEY': 'Entertainment',
    'KXCHESS': 'Entertainment',
    'KXNEWPOPE': 'Entertainment',
    'KXRANK': 'General',
    'KXTEAMS': 'Sports',
    'COSTCO': 'General',
  };
  
  for (const [prefix, category] of Object.entries(categoryMap)) {
    if (upperTicker.startsWith(prefix)) {
      return category;
    }
  }
  
  const keywordCategories: Record<string, string[]> = {
    'Crypto': ['BITCOIN', 'ETHEREUM', 'SOLANA', 'CRYPTO', 'COIN', 'TOKEN', 'XRP', 'DOGE', 'CARDANO'],
    'Tech': ['TESLA', 'APPLE', 'GOOGLE', 'AMAZON', 'MICROSOFT', 'NVIDIA', 'META', 'SPACEX', 'TWITTER', 'TIKTOK', 'IPO', 'STARTUP', 'STARSHIP', 'ROBOTAXI', 'SELF-DRIVING'],
    'AI': ['OPENAI', 'CHATGPT', 'GPT', 'ARTIFICIAL', 'MACHINE LEARNING', 'ANTHROPIC', 'AGI', 'ROBOT'],
    'Politics': ['TRUMP', 'BIDEN', 'ELECTION', 'CONGRESS', 'SENATE', 'SUPREME', 'GOVERNOR', 'PRESIDENT', 'DEMOCRAT', 'REPUBLICAN', 'MINISTER'],
    'Economics': ['FED', 'INFLATION', 'GDP', 'JOBS', 'UNEMPLOYMENT', 'NASDAQ', 'SP500', 'DOW', 'TARIFF', 'RECESSION', 'RATE CUT', 'INTEREST RATE'],
    'Weather': ['HURRICANE', 'TEMPERATURE', 'CLIMATE', 'STORM', 'WEATHER', 'EARTHQUAKE', 'TORNADO', 'FLOOD'],
    'Sports': ['NFL', 'NBA', 'MLB', 'NHL', 'SOCCER', 'FOOTBALL', 'BASKETBALL', 'BASEBALL', 'HOCKEY', 'SUPER BOWL', 'WORLD SERIES', 'STANLEY CUP', 'PLAYOFFS'],
    'Entertainment': ['GRAMMY', 'OSCAR', 'EMMY', 'GOLDEN GLOBE', 'SAG AWARD', 'TAYLOR SWIFT', 'BEYONCE', 'DRAKE', 'KANYE', 'RIHANNA', 'SPOTIFY', 'NETFLIX', 'DISNEY', 'MARVEL', 'JAMES BOND', 'POPE', 'CHESS', 'GTA', 'VIDEO GAME', 'MOVIE', 'ALBUM', 'BRIDESMAID', 'WEDDING'],
  };
  
  for (const [category, keywords] of Object.entries(keywordCategories)) {
    for (const keyword of keywords) {
      if (upperTicker.includes(keyword)) {
        return category;
      }
    }
  }
  
  return 'General';
}

function getMockMarkets(): SimplifiedMarket[] {
  return [
    {
      id: 'BTC-150K-2026',
      title: 'Will Bitcoin reach $150K by end of 2026?',
      subtitle: 'BTC price prediction market',
      category: 'Crypto',
      yesPrice: 0.62,
      noPrice: 0.38,
      yesLabel: 'Yes',
      noLabel: 'No',
      volume: 325000,
      volume24h: 5000,
      endDate: '2026-12-31T23:59:59Z',
      status: 'active',
      imageUrl: 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=800&h=600&fit=crop',
    },
    {
      id: 'ETH-10K-2026',
      title: 'Will Ethereum reach $10K by 2026?',
      subtitle: 'ETH price prediction',
      category: 'Crypto',
      yesPrice: 0.35,
      noPrice: 0.65,
      yesLabel: 'Yes',
      noLabel: 'No',
      volume: 189000,
      volume24h: 3000,
      endDate: '2026-12-31T23:59:59Z',
      status: 'active',
      imageUrl: 'https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=800&h=600&fit=crop',
    },
    {
      id: 'FED-RATE-2026',
      title: 'Will the Fed cut rates below 3% by 2026?',
      subtitle: 'Federal Reserve monetary policy',
      category: 'Economics',
      yesPrice: 0.58,
      noPrice: 0.42,
      yesLabel: 'Yes',
      noLabel: 'No',
      volume: 434000,
      volume24h: 4000,
      endDate: '2026-12-31T23:59:59Z',
      status: 'active',
      imageUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&h=600&fit=crop',
    },
    {
      id: 'SOL-500-2026',
      title: 'Will Solana reach $500 by end of 2026?',
      subtitle: 'SOL price prediction',
      category: 'Crypto',
      yesPrice: 0.42,
      noPrice: 0.58,
      yesLabel: 'Yes',
      noLabel: 'No',
      volume: 198000,
      volume24h: 2000,
      endDate: '2026-12-31T23:59:59Z',
      status: 'active',
      imageUrl: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&h=600&fit=crop',
    },
    {
      id: 'TRUMP-2028',
      title: 'Will Trump win the 2028 presidential election?',
      subtitle: 'US Politics prediction',
      category: 'Politics',
      yesPrice: 0.25,
      noPrice: 0.75,
      yesLabel: 'Yes',
      noLabel: 'No',
      volume: 567000,
      volume24h: 6000,
      endDate: '2028-11-15T23:59:59Z',
      status: 'active',
      imageUrl: 'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?w=800&h=600&fit=crop',
    },
    {
      id: 'AI-AGI-2027',
      title: 'Will AGI be achieved by 2027?',
      subtitle: 'Artificial General Intelligence milestone',
      category: 'AI',
      yesPrice: 0.18,
      noPrice: 0.82,
      yesLabel: 'Yes',
      noLabel: 'No',
      volume: 892000,
      volume24h: 8000,
      endDate: '2027-12-31T23:59:59Z',
      status: 'active',
      imageUrl: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&h=600&fit=crop',
    },
    {
      id: 'TESLA-ROBOTAXI-2026',
      title: 'Will Tesla launch Robotaxi service by 2026?',
      subtitle: 'Tesla autonomous vehicles',
      category: 'Tech',
      yesPrice: 0.55,
      noPrice: 0.45,
      yesLabel: 'Yes',
      noLabel: 'No',
      volume: 345000,
      volume24h: 3500,
      endDate: '2026-12-31T23:59:59Z',
      status: 'active',
      imageUrl: 'https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=800&h=600&fit=crop',
    },
    {
      id: 'SPACEX-MARS-2028',
      title: 'Will SpaceX land humans on Mars by 2028?',
      subtitle: 'Space exploration milestone',
      category: 'Tech',
      yesPrice: 0.12,
      noPrice: 0.88,
      yesLabel: 'Yes',
      noLabel: 'No',
      volume: 678000,
      volume24h: 7000,
      endDate: '2028-12-31T23:59:59Z',
      status: 'active',
      imageUrl: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?w=800&h=600&fit=crop',
    },
    {
      id: 'NFL-SUPERBOWL-2026',
      title: 'Will the Chiefs win Super Bowl 2026?',
      subtitle: 'NFL championship prediction',
      category: 'Sports',
      yesPrice: 0.22,
      noPrice: 0.78,
      yesLabel: 'Yes',
      noLabel: 'No',
      volume: 456000,
      volume24h: 4500,
      endDate: '2026-02-15T23:59:59Z',
      status: 'active',
      imageUrl: 'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=800&h=600&fit=crop',
    },
    {
      id: 'APPLE-VR-2026',
      title: 'Will Apple Vision Pro 2 launch by 2026?',
      subtitle: 'Apple product launch',
      category: 'Tech',
      yesPrice: 0.78,
      noPrice: 0.22,
      yesLabel: 'Yes',
      noLabel: 'No',
      volume: 234000,
      volume24h: 2500,
      endDate: '2026-12-31T23:59:59Z',
      status: 'active',
      imageUrl: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=800&h=600&fit=crop',
    },
  ];
}

function isBinaryMarket(title: string): boolean {
  const nonBinaryPatterns = [
    /^which .+ will win/i,
    /^how many .+ will there be/i,
    /^how much will/i,
    /^when will .+ happen/i,
    /^where will .+ be held/i,
  ];
  
  for (const pattern of nonBinaryPatterns) {
    if (pattern.test(title)) {
      return false;
    }
  }
  return true;
}

// Re-categorize "General" markets based on title/subtitle content
function reclassifyMarket(market: SimplifiedMarket): SimplifiedMarket {
  if (market.category !== 'General') return market;
  
  const text = `${market.title} ${market.subtitle || ''} ${market.eventTicker || ''}`.toUpperCase();
  
  // Entertainment patterns - check these first as they're often mislabeled
  const entertainmentPatterns = [
    /GRAMMY|GRAMMYS|GRAMM/i,
    /OSCAR|OSCARS|ACADEMY AWARD/i,
    /EMMY|EMMYS/i,
    /GOLDEN GLOBE/i,
    /SAG AWARD|SCREEN ACTORS/i,
    /TAYLOR SWIFT|TRAVIS KELCE/i,
    /BEYONCE|BEYONCÉ|RIHANNA|DRAKE|KANYE|BAD BUNNY|LADY GAGA|SABRINA CARPENTER/i,
    /SPOTIFY|BILLBOARD|SONG OF THE YEAR|RECORD OF THE YEAR/i,
    /NETFLIX|DISNEY|MARVEL|STAR WARS|JAMES BOND|NEXT BOND/i,
    /POPE LEO|VATICAN|PONTIFF|NEW POPE/i,
    /WORLD CHESS|CHESS CHAMPION/i,
    /\bGTA\b|VIDEO GAME|GAMING/i,
    /BEST PICTURE|BEST DIRECTOR|BEST SCREENPLAY/i,
    /WEDDING|BRIDESMAID|MARRIED/i,
    /HOLLYWOOD/i,
  ];
  
  for (const pattern of entertainmentPatterns) {
    if (pattern.test(text)) {
      return { ...market, category: 'Entertainment' };
    }
  }
  
  // Tech patterns
  const techPatterns = [
    /OPENAI|ANTHROPIC|IPO/i,
    /SPACEX|STARSHIP|STARLINK|MARS|MOON LANDING/i,
    /TESLA|ROBOTAXI|SELF.DRIVING|AUTONOMOUS/i,
    /APPLE|IPHONE|VISION PRO/i,
    /GOOGLE|ALPHABET/i,
    /MICROSOFT|AZURE/i,
    /NVIDIA|CHIP|SEMICONDUCTOR/i,
    /TIKTOK|TWITTER|SOCIAL MEDIA/i,
  ];
  
  for (const pattern of techPatterns) {
    if (pattern.test(text)) {
      return { ...market, category: 'Tech' };
    }
  }
  
  // AI patterns
  const aiPatterns = [
    /\bAI\b|ARTIFICIAL INTELLIGENCE|AGI/i,
    /CHATGPT|GPT-|GPT4|GPT5/i,
    /ROBOT|HUMANOID/i,
    /MACHINE LEARNING|DEEP LEARNING/i,
  ];
  
  for (const pattern of aiPatterns) {
    if (pattern.test(text)) {
      return { ...market, category: 'AI' };
    }
  }
  
  // Politics patterns
  const politicsPatterns = [
    /TRUMP|BIDEN|HARRIS|VANCE|OBAMA/i,
    /PRESIDENT|PRESIDENTIAL|PRESIDENCY/i,
    /DEMOCRAT|REPUBLICAN|GOP/i,
    /CONGRESS|SENATE|GOVERNOR/i,
    /ELECTION|VOTE|BALLOT/i,
    /PRIME MINISTER|PARLIAMENT/i,
  ];
  
  for (const pattern of politicsPatterns) {
    if (pattern.test(text)) {
      return { ...market, category: 'Politics' };
    }
  }
  
  // Weather/Climate patterns
  const weatherPatterns = [
    /CLIMATE|EARTHQUAKE|HURRICANE|TORNADO|FLOOD|STORM/i,
    /TEMPERATURE|WEATHER|WILDFIRE/i,
  ];
  
  for (const pattern of weatherPatterns) {
    if (pattern.test(text)) {
      return { ...market, category: 'Weather' };
    }
  }
  
  return market;
}

// Strict filtering for swipe tab - only tradeable markets with good liquidity
export function diversifyMarketFeed(markets: SimplifiedMarket[], strictMode: boolean = true): SimplifiedMarket[] {
  // Strict mode for swipe tab: filter to markets with balanced odds (10-90%) for better liquidity
  // Relaxed mode for discovery: only filter extreme (99%+ or 1%-)
  const probabilityFilter = strictMode 
    ? (yesPercent: number) => yesPercent >= 10 && yesPercent <= 90
    : (yesPercent: number) => yesPercent > 1 && yesPercent < 99;
  
  const activeMarkets = markets.filter(m => {
    // Only include initialized markets in strict mode (swipe tab)
    if (strictMode && m.isInitialized === false) return false;
    
    const yesPercent = m.yesPrice * 100;
    if (!probabilityFilter(yesPercent)) return false;
    
    // In strict mode, require minimum volume for liquidity
    if (strictMode && (m.volume || 0) < 10000) return false;
    
    return true;
  });
  
  const filterType = strictMode ? 'swipe (10-90%, initialized, min volume)' : 'discovery (1-99%)';
  console.log(`Filtered markets: ${markets.length} -> ${activeMarkets.length} (${filterType})`);
  
  // Re-classify markets before filtering
  const reclassifiedMarkets = activeMarkets.map(reclassifyMarket);
  
  const binaryMarkets = reclassifiedMarkets.filter(m => isBinaryMarket(m.title));
  
  // Deduplicate by market ID
  const seenIds = new Set<string>();
  const uniqueMarkets: SimplifiedMarket[] = [];
  
  for (const market of binaryMarkets) {
    if (!seenIds.has(market.id)) {
      seenIds.add(market.id);
      uniqueMarkets.push(market);
    }
  }
  
  // Sort by volume score (weighted: 70% 24h volume, 30% total volume)
  uniqueMarkets.sort((a, b) => {
    const scoreA = (a.volume24h || 0) * 0.7 + (a.volume || 0) * 0.0003;
    const scoreB = (b.volume24h || 0) * 0.7 + (b.volume || 0) * 0.0003;
    return scoreB - scoreA;
  });
  
  // Log category distribution after reclassification
  const preCatCounts: Record<string, number> = {};
  uniqueMarkets.slice(0, 100).forEach(m => {
    preCatCounts[m.category] = (preCatCounts[m.category] || 0) + 1;
  });
  console.log('Top 100 after reclassification - category distribution:', preCatCounts);
  
  // Build per-category queues sorted by volume
  const ALL_CATEGORIES = ['Entertainment', 'Tech', 'AI', 'Crypto', 'Economics', 'Weather', 'Politics', 'Sports', 'General'];
  const categoryQueues: Record<string, SimplifiedMarket[]> = {};
  
  for (const cat of ALL_CATEGORIES) {
    categoryQueues[cat] = [];
  }
  
  for (const market of uniqueMarkets) {
    const cat = categoryQueues[market.category] ? market.category : 'General';
    categoryQueues[cat].push(market);
  }
  
  // Log queue sizes
  const queueSizes: Record<string, number> = {};
  for (const [cat, queue] of Object.entries(categoryQueues)) {
    queueSizes[cat] = queue.length;
  }
  console.log('Category queue sizes:', queueSizes);
  
  // TRUE ROUND-ROBIN: Cycle through categories, picking the best available market from each
  const result: SimplifiedMarket[] = [];
  const usedEventTickers = new Set<string>();
  const EVENT_COOLDOWN = 10; // Same event only once per 10 cards
  const recentEvents: string[] = [];
  
  // Shuffle category order for variety (but keep Entertainment and Tech early)
  const priorityOrder = ['Entertainment', 'Tech', 'AI', 'Crypto', 'Economics', 'Weather', 'Politics', 'Sports'];
  let categoryIndex = 0;
  let emptyRounds = 0;
  const MAX_EMPTY_ROUNDS = ALL_CATEGORIES.length * 2;
  
  while (result.length < uniqueMarkets.length && emptyRounds < MAX_EMPTY_ROUNDS) {
    const category = priorityOrder[categoryIndex % priorityOrder.length];
    const queue = categoryQueues[category];
    
    // Find the next market from this category that passes event spacing
    let found = false;
    for (let i = 0; i < queue.length; i++) {
      const market = queue[i];
      const eventKey = market.eventTicker || market.id;
      
      // Check if this event was used recently
      const recentEventIndex = recentEvents.indexOf(eventKey);
      if (recentEventIndex !== -1 && (recentEvents.length - recentEventIndex) < EVENT_COOLDOWN) {
        continue; // Skip - event used too recently
      }
      
      // Found a valid market
      result.push(market);
      queue.splice(i, 1);
      
      // Track event for cooldown
      recentEvents.push(eventKey);
      if (recentEvents.length > EVENT_COOLDOWN * 2) {
        recentEvents.shift();
      }
      
      found = true;
      break;
    }
    
    if (!found) {
      emptyRounds++;
    } else {
      emptyRounds = 0;
    }
    
    categoryIndex++;
  }
  
  // Add any remaining markets from General or skipped queues
  for (const cat of ALL_CATEGORIES) {
    const remaining = categoryQueues[cat];
    for (const market of remaining) {
      if (!result.find(m => m.id === market.id)) {
        result.push(market);
      }
    }
  }
  
  // Log final distribution for debugging
  const catCounts: Record<string, number> = {};
  result.slice(0, 40).forEach(m => {
    catCounts[m.category] = (catCounts[m.category] || 0) + 1;
  });
  console.log('First 40 cards - FINAL category distribution:', catCounts);
  
  // Verify all categories present
  const categoriesInFirst40 = Object.keys(catCounts);
  console.log(`Categories represented in first 40: ${categoriesInFirst40.length}/8`);
  
  // EVENT SPACING PASS: Ensure no two markets from the same event appear within 5 positions
  const EVENT_MIN_SPACING = 5;
  const spacedResult = applyEventSpacing(result, EVENT_MIN_SPACING);
  
  return spacedResult;
}

function applyEventSpacing(markets: SimplifiedMarket[], minSpacing: number): SimplifiedMarket[] {
  if (markets.length <= minSpacing) return markets;
  
  const result: SimplifiedMarket[] = [];
  const pending: SimplifiedMarket[] = [...markets];
  const recentEventTickers: string[] = [];
  
  while (pending.length > 0) {
    let found = false;
    
    for (let i = 0; i < pending.length; i++) {
      const market = pending[i];
      const eventKey = market.eventTicker || '';
      
      if (!eventKey) {
        result.push(market);
        pending.splice(i, 1);
        recentEventTickers.push('');
        if (recentEventTickers.length > minSpacing) recentEventTickers.shift();
        found = true;
        break;
      }
      
      const recentIndex = recentEventTickers.lastIndexOf(eventKey);
      if (recentIndex === -1 || (recentEventTickers.length - 1 - recentIndex) >= minSpacing) {
        result.push(market);
        pending.splice(i, 1);
        recentEventTickers.push(eventKey);
        if (recentEventTickers.length > minSpacing) recentEventTickers.shift();
        found = true;
        break;
      }
    }
    
    if (!found && pending.length > 0) {
      result.push(pending.shift()!);
      const eventKey = result[result.length - 1].eventTicker || '';
      recentEventTickers.push(eventKey);
      if (recentEventTickers.length > minSpacing) recentEventTickers.shift();
    }
  }
  
  return result;
}

export { getMockMarkets };
