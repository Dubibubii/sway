import { LAMPORTS_PER_SOL } from '@solana/web3.js';

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';

export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const MIN_GAS_SOL = 0.025;

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
  try {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amountLamports.toString(),
      slippageBps: slippageBps.toString(),
    });

    const response = await fetch(`${JUPITER_QUOTE_API}/quote?${params.toString()}`);
    
    if (!response.ok) {
      console.error('Jupiter quote error:', response.status);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching Jupiter quote:', error);
    return null;
  }
}

export async function getSwapTransaction(
  quote: JupiterQuote,
  userPublicKey: string
): Promise<{ swapTransaction: string } | null> {
  try {
    const response = await fetch(JUPITER_SWAP_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    });

    if (!response.ok) {
      console.error('Jupiter swap error:', response.status);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting swap transaction:', error);
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
    
    if (amountLamports <= 0) {
      return { success: false, error: 'Amount too small to swap' };
    }

    const quote = await getJupiterQuote(SOL_MINT, USDC_MINT, amountLamports, slippageBps);
    
    if (!quote) {
      return { success: false, error: 'Failed to get quote from Jupiter' };
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
  const swapAmount = currentSolBalance - MIN_GAS_SOL;
  return swapAmount > 0.001 ? swapAmount : 0;
}

export async function prepareAutoSwap(
  currentSolBalance: number,
  userPublicKey: string
): Promise<SwapResult> {
  const swapAmount = calculateSwapAmount(currentSolBalance);
  
  if (swapAmount <= 0) {
    return {
      success: false,
      error: `Balance too low. Need at least ${MIN_GAS_SOL} SOL for gas reserve.`,
    };
  }

  return prepareSwapSolToUsdc(swapAmount, userPublicKey);
}

export { base64ToUint8Array };
