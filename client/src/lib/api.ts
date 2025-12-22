const API_BASE = '/api';

async function fetchWithAuth(url: string, options: RequestInit = {}, privyId?: string | null, accessToken?: string | null) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  if (privyId) {
    headers['x-privy-user-id'] = privyId;
  }
  
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  
  return response.json();
}

export interface Market {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  yesPrice: number;
  noPrice: number;
  yesLabel: string;
  noLabel: string;
  volume: number;
  volume24h?: number;
  endDate: string;
  status: string;
  imageUrl?: string;
  eventTicker?: string;
}

export interface Trade {
  id: string;
  userId: string;
  marketId: string;
  marketTitle: string;
  marketCategory: string | null;
  direction: string;
  wagerAmount: number;
  price: string;
  shares: string;
  estimatedPayout: string;
  isClosed: boolean;
  closedAt: string | null;
  pnl: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  privyId: string;
  walletAddress: string | null;
  yesWager: number;
  noWager: number;
  interests: string[];
  createdAt: string;
}

export async function getMarkets(category?: string): Promise<{ markets: Market[] }> {
  const params = category && category !== 'all' ? `?category=${category}` : '';
  return fetchWithAuth(`/markets${params}`);
}

export async function createOrGetUser(privyId: string, walletAddress?: string | null): Promise<{ user: User }> {
  return fetchWithAuth('/users', {
    method: 'POST',
    body: JSON.stringify({ privyId, walletAddress }),
  });
}

export async function getMe(privyId: string): Promise<{ user: User }> {
  return fetchWithAuth('/users/me', {}, privyId);
}

export async function updateSettings(
  privyId: string, 
  settings: { yesWager?: number; noWager?: number; interests?: string[] }
): Promise<{ user: User }> {
  return fetchWithAuth('/users/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  }, privyId);
}

export async function createTrade(
  privyId: string,
  trade: {
    marketId: string;
    marketTitle: string;
    marketCategory: string | null;
    direction: 'YES' | 'NO';
    wagerAmount: number;
    price: number;
  }
): Promise<{ trade: Trade }> {
  return fetchWithAuth('/trades', {
    method: 'POST',
    body: JSON.stringify(trade),
  }, privyId);
}

export async function getTrades(privyId: string): Promise<{ trades: Trade[] }> {
  return fetchWithAuth('/trades', {}, privyId);
}

export async function getPositions(privyId: string): Promise<{ positions: Trade[] }> {
  return fetchWithAuth('/positions', {}, privyId);
}

export async function closeTrade(privyId: string, tradeId: string, pnl: number): Promise<{ trade: Trade }> {
  return fetchWithAuth(`/trades/${tradeId}/close`, {
    method: 'POST',
    body: JSON.stringify({ pnl }),
  }, privyId);
}
