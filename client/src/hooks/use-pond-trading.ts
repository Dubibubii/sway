import { useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import { preparePondTrade, base64ToUint8Array } from '@/utils/pondTrade';

export interface PondTradeResult {
  success: boolean;
  signature?: string;
  error?: string;
  executionMode?: 'sync' | 'async';
  expectedShares?: number;
}

export function usePondTrading() {
  const { user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
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

      const tradeResult = await preparePondTrade(
        marketId,
        side,
        amountUSDC,
        userPublicKey
      );

      if (!tradeResult.success || !tradeResult.transactionBase64) {
        throw new Error(tradeResult.error || 'Failed to prepare trade');
      }

      console.log('[PondTrading] Trade prepared successfully, signing transaction...');
      
      const transactionBytes = base64ToUint8Array(tradeResult.transactionBase64);

      console.log('[PondTrading] Looking for wallet, available wallets:', wallets.map((w: any) => ({
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
      
      setIsTrading(false);
      return {
        success: true,
        signature,
        executionMode: tradeResult.orderResponse?.executionMode,
        expectedShares: tradeResult.expectedShares,
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
  }, [user, wallets, walletsReady, signAndSendTransaction]);

  return {
    placeTrade,
    isTrading,
    error,
  };
}
