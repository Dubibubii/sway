const DFLOW_API_BASE = 'https://quote-api.dflow.net';
const POND_METADATA_API = 'https://api.pond.dflow.net';

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

export async function getPondQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
  userPublicKey: string,
  slippageBps: number = 100,
  apiKey?: string
): Promise<PondOrderResponse> {
  const queryParams = new URLSearchParams();
  queryParams.append('inputMint', inputMint);
  queryParams.append('outputMint', outputMint);
  queryParams.append('amount', amount.toString());
  queryParams.append('slippageBps', slippageBps.toString());
  queryParams.append('userPublicKey', userPublicKey);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

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

export async function getMarketTokens(marketId: string): Promise<{ yesMint: string; noMint: string } | null> {
  try {
    const response = await fetch(`${POND_METADATA_API}/v1/markets/${marketId}`);
    
    if (!response.ok) {
      console.error('Failed to fetch market tokens:', response.status);
      return null;
    }

    const data = await response.json();
    return {
      yesMint: data.yes_token_mint || data.yesMint,
      noMint: data.no_token_mint || data.noMint,
    };
  } catch (error) {
    console.error('Error fetching market tokens:', error);
    return null;
  }
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

export const SOLANA_TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};
