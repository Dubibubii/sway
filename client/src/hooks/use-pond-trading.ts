import { useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana';

// DFlow Development API endpoint for real trading (market metadata)
const POND_METADATA_API = 'https://dev-prediction-markets-api.dflow.net';
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

async function getMarketTokensFromClient(marketId: string): Promise<{ yesMint: string; noMint: string } | null> {
  const url = `${POND_METADATA_API}/api/v1/market/${marketId}`;
  console.log('[PondTrading] Fetching market tokens (client-side) from:', url);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    console.log('[PondTrading] Market token response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PondTrading] Failed to fetch market tokens:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    console.log('[PondTrading] Market data received:', JSON.stringify(data).slice(0, 500));
    
    const accounts = data.accounts || {};
    const yesMint = accounts.yesTokenMint || accounts.yes_token_mint || data.yesMint || data.yes_token_mint;
    const noMint = accounts.noTokenMint || accounts.no_token_mint || data.noMint || data.no_token_mint;
    
    if (!yesMint || !noMint) {
      console.error('[PondTrading] Market tokens not found in response. Accounts:', JSON.stringify(accounts));
      return null;
    }
    
    console.log('[PondTrading] Found token mints - YES:', yesMint, 'NO:', noMint);
    return { yesMint, noMint };
  } catch (error) {
    console.error('[PondTrading] Error fetching market tokens:', error);
    return null;
  }
}

export function usePondTrading() {
  const { getAccessToken, user } = usePrivy();
  const { wallets } = useWallets();
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

      console.log('[PondTrading] ========== EXECUTING TRADE ==========');
      console.log('[PondTrading] Market:', marketId);
      console.log('[PondTrading] Side:', side);
      console.log('[PondTrading] Amount USDC:', amountUSDC);
      console.log('[PondTrading] User wallet:', userPublicKey);

      const marketTokens = await getMarketTokensFromClient(marketId);
      
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

      let wallet = wallets.find((w: any) => w.address === userPublicKey);
      
      if (!wallet) {
        wallet = wallets.find((w: any) => 
          w.walletClientType === 'privy' || 
          w.connectorType === 'embedded'
        );
      }
      
      if (!wallet && wallets.length > 0) {
        wallet = wallets[0];
      }
      
      if (!wallet) {
        throw new Error('No wallet available for signing. Please reconnect your wallet.');
      }

      console.log('[PondTrading] Using wallet:', wallet.address);
      console.log('[PondTrading] Signing and sending transaction...');

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
