const KALSHI_BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2';

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
  yesLabel: string;
  noLabel: string;
  volume: number;
  volume24h: number;
  endDate: string;
  status: string;
  imageUrl?: string;
  accounts?: Record<string, PondMarketAccount>;
  eventTicker?: string;
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

export async function getEvents(maxMarkets = 500, withNestedMarkets = true): Promise<SimplifiedMarket[]> {
  const allMarkets: SimplifiedMarket[] = [];
  const marketIds = new Set<string>();
  let cursor: string | undefined;
  const pageSize = 100;
  
  try {
    // First, fetch high-volume markets directly using the markets endpoint
    // This ensures we get popular markets that might be missed in events pagination
    console.log('Fetching high-volume markets first...');
    const highVolumeMarkets = await fetchHighVolumeMarkets();
    for (const market of highVolumeMarkets) {
      if (!marketIds.has(market.id)) {
        allMarkets.push(market);
        marketIds.add(market.id);
      }
    }
    console.log(`Added ${highVolumeMarkets.length} high-volume markets`);
    
    // Then fetch from events endpoint for broader coverage
    while (allMarkets.length < maxMarkets) {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        with_nested_markets: withNestedMarkets.toString(),
      });
      
      if (cursor) {
        params.append('cursor', cursor);
      }
      
      const response = await fetch(`${KALSHI_BASE_URL}/events?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        console.error('Kalshi API error:', response.status, await response.text());
        break;
      }
      
      const data = await response.json();
      const events: KalshiEvent[] = data.events || [];
      
      if (events.length === 0) {
        break;
      }
      
      for (const event of events) {
        if (event.markets && event.markets.length > 0) {
          for (const market of event.markets) {
            if (market.status !== 'active') continue;
            if (!market.yes_ask && !market.yes_bid) continue;
            if (marketIds.has(market.ticker)) continue;
            
            allMarkets.push(transformKalshiMarket(market, event));
            marketIds.add(market.ticker);
          }
        }
      }
      
      cursor = data.cursor;
      if (!cursor) {
        break;
      }
      
      console.log(`Fetched ${allMarkets.length} markets so far...`);
    }
    
    console.log(`Total markets fetched: ${allMarkets.length}`);
    
    const categoryCount: Record<string, number> = {};
    for (const m of allMarkets) {
      categoryCount[m.category] = (categoryCount[m.category] || 0) + 1;
    }
    console.log('Market categories breakdown:', categoryCount);
    
    return allMarkets.length > 0 ? allMarkets : getMockMarkets();
  } catch (error) {
    console.error('Error fetching Pond events:', error);
    return allMarkets.length > 0 ? allMarkets : getMockMarkets();
  }
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
];

// Fetch high-volume markets directly from the markets endpoint
async function fetchHighVolumeMarkets(): Promise<SimplifiedMarket[]> {
  const markets: SimplifiedMarket[] = [];
  const marketIds = new Set<string>();
  let cursor: string | undefined;
  const pageSize = 200;
  let pagesFetched = 0;
  const maxPages = 5; // Fetch up to 1000 markets from the markets endpoint
  
  try {
    // First, fetch priority series events to ensure we get important markets
    console.log('Fetching priority series...');
    for (const seriesTicker of PRIORITY_SERIES) {
      try {
        const response = await fetch(`${KALSHI_BASE_URL}/events?series_ticker=${seriesTicker}&with_nested_markets=true&limit=20`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        
        if (response.ok) {
          const data = await response.json();
          const events = data.events || [];
          
          for (const event of events) {
            if (event.markets && event.markets.length > 0) {
              for (const market of event.markets) {
                if (market.status !== 'active') continue;
                if (marketIds.has(market.ticker)) continue;
                
                markets.push(transformKalshiMarket(market, event));
                marketIds.add(market.ticker);
              }
            }
          }
        }
      } catch (e) {
        console.error(`Error fetching priority series ${seriesTicker}:`, e);
      }
    }
    console.log(`Added ${markets.length} markets from priority series`);
    
    // Then fetch from general markets endpoint
    while (pagesFetched < maxPages) {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        status: 'active',
      });
      
      if (cursor) {
        params.append('cursor', cursor);
      }
      
      const response = await fetch(`${KALSHI_BASE_URL}/markets?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        console.error('Kalshi markets API error:', response.status);
        break;
      }
      
      const data = await response.json();
      const rawMarkets = data.markets || [];
      
      if (rawMarkets.length === 0) {
        break;
      }
      
      for (const market of rawMarkets) {
        if (market.status !== 'active') continue;
        if (!market.yes_ask && !market.yes_bid && !market.last_price) continue;
        if (marketIds.has(market.ticker)) continue;
        
        markets.push(transformKalshiMarket(market));
        marketIds.add(market.ticker);
      }
      
      cursor = data.cursor;
      pagesFetched++;
      
      if (!cursor) {
        break;
      }
    }
    
    // Sort by 24h volume and return top markets
    markets.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
    
    console.log(`fetchHighVolumeMarkets: Got ${markets.length} total markets`);
    
    return markets;
  } catch (error) {
    console.error('Error fetching high-volume markets:', error);
    return [];
  }
}

export async function getMarketsByCategory(category: string): Promise<SimplifiedMarket[]> {
  const allMarkets = await getEvents(100);
  return allMarkets.filter(m => 
    m.category.toLowerCase().includes(category.toLowerCase())
  );
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

function detectCategoryFromTitle(title: string): string {
  const upperTitle = title.toUpperCase();
  
  const cryptoKeywords = ['BITCOIN', 'BTC', 'ETHEREUM', 'ETH', 'SOLANA', 'SOL', 'CRYPTO', 'XRP', 'DOGECOIN', 'DOGE'];
  for (const keyword of cryptoKeywords) {
    if (upperTitle.includes(keyword)) return 'Crypto';
  }
  
  const aiKeywords = ['AI', 'ARTIFICIAL INTELLIGENCE', 'OPENAI', 'GPT', 'CHATGPT', 'ANTHROPIC', 'CLAUDE', 'AGI', 'MACHINE LEARNING'];
  for (const keyword of aiKeywords) {
    if (upperTitle.includes(keyword)) return 'AI';
  }
  
  const techKeywords = ['TESLA', 'APPLE', 'GOOGLE', 'AMAZON', 'MICROSOFT', 'NVIDIA', 'META', 'SPACEX', 'TWITTER', 'TIKTOK', 'IPO', 'STARTUP', 'IPHONE', 'ANDROID'];
  for (const keyword of techKeywords) {
    if (upperTitle.includes(keyword)) return 'Tech';
  }
  
  const sportsKeywords = ['NFL', 'NBA', 'MLB', 'NHL', 'SUPER BOWL', 'WORLD SERIES', 'CHAMPIONSHIP', 'PLAYOFF', 'MVP', 'TOUCHDOWN', 'HOME RUN'];
  for (const keyword of sportsKeywords) {
    if (upperTitle.includes(keyword)) return 'Sports';
  }
  
  const economicsKeywords = ['FED', 'FEDERAL RESERVE', 'INTEREST RATE', 'INFLATION', 'GDP', 'UNEMPLOYMENT', 'STOCK', 'S&P', 'NASDAQ', 'DOW'];
  for (const keyword of economicsKeywords) {
    if (upperTitle.includes(keyword)) return 'Economics';
  }
  
  const politicsKeywords = ['TRUMP', 'BIDEN', 'PRESIDENT', 'CONGRESS', 'SENATE', 'ELECTION', 'VOTE', 'GOVERNOR', 'REPUBLICAN', 'DEMOCRAT'];
  for (const keyword of politicsKeywords) {
    if (upperTitle.includes(keyword)) return 'Politics';
  }
  
  return 'General';
}

function transformKalshiMarket(market: KalshiMarket, event?: KalshiEvent): SimplifiedMarket {
  const yesAsk = market.yes_ask || 0;
  const yesBid = market.yes_bid || 0;
  
  let yesPrice: number;
  if (yesAsk > 0 && yesBid > 0) {
    yesPrice = (yesAsk + yesBid) / 2 / 100;
  } else if (yesAsk > 0) {
    yesPrice = yesAsk / 100;
  } else if (yesBid > 0) {
    yesPrice = yesBid / 100;
  } else if (market.last_price > 0) {
    yesPrice = market.last_price / 100;
  } else {
    yesPrice = 0.5;
  }
  const noPrice = 1 - yesPrice;
  
  const kalshiCategory = event?.category || market.category || '';
  const mappedCategory = mapKalshiCategory(kalshiCategory);
  const seriesTicker = event?.series_ticker || market.event_ticker?.split('-')[0] || '';
  const category = mappedCategory || formatCategory(seriesTicker) || detectCategoryFromTitle(market.title);
  
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
  const yesAsk = market.yesAsk ? parseFloat(market.yesAsk) : null;
  const yesBid = market.yesBid ? parseFloat(market.yesBid) : null;
  
  
  // API returns prices as decimals (0-1 range) - just use them directly
  let yesPrice: number;
  if (yesAsk !== null && yesBid !== null) {
    yesPrice = (yesAsk + yesBid) / 2;
  } else if (yesAsk !== null) {
    yesPrice = yesAsk;
  } else if (yesBid !== null) {
    yesPrice = yesBid;
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
    'KXOSCAR': 'General',
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
    'Crypto': ['BITCOIN', 'ETHEREUM', 'SOLANA', 'CRYPTO', 'COIN', 'TOKEN'],
    'Tech': ['TESLA', 'APPLE', 'GOOGLE', 'AMAZON', 'MICROSOFT', 'NVIDIA', 'META', 'SPACEX', 'TWITTER', 'TIKTOK', 'IPO', 'STARTUP'],
    'AI': ['OPENAI', 'CHATGPT', 'GPT', 'ARTIFICIAL', 'MACHINE LEARNING', 'ANTHROPIC'],
    'Politics': ['TRUMP', 'BIDEN', 'ELECTION', 'CONGRESS', 'SENATE', 'SUPREME', 'GOVERNOR', 'PRESIDENT'],
    'Economics': ['FED', 'INFLATION', 'GDP', 'JOBS', 'UNEMPLOYMENT', 'NASDAQ', 'SP500', 'DOW'],
    'Weather': ['HURRICANE', 'TEMPERATURE', 'CLIMATE', 'STORM', 'WEATHER'],
    'Sports': ['NFL', 'NBA', 'MLB', 'NHL', 'SOCCER', 'FOOTBALL', 'BASKETBALL', 'BASEBALL', 'HOCKEY'],
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

export function diversifyMarketFeed(markets: SimplifiedMarket[]): SimplifiedMarket[] {
  const activeMarkets = markets.filter(m => {
    const yesPercent = m.yesPrice * 100;
    const noPercent = m.noPrice * 100;
    if (yesPercent >= 97 || yesPercent <= 3) return false;
    if (noPercent >= 97 || noPercent <= 3) return false;
    return true;
  });
  
  console.log(`Filtered out ${markets.length - activeMarkets.length} extreme probability markets`);
  
  const binaryMarkets = activeMarkets.filter(m => isBinaryMarket(m.title));
  
  const seenEventTickers = new Map<string, SimplifiedMarket>();
  
  for (const market of binaryMarkets) {
    const parentKey = market.eventTicker || market.id;
    
    if (!seenEventTickers.has(parentKey)) {
      seenEventTickers.set(parentKey, market);
    } else {
      const existing = seenEventTickers.get(parentKey)!;
      if ((market.volume24h || 0) > (existing.volume24h || 0)) {
        seenEventTickers.set(parentKey, market);
      }
    }
  }
  
  const uniqueMarkets = Array.from(seenEventTickers.values());
  
  uniqueMarkets.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
  
  const diversified: SimplifiedMarket[] = [];
  const remaining = [...uniqueMarkets];
  
  while (remaining.length > 0) {
    const recentCategories: string[] = [];
    for (let i = diversified.length - 1; i >= 0 && recentCategories.length < 2; i--) {
      recentCategories.push(diversified[i].category);
    }
    
    let bestIndex = -1;
    for (let i = 0; i < remaining.length; i++) {
      const market = remaining[i];
      if (!recentCategories.includes(market.category)) {
        bestIndex = i;
        break;
      }
    }
    
    if (bestIndex === -1) {
      bestIndex = 0;
    }
    
    diversified.push(remaining[bestIndex]);
    remaining.splice(bestIndex, 1);
  }
  
  return diversified;
}

export { getMockMarkets };
