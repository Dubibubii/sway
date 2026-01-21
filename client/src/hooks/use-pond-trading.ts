import { useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function encodeBase58(bytes: Uint8Array): string {
  const digits = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let str = '';
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) str += '1';
  for (let i = digits.length - 1; i >= 0; i--) str += BASE58_ALPHABET[digits[i]];
  return str;
}

export interface PondTradeResult {
  success: boolean;
  signature?: string;
  error?: string;
  executionMode?: 'sync' | 'async';
  expectedShares?: number;
  actualShares?: number;
  expectedUSDC?: number;
  actualUSDCSpent?: number;
  isAsync?: boolean;
}

// Callback for when async trade fill is confirmed
export interface FillConfirmation {
  signature: string;
  expectedShares?: number;
  actualShares: number;
  expectedUSDC?: number;
  actualUSDCSpent: number;
  isPartialFill: boolean;
}

interface OrderStatusFill {
  outAmount: string;
  inAmount: string;
}

interface OrderStatusResponse {
  status: 'open' | 'pendingClose' | 'closed' | 'failed';
  fills?: OrderStatusFill[];
}

// Poll order status for async trades to get actual fill amounts
async function pollOrderStatus(
  signature: string,
  token: string,
  maxAttempts: number = 10,
  delayMs: number = 2000
): Promise<{ actualShares: number; actualUSDCSpent: number; status: string } | null> {
  console.log('[PondTrading] Polling order status for signature:', signature);
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`/api/pond/order-status/${signature}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) {
        console.warn('[PondTrading] Order status request failed:', response.status);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      
      const data: OrderStatusResponse = await response.json();
      console.log('[PondTrading] Order status:', data.status, 'fills:', data.fills?.length || 0);
      
      // If order is complete, calculate actual shares and USDC spent from fills
      if (data.status === 'closed' || data.status === 'pendingClose') {
        if (data.fills && data.fills.length > 0) {
          // Sum up all fill amounts
          // outAmount = tokens received (shares), inAmount = USDC spent
          const totalOutAmount = data.fills.reduce((sum, fill) => {
            return sum + parseInt(fill.outAmount || '0');
          }, 0);
          const totalInAmount = data.fills.reduce((sum, fill) => {
            return sum + parseInt(fill.inAmount || '0');
          }, 0);
          const actualShares = totalOutAmount / 1_000_000; // Convert from atomic units
          const actualUSDCSpent = totalInAmount / 1_000_000; // USDC has 6 decimals
          console.log('[PondTrading] Order complete! Actual shares:', actualShares, 'USDC spent:', actualUSDCSpent);
          return { actualShares, actualUSDCSpent, status: data.status };
        }
        // Order closed but no fills - might be cancelled
        console.warn('[PondTrading] Order closed with no fills');
        return { actualShares: 0, actualUSDCSpent: 0, status: data.status };
      }
      
      if (data.status === 'failed') {
        console.error('[PondTrading] Order failed');
        return null;
      }
      
      // Still open, wait and retry
      await new Promise(resolve => setTimeout(resolve, delayMs));
    } catch (error) {
      console.error('[PondTrading] Error polling order status:', error);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  console.warn('[PondTrading] Order status polling timed out after', maxAttempts, 'attempts');
  return null;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function getMarketTokensFromServer(marketId: string): Promise<{ yesMint: string; noMint: string; isInitialized: boolean } | null> {
  console.log('[PondTrading] Fetching market tokens via server for:', marketId);
  
  try {
    const response = await fetch(`/api/pond/market/${marketId}/tokens`);
    
    console.log('[PondTrading] Market token response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PondTrading] Failed to fetch market tokens:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    console.log('[PondTrading] Market tokens received:', data);
    
    if (!data.yesMint || !data.noMint) {
      console.error('[PondTrading] Market tokens not found in response');
      return null;
    }
    
    return { yesMint: data.yesMint, noMint: data.noMint, isInitialized: data.isInitialized ?? false };
  } catch (error) {
    console.error('[PondTrading] Error fetching market tokens:', error);
    return null;
  }
}

export function usePondTrading() {
  const { getAccessToken, user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const [isTrading, setIsTrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFillConfirmation, setLastFillConfirmation] = useState<FillConfirmation | null>(null);

  const placeTrade = useCallback(async (
    marketId: string,
    side: 'yes' | 'no',
    amountUSDC: number,
    usdcBalance?: number,
    embeddedWalletAddress?: string,
    channel: 'swipe' | 'discovery' | 'positions' = 'swipe',
    solBalance?: number
  ): Promise<PondTradeResult> => {
    setIsTrading(true);
    setError(null);

    try {
      console.log('[PondTrading] Wallets ready:', walletsReady);
      console.log('[PondTrading] Wallet count:', wallets.length);
      console.log('[PondTrading] Looking for embedded wallet address:', embeddedWalletAddress);
      console.log('[PondTrading] Available wallets:', wallets.map((w: any) => ({
        address: w.address,
        type: w.walletClientType,
        connector: w.connectorType
      })));
      
      // Try to find embedded wallet by address first, then by type
      let embeddedWallet = embeddedWalletAddress 
        ? wallets.find((w: any) => w.address === embeddedWalletAddress)
        : null;
        
      if (!embeddedWallet) {
        embeddedWallet = wallets.find((w: any) => 
          w.walletClientType === 'privy' || w.connectorType === 'embedded'
        );
      }
      
      // If still not found but we have the address, try using any available wallet
      if (!embeddedWallet && wallets.length > 0) {
        console.log('[PondTrading] Embedded not found, using first available wallet');
        embeddedWallet = wallets[0];
      }
      
      if (!embeddedWallet) {
        console.error('[PondTrading] No wallet found. Wallets ready:', walletsReady, 'Count:', wallets.length);
        throw new Error('No embedded wallet found. Please log in with Privy to create an embedded wallet for trading.');
      }

      // Check balance - if insufficient, throw specific error for funding prompt
      // Fee is deducted from wager by DFlow, so user just needs enough for the wager amount
      console.log('[PondTrading] Balance check - usdcBalance:', usdcBalance, 'type:', typeof usdcBalance, 'amountUSDC:', amountUSDC);
      if (usdcBalance !== undefined && usdcBalance < amountUSDC) {
        console.log('[PondTrading] Insufficient funds - throwing INSUFFICIENT_FUNDS error');
        const err = new Error(`INSUFFICIENT_FUNDS:${usdcBalance.toFixed(2)}:${amountUSDC.toFixed(2)}`);
        throw err;
      }
      
      // Check SOL balance for gas fees - minimum 0.003 SOL needed for transaction
      // Block trades if balance hasn't been fetched yet (undefined) to ensure gas check always runs
      const MIN_SOL_FOR_GAS = 0.003;
      console.log('[PondTrading] SOL balance check - solBalance:', solBalance);
      if (solBalance === undefined || solBalance === null) {
        console.log('[PondTrading] SOL balance not yet fetched - blocking trade');
        throw new Error('BALANCE_LOADING:Please wait for your wallet balance to load before trading.');
      }
      if (solBalance < MIN_SOL_FOR_GAS) {
        console.log('[PondTrading] Insufficient SOL for gas - throwing INSUFFICIENT_GAS error');
        throw new Error(`INSUFFICIENT_GAS:${solBalance.toFixed(4)}:${MIN_SOL_FOR_GAS}`);
      }
      console.log('[PondTrading] Balance check passed, proceeding with trade');
      
      const tradingWallet = embeddedWallet;
      const userPublicKey = tradingWallet.address;
      
      if (!userPublicKey) {
        throw new Error('No Solana wallet connected. Please connect your Solana wallet first.');
      }

      console.log('[PondTrading] ========== EXECUTING TRADE ==========');
      console.log('[PondTrading] Market:', marketId);
      console.log('[PondTrading] Side:', side);
      console.log('[PondTrading] Amount USDC:', amountUSDC);
      console.log('[PondTrading] User wallet:', userPublicKey);
      console.log('[PondTrading] Using embedded wallet:', !!embeddedWallet);

      const marketTokens = await getMarketTokensFromServer(marketId);
      
      if (!marketTokens) {
        throw new Error('This market is not yet available for on-chain trading. Try a different market.');
      }

      // Check if market is initialized on-chain
      if (!marketTokens.isInitialized) {
        console.error('[PondTrading] Market not initialized on-chain:', marketId);
        throw new Error('This market is not yet set up for trading. Please try another market.');
      }

      const outputMint = side === 'yes' ? marketTokens.yesMint : marketTokens.noMint;
      console.log('[PondTrading] Output mint:', outputMint);

      const token = await getAccessToken();

      const quoteResponse = await fetch('/api/pond/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          inputMint: USDC_MINT,
          outputMint,
          amountUSDC,
          userPublicKey,
          slippageBps: 100,
          channel, // Pass channel for fee calculation
        }),
      });

      console.log('[PondTrading] Order response status:', quoteResponse.status);

      if (!quoteResponse.ok) {
        const errorText = await quoteResponse.text();
        console.error('[PondTrading] Order failed:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          throw new Error(`Server error: ${quoteResponse.status} - ${errorText}`);
        }
        
        // Provide user-friendly error messages for common DFlow errors
        const errorMsg = errorData.error || '';
        if (errorMsg.includes('route_not_found') || errorMsg.includes('Route not found')) {
          throw new Error('This market is not yet available for trading on Solana. It may be a new market that will be available soon. Please try again in a few minutes.');
        }
        if (errorMsg.includes('insufficient_liquidity') || errorMsg.includes('Insufficient liquidity')) {
          throw new Error('Not enough liquidity to complete this trade at the current price. Try a smaller amount or wait for more liquidity.');
        }
        
        throw new Error(errorData.error || 'Failed to get order from DFlow API');
      }

      const orderData = await quoteResponse.json();
      console.log('[PondTrading] Order received:', JSON.stringify(orderData).slice(0, 300));
      
      const { transaction, executionMode, quote } = orderData;

      if (!transaction) {
        throw new Error('No transaction returned from DFlow API');
      }

      console.log('[PondTrading] Trade prepared, signing transaction...');
      
      const transactionBytes = base64ToUint8Array(transaction);

      console.log('[PondTrading] Available wallets:', wallets.map((w: any) => ({
        address: w.address,
        walletClientType: w.walletClientType,
      })));

      // Use the same wallet for signing as we used for the order
      const wallet = tradingWallet;
      console.log('[PondTrading] Using wallet for signing:', wallet?.address, 'type:', (wallet as any)?.walletClientType || 'external');
      
      if (!wallet) {
        throw new Error('No wallet available for signing. Please reconnect your wallet.');
      }

      console.log('[PondTrading] Using wallet for signing:', wallet.address);
      console.log('[PondTrading] Wallet type:', (wallet as any).walletClientType);
      console.log('[PondTrading] Signing and sending transaction (auto-confirm enabled)...');

      let result;
      try {
        result = await signAndSendTransaction({
          transaction: transactionBytes,
          wallet: wallet,
        });
      } catch (signError: any) {
        // Extract error message from various Privy error formats
        const errorMsg = signError?.message 
          || signError?.error?.message 
          || signError?.error 
          || signError?.details
          || (typeof signError === 'object' ? JSON.stringify(signError) : String(signError));
        
        console.error('[PondTrading] Transaction error details:', signError);
        console.error('[PondTrading] Extracted error message:', errorMsg);
        
        // Check for specific error types
        if (errorMsg.includes('0x1')) {
          throw new Error('Transaction failed - insufficient balance or token account issue.');
        }
        if (errorMsg.toLowerCase().includes('insufficient') || errorMsg.toLowerCase().includes('lamports')) {
          throw new Error('Not enough SOL for transaction fees. Please deposit more SOL.');
        }
        if (errorMsg.toLowerCase().includes('simulation')) {
          throw new Error(`Transaction simulation failed: ${errorMsg.slice(0, 100)}`);
        }
        if (errorMsg.toLowerCase().includes('blockhash')) {
          throw new Error('Transaction expired. Please try again.');
        }
        // Show the actual error for debugging
        throw new Error(`Trade failed: ${errorMsg.slice(0, 150)}`);
      }

      let signature: string;
      if (typeof result === 'string') {
        signature = result;
      } else if (result instanceof Uint8Array) {
        signature = encodeBase58(result);
      } else if ((result as any).signature instanceof Uint8Array) {
        signature = encodeBase58((result as any).signature);
      } else if ((result as any).signature) {
        signature = String((result as any).signature);
      } else if ((result as any).hash) {
        signature = String((result as any).hash);
      } else {
        signature = String(result);
      }

      console.log('[PondTrading] Trade executed! Signature:', signature);

      // IMPORTANT: Floor shares to whole numbers - Kalshi only accepts whole contracts
      // Fractional shares cannot be sold, so we must enforce whole shares throughout
      const rawExpectedShares = quote?.outAmount
        ? parseInt(quote.outAmount) / 1_000_000
        : undefined;
      const expectedShares = rawExpectedShares !== undefined 
        ? Math.floor(rawExpectedShares) 
        : undefined;
      
      console.log('[PondTrading] Raw shares:', rawExpectedShares, '| Floored to whole:', expectedShares);
      
      // For async trades, WAIT for confirmation before returning success
      // This prevents "ghost trades" where we record success but tokens never arrive
      let actualFilledShares = expectedShares;
      const expectedUSDC = amountUSDC;
      
      if (executionMode === 'async') {
        console.log('[PondTrading] Async trade - waiting for fill confirmation before recording...');
        const token = await getAccessToken();
        
        try {
          // BLOCKING poll - wait for confirmation before returning success
          // This ensures we don't record ghost trades
          const orderResult = await pollOrderStatus(signature, token || '', 8, 2000);
          
          if (orderResult && orderResult.actualShares > 0) {
            // Floor actual shares to whole numbers - Kalshi only accepts whole contracts
            const actualSharesFloored = Math.floor(orderResult.actualShares);
            
            console.log('[PondTrading] Async fill CONFIRMED:');
            console.log('[PondTrading]   Expected shares:', expectedShares, '| Actual shares:', actualSharesFloored);
            console.log('[PondTrading]   Max wager:', expectedUSDC?.toFixed(2), '| Actual USDC spent:', orderResult.actualUSDCSpent?.toFixed(2));
            
            actualFilledShares = actualSharesFloored;
            
            // Check for partial fill
            const hasExpectedShares = expectedShares != null && expectedShares > 0;
            const hasExpectedUSDC = expectedUSDC != null && expectedUSDC > 0;
            
            let isPartialFill = false;
            if (hasExpectedShares && actualSharesFloored < expectedShares) {
              isPartialFill = true;
            }
            if (hasExpectedUSDC && (expectedUSDC - orderResult.actualUSDCSpent) > 0.02) {
              isPartialFill = true;
            }
            
            if (isPartialFill) {
              console.log('[PondTrading] PARTIAL FILL - Leftover USDC:', (expectedUSDC - orderResult.actualUSDCSpent).toFixed(2));
            }
            
            // Notify UI of confirmed fill data
            setLastFillConfirmation({
              signature,
              expectedShares,
              actualShares: actualSharesFloored,
              expectedUSDC,
              actualUSDCSpent: orderResult.actualUSDCSpent,
              isPartialFill,
            });
          } else if (orderResult && orderResult.status === 'failed') {
            // Trade explicitly failed
            console.error('[PondTrading] Async trade FAILED - DFlow rejected the order');
            setIsTrading(false);
            return {
              success: false,
              error: 'Trade was rejected by the exchange. Your funds have been returned.',
              signature,
            };
          } else {
            // Poll timed out but no explicit failure - trade may still be processing
            // For safety, we'll still return success but log a warning
            console.warn('[PondTrading] Async poll timed out - trade may still be processing');
            // Use expected shares since we couldn't confirm actual
          }
        } catch (pollError) {
          console.error('[PondTrading] Async confirmation failed:', pollError);
          // If we can't confirm, still return success with expected shares
          // The transaction was submitted, just couldn't confirm fill status
        }
      }
      
      setIsTrading(false);
      
      return {
        success: true,
        signature,
        executionMode,
        expectedShares,
        actualShares: actualFilledShares,
        isAsync: executionMode === 'async',
      };
    } catch (err: any) {
      // Enhanced error logging for debugging
      console.error('[PondTrading] Trade failed - raw error:', err);
      console.error('[PondTrading] Error type:', typeof err);
      console.error('[PondTrading] Error message:', err?.message);
      console.error('[PondTrading] Error string:', String(err));
      
      // Extract error message from various formats
      const errorMessage = err?.message 
        || (typeof err === 'string' ? err : null)
        || (err?.error?.message)
        || (err?.details)
        || String(err) 
        || 'Trade failed';
        
      console.error('[PondTrading] Final error message:', errorMessage);
      setError(errorMessage);
      setIsTrading(false);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, [user, getAccessToken, wallets, walletsReady, signAndSendTransaction]);

  const sellPosition = useCallback(async (
    marketId: string,
    side: 'yes' | 'no',
    shares: number,
    embeddedWalletAddress?: string
  ): Promise<PondTradeResult> => {
    setIsTrading(true);
    setError(null);

    try {
      console.log('[PondTrading] ========== SELLING POSITION ==========');
      console.log('[PondTrading] Market:', marketId);
      console.log('[PondTrading] Side:', side);
      console.log('[PondTrading] Shares to sell:', shares);
      
      // Find embedded wallet
      let embeddedWallet = embeddedWalletAddress 
        ? wallets.find((w: any) => w.address === embeddedWalletAddress)
        : null;
        
      if (!embeddedWallet) {
        embeddedWallet = wallets.find((w: any) => 
          w.walletClientType === 'privy' || w.connectorType === 'embedded'
        );
      }
      
      if (!embeddedWallet && wallets.length > 0) {
        embeddedWallet = wallets[0];
      }
      
      if (!embeddedWallet) {
        throw new Error('No embedded wallet found. Please log in to sell your position.');
      }

      const tradingWallet = embeddedWallet;
      const userPublicKey = tradingWallet.address;
      
      console.log('[PondTrading] User wallet:', userPublicKey);

      const token = await getAccessToken();

      // Helper function to call sell endpoint with retry for transient 500 errors
      const callSellEndpoint = async (attempt: number = 1): Promise<Response> => {
        console.log(`[PondTrading] Sell attempt ${attempt}...`);
        const response = await fetch('/api/pond/sell', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            marketId,
            side,
            shares,
            userPublicKey,
            slippageBps: 300, // Higher slippage for selling
          }),
        });

        // Retry on 500/502/503/504 errors (transient server issues)
        if (response.status >= 500 && response.status <= 504 && attempt < 3) {
          console.warn(`[PondTrading] Server error ${response.status}, retrying in ${attempt * 1000}ms...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
          return callSellEndpoint(attempt + 1);
        }
        return response;
      };

      const sellResponse = await callSellEndpoint();

      console.log('[PondTrading] Sell response status:', sellResponse.status);

      if (!sellResponse.ok) {
        const errorText = await sellResponse.text();
        console.error('[PondTrading] Sell failed:', errorText);
        console.error('[PondTrading] Sell context:', { marketId, side, shares, userPublicKey: userPublicKey.slice(0, 8) + '...' });
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          throw new Error(`Server error: ${sellResponse.status} - ${errorText}`);
        }
        throw new Error(errorData.error || 'Failed to get sell order from DFlow API');
      }

      const orderData = await sellResponse.json();
      console.log('[PondTrading] Sell order received, expected USDC:', orderData.expectedUSDC);
      
      const { transaction, executionMode, expectedUSDC } = orderData;

      if (!transaction) {
        throw new Error('No transaction returned from DFlow API for sell');
      }

      console.log('[PondTrading] Signing sell transaction...');
      
      const transactionBytes = base64ToUint8Array(transaction);

      let result;
      try {
        result = await signAndSendTransaction({
          transaction: transactionBytes,
          wallet: tradingWallet,
        });
      } catch (signError: any) {
        // Extract error message from various Privy error formats
        const errorMsg = signError?.message 
          || signError?.error?.message 
          || signError?.error 
          || signError?.details
          || (typeof signError === 'object' ? JSON.stringify(signError) : String(signError));
        
        console.error('[PondTrading] Sell transaction error details:', signError);
        console.error('[PondTrading] Extracted error message:', errorMsg);
        
        // Check for specific error types
        if (errorMsg.includes('0x1')) {
          // Solana error 0x1 = insufficient funds or missing tokens
          throw new Error('Cannot sell - tokens may not be in your wallet yet. DFlow async trades take time to settle.');
        }
        if (errorMsg.toLowerCase().includes('insufficient') || errorMsg.toLowerCase().includes('lamports')) {
          throw new Error('Not enough SOL for transaction fees. Please deposit more SOL.');
        }
        if (errorMsg.toLowerCase().includes('simulation')) {
          throw new Error(`Transaction simulation failed: ${errorMsg.slice(0, 100)}`);
        }
        if (errorMsg.toLowerCase().includes('blockhash')) {
          throw new Error('Transaction expired. Please try again.');
        }
        // Show the actual error for debugging
        throw new Error(`Sell failed: ${errorMsg.slice(0, 150)}`);
      }

      let signature: string;
      if (typeof result === 'string') {
        signature = result;
      } else if (result instanceof Uint8Array) {
        signature = encodeBase58(result);
      } else if ((result as any).signature instanceof Uint8Array) {
        signature = encodeBase58((result as any).signature);
      } else if ((result as any).signature) {
        signature = String((result as any).signature);
      } else if ((result as any).hash) {
        signature = String((result as any).hash);
      } else {
        signature = String(result);
      }

      console.log('[PondTrading] Position sold! Signature:', signature);
      console.log('[PondTrading] USDC received:', expectedUSDC);
      
      setIsTrading(false);
      return {
        success: true,
        signature,
        executionMode,
        expectedUSDC,
      };
    } catch (err: any) {
      console.error('[PondTrading] Sell failed:', err);
      const errorMessage = err.message || 'Sell failed';
      setError(errorMessage);
      setIsTrading(false);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, [getAccessToken, wallets, signAndSendTransaction]);

  // Redeem winning tokens from settled markets
  const redeemPosition = useCallback(async (
    outcomeMint: string,
    shares: number,
    embeddedWalletAddress?: string
  ): Promise<PondTradeResult> => {
    setIsTrading(true);
    setError(null);

    try {
      console.log('[PondTrading] ========== REDEEMING POSITION ==========');
      console.log('[PondTrading] Outcome mint:', outcomeMint);
      console.log('[PondTrading] Shares to redeem:', shares);
      
      // Find embedded wallet
      let embeddedWallet = embeddedWalletAddress 
        ? wallets.find((w: any) => w.address === embeddedWalletAddress)
        : null;
        
      if (!embeddedWallet) {
        embeddedWallet = wallets.find((w: any) => 
          w.walletClientType === 'privy' || w.connectorType === 'embedded'
        );
      }
      
      if (!embeddedWallet && wallets.length > 0) {
        embeddedWallet = wallets[0];
      }
      
      if (!embeddedWallet) {
        throw new Error('No embedded wallet found. Please log in to redeem your position.');
      }

      const tradingWallet = embeddedWallet;
      const userPublicKey = tradingWallet.address;
      
      console.log('[PondTrading] User wallet:', userPublicKey);

      const token = await getAccessToken();

      // Call the redeem endpoint
      const redeemResponse = await fetch('/api/pond/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          outcomeMint,
          shares,
          userPublicKey,
          slippageBps: 100, // Lower slippage for redemption
        }),
      });

      console.log('[PondTrading] Redeem response status:', redeemResponse.status);

      if (!redeemResponse.ok) {
        const errorText = await redeemResponse.text();
        console.error('[PondTrading] Redeem failed:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          throw new Error(`Server error: ${redeemResponse.status} - ${errorText}`);
        }
        throw new Error(errorData.error || 'Failed to get redemption order');
      }

      const orderData = await redeemResponse.json();
      const expectedUSDC = orderData.quote?.outAmount 
        ? parseInt(orderData.quote.outAmount) / 1_000_000 
        : shares; // Each winning token redeems for $1
      
      console.log('[PondTrading] Redeem order received, expected USDC:', expectedUSDC);
      
      const { transaction, executionMode } = orderData;

      if (!transaction) {
        throw new Error('No transaction returned for redemption');
      }

      console.log('[PondTrading] Signing redemption transaction...');
      
      const transactionBytes = base64ToUint8Array(transaction);

      let result;
      try {
        result = await signAndSendTransaction({
          transaction: transactionBytes,
          wallet: tradingWallet,
        });
      } catch (signError: any) {
        const errorMsg = signError?.message 
          || signError?.error?.message 
          || signError?.error 
          || signError?.details
          || (typeof signError === 'object' ? JSON.stringify(signError) : String(signError));
        
        console.error('[PondTrading] Redemption transaction error:', errorMsg);
        throw new Error(`Redemption failed: ${errorMsg.slice(0, 150)}`);
      }

      let signature: string;
      if (typeof result === 'string') {
        signature = result;
      } else if (result instanceof Uint8Array) {
        signature = encodeBase58(result);
      } else if ((result as any).signature instanceof Uint8Array) {
        signature = encodeBase58((result as any).signature);
      } else if ((result as any).signature) {
        signature = String((result as any).signature);
      } else if ((result as any).hash) {
        signature = String((result as any).hash);
      } else {
        signature = String(result);
      }

      console.log('[PondTrading] Position redeemed! Signature:', signature);
      console.log('[PondTrading] USDC received:', expectedUSDC);
      
      setIsTrading(false);
      return {
        success: true,
        signature,
        executionMode,
        expectedUSDC,
      };
    } catch (err: any) {
      console.error('[PondTrading] Redemption failed:', err);
      const errorMessage = err.message || 'Redemption failed';
      setError(errorMessage);
      setIsTrading(false);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, [getAccessToken, wallets, signAndSendTransaction]);

  // Get a sell quote to show expected proceeds before confirming
  const getSellQuote = useCallback(async (
    marketId: string,
    side: 'yes' | 'no',
    shares: number,
    userPublicKey: string
  ): Promise<{
    expectedUSDC: number;
    priceImpactPct: number;
    pricePerShare: number;
    warning: string | null;
    devApiWarning: string;
    error?: string;
  }> => {
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/pond/sell-quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          marketId,
          side,
          shares,
          userPublicKey,
          slippageBps: 300,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[PondTrading] Sell quote failed:', errorText);
        return {
          expectedUSDC: 0,
          priceImpactPct: 0,
          pricePerShare: 0,
          warning: 'Failed to get quote',
          devApiWarning: '',
          error: 'Failed to get sell quote',
        };
      }
      
      return await response.json();
    } catch (error: any) {
      console.error('[PondTrading] Error getting sell quote:', error);
      return {
        expectedUSDC: 0,
        priceImpactPct: 0,
        pricePerShare: 0,
        warning: null,
        devApiWarning: '',
        error: error.message || 'Failed to get sell quote',
      };
    }
  }, [getAccessToken]);

  // Check if a position can be redeemed (market settled and won)
  const checkRedemption = useCallback(async (outcomeMint: string): Promise<{
    isRedeemable: boolean;
    marketStatus: string;
    result: string;
  }> => {
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/pond/redemption-status/${outcomeMint}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) {
        return { isRedeemable: false, marketStatus: 'unknown', result: '' };
      }
      
      return await response.json();
    } catch (error) {
      console.error('[PondTrading] Error checking redemption status:', error);
      return { isRedeemable: false, marketStatus: 'error', result: '' };
    }
  }, [getAccessToken]);

  // Clear fill confirmation after UI has handled it
  const clearFillConfirmation = useCallback(() => {
    setLastFillConfirmation(null);
  }, []);

  return {
    placeTrade,
    sellPosition,
    getSellQuote,
    redeemPosition,
    checkRedemption,
    isTrading,
    error,
    lastFillConfirmation,
    clearFillConfirmation,
  };
}
