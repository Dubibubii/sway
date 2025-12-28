import { useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export interface PondTradeResult {
  success: boolean;
  signature?: string;
  error?: string;
  executionMode?: 'sync' | 'async';
  expectedShares?: number;
  actualShares?: number; // Actual filled shares from order status polling
  expectedUSDC?: number;
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
): Promise<{ actualShares: number; status: string } | null> {
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
      
      // If order is complete, calculate actual shares from fills
      if (data.status === 'closed' || data.status === 'pendingClose') {
        if (data.fills && data.fills.length > 0) {
          // Sum up all fill amounts (outAmount is the tokens received)
          const totalOutAmount = data.fills.reduce((sum, fill) => {
            return sum + parseInt(fill.outAmount || '0');
          }, 0);
          const actualShares = totalOutAmount / 1_000_000; // Convert from atomic units
          console.log('[PondTrading] Order complete! Actual shares:', actualShares);
          return { actualShares, status: data.status };
        }
        // Order closed but no fills - might be cancelled
        console.warn('[PondTrading] Order closed with no fills');
        return { actualShares: 0, status: data.status };
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

  const placeTrade = useCallback(async (
    marketId: string,
    side: 'yes' | 'no',
    amountUSDC: number,
    usdcBalance?: number,
    embeddedWalletAddress?: string,
    channel: 'swipe' | 'discovery' | 'positions' = 'swipe'
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

      const signature = typeof result === 'string' 
        ? result 
        : (result as any).signature || (result as any).hash || String(result);

      console.log('[PondTrading] Trade executed! Signature:', signature);

      const expectedShares = quote?.outAmount
        ? parseInt(quote.outAmount) / 1_000_000
        : undefined;
      
      // Return immediately after on-chain confirmation - don't wait for order status polling
      // The Solana transaction is already confirmed at this point
      setIsTrading(false);
      
      // For async trades, poll order status in the background (non-blocking)
      // This updates the database record but doesn't delay the user notification
      if (executionMode === 'async') {
        console.log('[PondTrading] Async trade - starting background polling for fill confirmation...');
        const token = await getAccessToken();
        // Non-blocking background poll with fewer attempts and shorter delay
        pollOrderStatus(signature, token || '', 5, 1500).then(orderResult => {
          if (orderResult) {
            console.log('[PondTrading] Background poll complete - Expected:', expectedShares, 'Actual:', orderResult.actualShares);
          }
        }).catch(err => {
          console.warn('[PondTrading] Background order status poll failed:', err);
        });
      }
      
      return {
        success: true,
        signature,
        executionMode,
        expectedShares,
        actualShares: expectedShares, // Use expected shares for immediate feedback
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

      // Call the sell endpoint
      const sellResponse = await fetch('/api/pond/sell', {
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

      console.log('[PondTrading] Sell response status:', sellResponse.status);

      if (!sellResponse.ok) {
        const errorText = await sellResponse.text();
        console.error('[PondTrading] Sell failed:', errorText);
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

      const signature = typeof result === 'string' 
        ? result 
        : (result as any).signature || (result as any).hash || String(result);

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

      const signature = typeof result === 'string' 
        ? result 
        : (result as any).signature || (result as any).hash || String(result);

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

  return {
    placeTrade,
    sellPosition,
    redeemPosition,
    checkRedemption,
    isTrading,
    error,
  };
}
