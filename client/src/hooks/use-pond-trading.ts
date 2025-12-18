import { useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';

export interface PondTradeResult {
  success: boolean;
  signature?: string;
  error?: string;
  executionMode?: 'sync' | 'async';
  quote?: any;
}

export function usePondTrading() {
  const { getAccessToken, user } = usePrivy();
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
      if (usdcBalance !== undefined && usdcBalance < amountUSDC) {
        throw new Error(`Insufficient USDC balance. You have $${usdcBalance.toFixed(2)} but need $${amountUSDC.toFixed(2)}. Convert SOL to USDC first.`);
      }

      const solanaWallet = user?.linkedAccounts?.find(
        (account: any) => account.type === 'wallet' && account.chainType === 'solana'
      );
      
      if (!solanaWallet) {
        throw new Error('No Solana wallet connected. Please connect your Solana wallet first.');
      }

      const userPublicKey = (solanaWallet as any).address;
      if (!userPublicKey) {
        throw new Error('Could not get Solana wallet address');
      }

      const token = await getAccessToken();

      // 1. Get quote and transaction from backend
      const quoteResponse = await fetch('/api/pond/quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          marketId,
          side,
          amountUSDC,
          userPublicKey,
          slippageBps: 100,
        }),
      });

      if (!quoteResponse.ok) {
        const errorData = await quoteResponse.json();
        throw new Error(errorData.error || 'Failed to get quote from Pond API');
      }

      const quoteData = await quoteResponse.json();
      const { quote, executionMode } = quoteData;

      // Note: For now, we return the quote data for the user to review
      // Full transaction signing requires Privy's signAndSendTransaction which needs
      // to be called in a specific context. The backend has the transaction ready.
      
      setIsTrading(false);
      return {
        success: true,
        executionMode,
        quote,
        error: 'Quote received - transaction signing pending wallet integration',
      };
    } catch (err: any) {
      const errorMessage = err.message || 'Trade failed';
      setError(errorMessage);
      setIsTrading(false);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, [user, getAccessToken]);

  return {
    placeTrade,
    isTrading,
    error,
  };
}
