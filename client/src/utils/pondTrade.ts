const DFLOW_API_BASE = 'https://quote-api.dflow.net';
const POND_METADATA_API = 'https://prediction-markets-api.dflow.net';

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDC_DECIMALS = 6;

export interface PondMarketTokens {
  yesMint: string;
  noMint: string;
}

export interface PondOrderResponse {
  quote: {
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    priceImpactPct: string;
    slippageBps: number;
  };
  transaction: string;
  executionMode: 'sync' | 'async';
}

export interface PondTradeResult {
  success: boolean;
  transactionBase64?: string;
  orderResponse?: PondOrderResponse;
  error?: string;
  expectedShares?: number;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function getMarketTokens(marketId: string): Promise<PondMarketTokens | null> {
  const url = `${POND_METADATA_API}/api/v1/market/${marketId}`;
  console.log('[Pond Client] Fetching market tokens from:', url);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    console.log('[Pond Client] Market response status:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Pond Client] Failed to fetch market tokens:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    console.log('[Pond Client] Market data received:', JSON.stringify(data).slice(0, 500));
    
    const accounts = data.accounts || {};
    const yesMint = accounts.yesTokenMint || accounts.yes_token_mint || data.yesMint || data.yes_token_mint;
    const noMint = accounts.noTokenMint || accounts.no_token_mint || data.noMint || data.no_token_mint;
    
    if (!yesMint || !noMint) {
      console.error('[Pond Client] Market tokens not found in response. Accounts:', JSON.stringify(accounts));
      return null;
    }
    
    console.log('[Pond Client] Found token mints - YES:', yesMint, 'NO:', noMint);
    return { yesMint, noMint };
  } catch (error) {
    console.error('[Pond Client] Error fetching market tokens:', error);
    return null;
  }
}

export async function getPondOrder(
  inputMint: string,
  outputMint: string,
  amountAtomic: number,
  userPublicKey: string,
  slippageBps: number = 100
): Promise<PondOrderResponse | null> {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amountAtomic.toString(),
    slippageBps: slippageBps.toString(),
    userPublicKey,
  });

  const url = `${DFLOW_API_BASE}/order?${params.toString()}`;
  console.log('[Pond Client] ========== ORDER REQUEST ==========');
  console.log('[Pond Client] URL:', url);
  console.log('[Pond Client] Input Mint:', inputMint);
  console.log('[Pond Client] Output Mint:', outputMint);
  console.log('[Pond Client] Amount (atomic):', amountAtomic);
  console.log('[Pond Client] User:', userPublicKey);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    
    console.log('[Pond Client] Order response status:', response.status, response.statusText);
    
    const responseText = await response.text();
    console.log('[Pond Client] Response body:', responseText.substring(0, 500));
    
    if (!response.ok) {
      console.error('[Pond Client] ORDER FAILED!');
      console.error('[Pond Client] Status:', response.status);
      console.error('[Pond Client] Full Response:', responseText);
      return null;
    }

    const orderResponse = JSON.parse(responseText);
    console.log('[Pond Client] Order SUCCESS:', {
      outAmount: orderResponse.quote?.outAmount,
      executionMode: orderResponse.executionMode,
      hasTransaction: !!orderResponse.transaction,
    });
    return orderResponse;
  } catch (error: unknown) {
    console.error('[Pond Client] ORDER FETCH ERROR:');
    if (error instanceof Error) {
      console.error('[Pond Client] Error:', error.message);
    } else {
      console.error('[Pond Client] Raw error:', error);
    }
    return null;
  }
}

export async function preparePondTrade(
  marketId: string,
  side: 'yes' | 'no',
  amountUSDC: number,
  userPublicKey: string,
  slippageBps: number = 100
): Promise<PondTradeResult> {
  console.log('[Pond Client] ========== PREPARE TRADE ==========');
  console.log('[Pond Client] Market:', marketId);
  console.log('[Pond Client] Side:', side);
  console.log('[Pond Client] Amount USDC:', amountUSDC);
  console.log('[Pond Client] User:', userPublicKey);

  try {
    const marketTokens = await getMarketTokens(marketId);
    
    if (!marketTokens) {
      return {
        success: false,
        error: 'Market tokens not found for this market. This market may not be available for on-chain trading yet.',
      };
    }

    const outputMint = side === 'yes' ? marketTokens.yesMint : marketTokens.noMint;
    const amountAtomic = Math.floor(amountUSDC * Math.pow(10, USDC_DECIMALS));

    console.log('[Pond Client] Output mint:', outputMint);
    console.log('[Pond Client] Amount atomic:', amountAtomic);

    const orderResponse = await getPondOrder(
      USDC_MINT,
      outputMint,
      amountAtomic,
      userPublicKey,
      slippageBps
    );

    if (!orderResponse || !orderResponse.transaction) {
      return {
        success: false,
        error: 'Failed to get order from DFlow API. The API may be temporarily unavailable.',
      };
    }

    const expectedShares = orderResponse.quote?.outAmount
      ? parseInt(orderResponse.quote.outAmount) / Math.pow(10, USDC_DECIMALS)
      : undefined;

    return {
      success: true,
      transactionBase64: orderResponse.transaction,
      orderResponse,
      expectedShares,
    };
  } catch (error: any) {
    console.error('[Pond Client] Trade preparation error:', error);
    return {
      success: false,
      error: error.message || 'Failed to prepare trade',
    };
  }
}

export { base64ToUint8Array };
