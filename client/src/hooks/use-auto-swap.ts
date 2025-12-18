import { useState, useCallback } from 'react';
import { useWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import { prepareAutoSwap, calculateSwapAmount, MIN_GAS_SOL, base64ToUint8Array } from '@/utils/jupiterSwap';

export interface AutoSwapResult {
  success: boolean;
  signature?: string;
  usdcReceived?: number;
  error?: string;
}

export function useAutoSwap() {
  const { wallets } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const [isSwapping, setIsSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const performAutoSwap = useCallback(async (
    currentSolBalance: number
  ): Promise<AutoSwapResult> => {
    setIsSwapping(true);
    setError(null);

    try {
      const solanaWallet = wallets.find((w: any) => w.walletClientType === 'privy' || w.type === 'solana');
      if (!solanaWallet) {
        throw new Error('No Solana wallet connected');
      }

      const userPublicKey = solanaWallet.address;
      const swapAmount = calculateSwapAmount(currentSolBalance);

      if (swapAmount <= 0) {
        throw new Error(`Need at least ${MIN_GAS_SOL} SOL reserved for gas fees`);
      }

      const swapResult = await prepareAutoSwap(currentSolBalance, userPublicKey);

      if (!swapResult.success || !swapResult.transactionBase64) {
        throw new Error(swapResult.error || 'Failed to prepare swap');
      }

      const transactionBytes = base64ToUint8Array(swapResult.transactionBase64);

      const result = await signAndSendTransaction({
        transaction: transactionBytes,
        wallet: solanaWallet,
      });

      const signature = (result as any)?.hash || (result as any)?.signature || 'unknown';

      setIsSwapping(false);
      return {
        success: true,
        signature,
        usdcReceived: swapResult.expectedUsdcOut,
      };
    } catch (err: any) {
      const errorMessage = err.message || 'Auto-swap failed';
      setError(errorMessage);
      setIsSwapping(false);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, [wallets, signAndSendTransaction]);

  const getSwapPreview = useCallback((currentSolBalance: number) => {
    const swapAmount = calculateSwapAmount(currentSolBalance);
    return {
      swapAmount,
      gasReserve: MIN_GAS_SOL,
      canSwap: swapAmount > 0,
    };
  }, []);

  return {
    performAutoSwap,
    getSwapPreview,
    isSwapping,
    error,
    MIN_GAS_SOL,
  };
}
