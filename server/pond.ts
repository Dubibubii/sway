const POND_BASE_URL = 'https://prediction-markets-api.dflow.net/api/v1';

export interface PondMarketAccount {
  isInitialized: boolean;
  marketLedger: string;
  noMint: string;
  yesMint: string;
  redemptionStatus?: string | null;
  scalarOutcomePct?: number | null;
}

export interface PondMarket {
  ticker: string;
  title: string;
  subtitle: string;
  eventTicker: string;
  status: string;
  marketType: string;
  volume: number;
  openInterest: number;
  closeTime: number;
  expirationTime: number;
  yesAsk: string | null;
  yesBid: string | null;
  noAsk: string | null;
  noBid: string | null;
  yesSubTitle: string;
  noSubTitle: string;
  rulesPrimary: string;
  accounts: Record<string, PondMarketAccount>;
}

export interface PondEvent {
  ticker: string;
  title: string;
  subtitle: string;
  seriesTicker: string;
  imageUrl?: string | null;
  volume?: number | null;
  volume24h?: number | null;
  liquidity?: number | null;
  openInterest?: number | null;
  markets?: PondMarket[] | null;
}

export interface SimplifiedMarket {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  endDate: string;
  status: string;
  imageUrl?: string;
  accounts?: Record<string, PondMarketAccount>;
  eventTicker?: string;
}

export async function getMarkets(limit = 50, cursor?: number): Promise<SimplifiedMarket[]> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    status: 'active',
    sort: 'volume',
    isInitialized: 'true',
  });
  if (cursor) params.append('cursor', cursor.toString());
  
  try {
    const response = await fetch(`${POND_BASE_URL}/markets?${params}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      console.error('Pond API error:', response.status, await response.text());
      return getMockMarkets();
    }
    
    const data = await response.json();
    return data.markets?.map(transformMarket) || getMockMarkets();
  } catch (error) {
    console.error('Error fetching Pond markets:', error);
    return getMockMarkets();
  }
}

export async function getEvents(maxMarkets = 500, withNestedMarkets = true): Promise<SimplifiedMarket[]> {
  const allMarkets: SimplifiedMarket[] = [];
  let cursor: string | undefined;
  const pageSize = 100;
  
  try {
    while (allMarkets.length < maxMarkets) {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        withNestedMarkets: withNestedMarkets.toString(),
        status: 'active',
        sort: 'volume',
      });
      
      if (cursor) {
        params.append('cursor', cursor);
      }
      
      const response = await fetch(`${POND_BASE_URL}/events?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        console.error('Pond API error:', response.status, await response.text());
        break;
      }
      
      const data = await response.json();
      const events = data.events || [];
      
      if (events.length === 0) {
        break;
      }
      
      for (const event of events) {
        if (event.markets && event.markets.length > 0) {
          for (const market of event.markets) {
            allMarkets.push(transformMarket(market, event));
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

export async function getMarketsByCategory(category: string): Promise<SimplifiedMarket[]> {
  const allMarkets = await getEvents(100);
  return allMarkets.filter(m => 
    m.category.toLowerCase().includes(category.toLowerCase())
  );
}

function transformMarket(market: PondMarket, event?: PondEvent): SimplifiedMarket {
  const yesAsk = market.yesAsk ? parseFloat(market.yesAsk) : 50;
  const yesBid = market.yesBid ? parseFloat(market.yesBid) : 50;
  
  const yesPrice = (yesAsk + yesBid) / 2 / 100;
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
    volume: market.volume || event?.volume || 0,
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
      id: 'BTC-100K-DEC',
      title: 'Will Bitcoin reach $100K by end of December?',
      subtitle: 'BTC price prediction market',
      category: 'Crypto',
      yesPrice: 0.72,
      noPrice: 0.28,
      volume: 125000,
      endDate: '2024-12-31T23:59:59Z',
      status: 'active',
    },
    {
      id: 'ETH-ETF-Q1',
      title: 'Will an Ethereum ETF be approved in Q1 2025?',
      subtitle: 'SEC regulatory decision',
      category: 'Crypto',
      yesPrice: 0.45,
      noPrice: 0.55,
      volume: 89000,
      endDate: '2025-03-31T23:59:59Z',
      status: 'active',
    },
    {
      id: 'FED-RATE-JAN',
      title: 'Will the Fed cut rates in January 2025?',
      subtitle: 'Federal Reserve monetary policy',
      category: 'Economics',
      yesPrice: 0.38,
      noPrice: 0.62,
      volume: 234000,
      endDate: '2025-01-31T23:59:59Z',
      status: 'active',
    },
    {
      id: 'SOL-200-Q1',
      title: 'Will Solana reach $200 by end of Q1 2025?',
      subtitle: 'SOL price prediction',
      category: 'Crypto',
      yesPrice: 0.48,
      noPrice: 0.52,
      volume: 98000,
      endDate: '2025-03-31T23:59:59Z',
      status: 'active',
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
  const techBefore = markets.filter(m => m.category === 'Tech');
  console.log('Tech markets before binary filter:', techBefore.length, techBefore.map(m => ({ title: m.title, id: m.id })));
  
  const binaryMarkets = markets.filter(m => isBinaryMarket(m.title));
  
  const techAfterBinary = binaryMarkets.filter(m => m.category === 'Tech');
  console.log('Tech markets after binary filter:', techAfterBinary.length);
  
  const seenEventTickers = new Map<string, SimplifiedMarket>();
  
  for (const market of binaryMarkets) {
    const parentKey = market.eventTicker || market.id;
    
    if (!seenEventTickers.has(parentKey)) {
      seenEventTickers.set(parentKey, market);
    } else {
      const existing = seenEventTickers.get(parentKey)!;
      if (market.volume > existing.volume) {
        seenEventTickers.set(parentKey, market);
      }
    }
  }
  
  const uniqueMarkets = Array.from(seenEventTickers.values());
  
  for (let i = uniqueMarkets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uniqueMarkets[i], uniqueMarkets[j]] = [uniqueMarkets[j], uniqueMarkets[i]];
  }
  
  const categories = new Map<string, SimplifiedMarket[]>();
  for (const market of uniqueMarkets) {
    const cat = market.category;
    if (!categories.has(cat)) {
      categories.set(cat, []);
    }
    categories.get(cat)!.push(market);
  }
  
  const diversified: SimplifiedMarket[] = [];
  const categoryQueues = Array.from(categories.values());
  
  while (categoryQueues.some(q => q.length > 0)) {
    for (const queue of categoryQueues) {
      if (queue.length > 0) {
        diversified.push(queue.shift()!);
      }
    }
  }
  
  return diversified;
}

export { getMockMarkets };
