import { LAMPORTS_PER_SOL } from '@solana/web3.js';

export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Reserve SOL for gas + rent (token account creation costs ~0.002-0.003 SOL each)
// Gas should never exceed 5% of the deposit to maximize user value
export const GAS_PERCENTAGE_CAP = 0.05;    // 5% max of deposit for gas
export const GAS_RESERVE_MIN = 0.0025;     // Minimum gas for very small deposits (< 0.05 SOL)
export const GAS_RESERVE_FLOOR = 0.002;    // Absolute floor - enough for 1 transaction
export const SMALL_DEPOSIT_THRESHOLD = 0.05;
export const TINY_DEPOSIT_THRESHOLD = 0.02;
export const MICRO_DEPOSIT_THRESHOLD = 0.1;
export const LARGE_DEPOSIT_THRESHOLD = 0.5;

// Legacy exports for compatibility
export const GAS_RESERVE_TINY = 0.0025;
export const GAS_RESERVE_MICRO = 0.005;
export const GAS_RESERVE_STANDARD = 0.015;
export const GAS_RESERVE_LARGE = 0.03;

export function getDynamicGasReserve(solBalance: number): number {
  // Calculate 5% of the deposit
  const fivePercent = solBalance * GAS_PERCENTAGE_CAP;
  
  // For very small deposits (< 0.05 SOL), use fixed minimal reserve
  if (solBalance < SMALL_DEPOSIT_THRESHOLD) {
    // Use 0.0025 SOL or 5% of balance, whichever is smaller
    // But never go below the absolute floor
    return Math.max(GAS_RESERVE_FLOOR, Math.min(GAS_RESERVE_MIN, fivePercent));
  }
  
  // For normal deposits, cap gas at 5% of the deposit
  // But ensure minimum viable gas for transactions
  if (solBalance < MICRO_DEPOSIT_THRESHOLD) {
    return Math.min(GAS_RESERVE_MICRO, fivePercent);
  }
  if (solBalance < LARGE_DEPOSIT_THRESHOLD) {
    return Math.min(GAS_RESERVE_STANDARD, fivePercent);
  }
  // For large deposits, use standard reserve (will be well under 5%)
  return GAS_RESERVE_LARGE;
}

export const MIN_GAS_SOL = 0.004;

// Use server-side proxy to avoid CORS issues
const JUPITER_QUOTE_API = '/api/jupiter/quote';
const JUPITER_SWAP_API = '/api/jupiter/swap';

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  slippageBps: number;
  otherAmountThreshold: string;
  routePlan: any[];
}

export interface SwapResult {
  success: boolean;
  transactionBase64?: string;
  quote?: JupiterQuote;
  error?: string;
  expectedUsdcOut?: number;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amountLamports: number,
  slippageBps: number = 50
): Promise<JupiterQuote | null> {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amountLamports.toString(),
    slippageBps: slippageBps.toString(),
    restrictIntermediateTokens: 'true',
  });

  const url = `${JUPITER_QUOTE_API}?${params.toString()}`;
  console.log('[Jupiter] ========== QUOTE REQUEST ==========');
  console.log('[Jupiter] URL:', url);
  console.log('[Jupiter] Input:', inputMint);
  console.log('[Jupiter] Output:', outputMint);
  console.log('[Jupiter] Amount (lamports):', amountLamports);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    console.log('[Jupiter] Response status:', response.status, response.statusText);
    
    const responseText = await response.text();
    console.log('[Jupiter] Response body:', responseText.substring(0, 500));
    
    if (!response.ok) {
      console.error('[Jupiter] QUOTE FAILED!');
      console.error('[Jupiter] Status:', response.status);
      console.error('[Jupiter] Status Text:', response.statusText);
      console.error('[Jupiter] Full Response:', responseText);
      return null;
    }

    const quote = JSON.parse(responseText);
    console.log('[Jupiter] Quote SUCCESS:', { 
      outAmount: quote.outAmount, 
      priceImpact: quote.priceImpactPct,
      routeCount: quote.routePlan?.length 
    });
    return quote;
  } catch (error: unknown) {
    console.error('[Jupiter] FETCH ERROR (network/parse issue):');
    if (error instanceof Error) {
      console.error('[Jupiter] Error name:', error.name);
      console.error('[Jupiter] Error message:', error.message);
      console.error('[Jupiter] Error stack:', error.stack);
    } else {
      console.error('[Jupiter] Raw error:', error);
    }
    return null;
  }
}

export async function getSwapTransaction(
  quote: JupiterQuote,
  userPublicKey: string
): Promise<{ swapTransaction: string } | null> {
  console.log('[Jupiter] ========== SWAP REQUEST ==========');
  console.log('[Jupiter] User public key:', userPublicKey);
  console.log('[Jupiter] Quote inAmount:', quote.inAmount);
  console.log('[Jupiter] Quote outAmount:', quote.outAmount);
  
  // Server proxy handles the additional swap options
  const requestBody = {
    quoteResponse: quote,
    userPublicKey,
  };
  
  try {
    const response = await fetch(JUPITER_SWAP_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('[Jupiter] Swap response status:', response.status, response.statusText);
    
    const responseText = await response.text();
    
    if (!response.ok) {
      console.error('[Jupiter] SWAP FAILED!');
      console.error('[Jupiter] Status:', response.status);
      console.error('[Jupiter] Full Response:', responseText);
      return null;
    }

    const result = JSON.parse(responseText);
    console.log('[Jupiter] Swap transaction received, length:', result.swapTransaction?.length);
    return result;
  } catch (error: unknown) {
    console.error('[Jupiter] SWAP FETCH ERROR:');
    if (error instanceof Error) {
      console.error('[Jupiter] Error name:', error.name);
      console.error('[Jupiter] Error message:', error.message);
      console.error('[Jupiter] Error stack:', error.stack);
    } else {
      console.error('[Jupiter] Raw error:', error);
    }
    return null;
  }
}

export async function prepareSwapSolToUsdc(
  solAmount: number,
  userPublicKey: string,
  slippageBps: number = 50
): Promise<SwapResult> {
  try {
    const amountLamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
    
    console.log('[Jupiter] prepareSwapSolToUsdc called:');
    console.log('[Jupiter]   solAmount:', solAmount);
    console.log('[Jupiter]   amountLamports:', amountLamports);
    console.log('[Jupiter]   userPublicKey:', userPublicKey);
    
    if (amountLamports <= 0) {
      console.error('[Jupiter] Amount too small! amountLamports:', amountLamports);
      return { success: false, error: `Amount too small to swap (${amountLamports} lamports)` };
    }

    console.log('[Jupiter] Calling getJupiterQuote...');
    const quote = await getJupiterQuote(SOL_MINT, USDC_MINT, amountLamports, slippageBps);
    
    if (!quote) {
      console.error('[Jupiter] getJupiterQuote returned null - check logs above for API response');
      return { success: false, error: 'Jupiter quote failed - check browser console for details' };
    }

    const swapData = await getSwapTransaction(quote, userPublicKey);
    
    if (!swapData || !swapData.swapTransaction) {
      return { success: false, error: 'Failed to get swap transaction' };
    }

    const expectedUsdcOut = parseInt(quote.outAmount) / 1_000_000;

    return {
      success: true,
      transactionBase64: swapData.swapTransaction,
      quote,
      expectedUsdcOut,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to prepare swap',
    };
  }
}

export function calculateSwapAmount(currentSolBalance: number): number {
  const gasReserve = getDynamicGasReserve(currentSolBalance);
  const swapAmount = currentSolBalance - gasReserve;
  return swapAmount > 0.001 ? swapAmount : 0;
}

export async function prepareAutoSwap(
  currentSolBalance: number,
  userPublicKey: string
): Promise<SwapResult> {
  const swapAmount = calculateSwapAmount(currentSolBalance);
  const gasReserve = getDynamicGasReserve(currentSolBalance);
  
  if (swapAmount <= 0) {
    return {
      success: false,
      error: `Balance too low. Need at least ${gasReserve} SOL for gas reserve.`,
    };
  }

  return prepareSwapSolToUsdc(swapAmount, userPublicKey);
}

export { base64ToUint8Array };
