import crypto from 'crypto';

const KALSHI_BASE_URL = process.env.KALSHI_API_URL || 'https://demo-api.kalshi.co';
const KALSHI_API_KEY = process.env.KALSHI_API_KEY || '';
const KALSHI_PRIVATE_KEY = process.env.KALSHI_API_SECRET || '';

function signRequest(timestamp: string, method: string, path: string): string {
  if (!KALSHI_PRIVATE_KEY) return '';
  
  const pathWithoutQuery = path.split('?')[0];
  const message = `${timestamp}${method}${pathWithoutQuery}`;
  
  try {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(message);
    sign.end();
    return sign.sign({
      key: KALSHI_PRIVATE_KEY,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
    }, 'base64');
  } catch (error) {
    console.error('Error signing Kalshi request:', error);
    return '';
  }
}

function getHeaders(method: string, path: string): Record<string, string> {
  const timestamp = Date.now().toString();
  const signature = signRequest(timestamp, method, path);
  
  return {
    'Content-Type': 'application/json',
    ...(KALSHI_API_KEY && {
      'KALSHI-ACCESS-KEY': KALSHI_API_KEY,
      'KALSHI-ACCESS-SIGNATURE': signature,
      'KALSHI-ACCESS-TIMESTAMP': timestamp,
    }),
  };
}

export interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle: string;
  category: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  volume: number;
  open_interest: number;
  close_time: string;
  status: string;
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
}

export async function getMarkets(limit = 50, cursor?: string): Promise<SimplifiedMarket[]> {
  const path = `/trade-api/v2/markets?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`;
  
  try {
    const response = await fetch(`${KALSHI_BASE_URL}${path}`, {
      method: 'GET',
      headers: getHeaders('GET', path),
    });
    
    if (!response.ok) {
      console.error('Kalshi API error:', response.status, await response.text());
      return getMockMarkets();
    }
    
    const data = await response.json();
    return data.markets?.map(transformMarket) || getMockMarkets();
  } catch (error) {
    console.error('Error fetching Kalshi markets:', error);
    return getMockMarkets();
  }
}

export async function getMarketsByCategory(category: string): Promise<SimplifiedMarket[]> {
  const allMarkets = await getMarkets(100);
  return allMarkets.filter(m => 
    m.category.toLowerCase().includes(category.toLowerCase())
  );
}

function transformMarket(market: any): SimplifiedMarket {
  return {
    id: market.ticker || market.id,
    title: market.title || market.question || '',
    subtitle: market.subtitle || market.description || '',
    category: market.category || 'General',
    yesPrice: (market.yes_bid + market.yes_ask) / 2 / 100 || market.last_price / 100 || 0.5,
    noPrice: (market.no_bid + market.no_ask) / 2 / 100 || (100 - (market.last_price || 50)) / 100,
    volume: market.volume || market.volume_24h || 0,
    endDate: market.close_time || market.expiration_time || new Date().toISOString(),
    status: market.status || 'active',
  };
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
      id: 'AI-AGI-2025',
      title: 'Will OpenAI announce AGI breakthrough in 2025?',
      subtitle: 'Artificial General Intelligence milestone',
      category: 'AI',
      yesPrice: 0.15,
      noPrice: 0.85,
      volume: 56000,
      endDate: '2025-12-31T23:59:59Z',
      status: 'active',
    },
    {
      id: 'SUPERBOWL-CHIEFS',
      title: 'Will the Kansas City Chiefs win Super Bowl LIX?',
      subtitle: 'NFL Championship prediction',
      category: 'Sports',
      yesPrice: 0.22,
      noPrice: 0.78,
      volume: 178000,
      endDate: '2025-02-09T23:59:59Z',
      status: 'active',
    },
    {
      id: 'CLIMATE-TEMP-2025',
      title: 'Will 2025 be the hottest year on record?',
      subtitle: 'Global temperature prediction',
      category: 'Climate',
      yesPrice: 0.68,
      noPrice: 0.32,
      volume: 45000,
      endDate: '2025-12-31T23:59:59Z',
      status: 'active',
    },
    {
      id: 'APPLE-AI-IPHONE',
      title: 'Will Apple release AI-powered iPhone features by June?',
      subtitle: 'Apple Intelligence rollout',
      category: 'Tech',
      yesPrice: 0.82,
      noPrice: 0.18,
      volume: 67000,
      endDate: '2025-06-30T23:59:59Z',
      status: 'active',
    },
    {
      id: 'TAYLOR-GRAMMY',
      title: 'Will Taylor Swift win Album of the Year at Grammys 2025?',
      subtitle: 'Grammy Awards prediction',
      category: 'Pop Culture',
      yesPrice: 0.55,
      noPrice: 0.45,
      volume: 112000,
      endDate: '2025-02-02T23:59:59Z',
      status: 'active',
    },
    {
      id: 'SPACEX-MARS',
      title: 'Will SpaceX launch a Mars mission in 2025?',
      subtitle: 'Space exploration milestone',
      category: 'Science',
      yesPrice: 0.12,
      noPrice: 0.88,
      volume: 34000,
      endDate: '2025-12-31T23:59:59Z',
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

export { getMockMarkets };
