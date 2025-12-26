import { useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useSolanaWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export interface PondTradeResult {
  success: boolean;
  signature?: string;
  error?: string;
  executionMode?: 'sync' | 'async';
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

async function getMarketTokensFromServer(marketId: string): Promise<{ yesMint: string; noMint: string } | null> {
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
    
    return { yesMint: data.yesMint, noMint: data.noMint };
  } catch (error) {
    console.error('[PondTrading] Error fetching market tokens:', error);
    return null;
  }
}

export function usePondTrading() {
  const { getAccessToken, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const [isTrading, setIsTrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeTrade = useCallback(async (
    marketId: string,
    side: 'yes' | 'no',
    amountUSDC: number,
    usdcBalance?: number
  ): Promise<PondTradeResult> => {
    setIsTrading(true);
    setError(null);

    try {
      // Only use embedded wallet for trading (auto-confirm enabled)
      const embeddedWallet = wallets.find((w: any) => 
        w.walletClientType === 'privy' || w.connectorType === 'embedded'
      );
      
      if (!embeddedWallet) {
        throw new Error('No embedded wallet found. Please log in with Privy to create an embedded wallet for trading.');
      }

      // Check balance - if insufficient, throw specific error for funding prompt
      if (usdcBalance !== undefined && usdcBalance < amountUSDC) {
        const err = new Error(`INSUFFICIENT_FUNDS:${usdcBalance.toFixed(2)}:${amountUSDC.toFixed(2)}`);
        throw err;
      }
      
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

      const result = await signAndSendTransaction({
        transaction: transactionBytes,
        wallet: wallet,
      });

      const signature = typeof result === 'string' 
        ? result 
        : (result as any).signature || (result as any).hash || String(result);

      console.log('[PondTrading] Trade executed! Signature:', signature);

      const expectedShares = quote?.outAmount
        ? parseInt(quote.outAmount) / 1_000_000
        : undefined;
      
      setIsTrading(false);
      return {
        success: true,
        signature,
        executionMode,
        expectedShares,
      };
    } catch (err: any) {
      console.error('[PondTrading] Trade failed:', err);
      const errorMessage = err.message || 'Trade failed';
      setError(errorMessage);
      setIsTrading(false);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, [user, getAccessToken, wallets, signAndSendTransaction]);

  return {
    placeTrade,
    isTrading,
    error,
  };
}
