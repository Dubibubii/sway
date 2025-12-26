// DFlow Development API endpoints for real trading
const DFLOW_API_BASE = process.env.DFLOW_QUOTE_API_BASE || 'https://dev-quote-api.dflow.net';
const POND_METADATA_API = process.env.DFLOW_PREDICTION_API_BASE || 'https://dev-prediction-markets-api.dflow.net';

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
