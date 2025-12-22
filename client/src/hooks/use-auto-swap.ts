import { useState, useCallback, useRef } from 'react';
import { useWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import { 
  prepareAutoSwap, 
  calculateSwapAmount, 
  getDynamicGasReserve,
  GAS_RESERVE_MICRO,
  GAS_RESERVE_STANDARD,
  MICRO_DEPOSIT_THRESHOLD,
  base64ToUint8Array 
} from '@/utils/jupiterSwap';

export interface AutoSwapResult {
  success: boolean;
  signature?: string;
  usdcReceived?: number;
  error?: string;
}

const MIN_SWAP_THRESHOLD = 0.005;
const SWAP_COOLDOWN_MS = 30000;

export function useAutoSwap() {
  const { wallets, ready: walletsReady } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const [isSwapping, setIsSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const lastSwapTimeRef = useRef<number>(0);
  const lastAttemptedBalanceRef = useRef<number>(0);
  const previousBalanceRef = useRef<number>(0);

  const performAutoSwap = useCallback(async (
    currentSolBalance: number,
    embeddedWalletAddress?: string
  ): Promise<AutoSwapResult> => {
    if (isSwapping) {
      return { success: false, error: 'Swap already in progress' };
    }

    setIsSwapping(true);
    setError(null);

    try {
      if (!walletsReady) {
        console.log('[AutoSwap] Wallets not ready yet');
        setIsSwapping(false);
        return { success: false };
      }
      
      let walletToUse = embeddedWalletAddress 
        ? wallets.find((w: any) => w.address === embeddedWalletAddress)
        : null;
      
      if (!walletToUse) {
        walletToUse = wallets.find((w: any) => 
          w.walletClientType === 'privy' || 
          w.connectorType === 'embedded'
        );
      }
      
      if (!walletToUse && embeddedWalletAddress) {
        console.log('[AutoSwap] Embedded wallet not in useWallets() array');
        setIsSwapping(false);
        return { success: false, error: 'Wallet not ready' };
      }
      
      if (!walletToUse && wallets.length > 0 && !embeddedWalletAddress) {
        walletToUse = wallets[0];
      }
      
      if (!walletToUse) {
        setIsSwapping(false);
        return { success: false, error: 'No wallet available' };
      }
      
      console.log('[AutoSwap] Using wallet:', walletToUse.address);

      const userPublicKey = embeddedWalletAddress || walletToUse.address;
      const swapAmount = calculateSwapAmount(currentSolBalance);
      const gasReserve = getDynamicGasReserve(currentSolBalance);

      if (swapAmount <= 0) {
        throw new Error(`Need at least ${gasReserve} SOL reserved for gas fees`);
      }

      const swapResult = await prepareAutoSwap(currentSolBalance, userPublicKey);

      if (!swapResult.success || !swapResult.transactionBase64) {
        throw new Error(swapResult.error || 'Failed to prepare swap');
      }

      const transactionBytes = base64ToUint8Array(swapResult.transactionBase64);

      const result = await signAndSendTransaction({
        transaction: transactionBytes,
        wallet: walletToUse,
      });

      const signature = (result as any)?.hash || (result as any)?.signature || 'unknown';
      
      lastSwapTimeRef.current = Date.now();

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
  }, [wallets, walletsReady, signAndSendTransaction, isSwapping]);

  const checkAndAutoSwap = useCallback(async (
    currentSolBalance: number,
    embeddedWalletAddress: string | null,
    onStart?: () => void,
    onComplete?: (result: AutoSwapResult) => void,
    forceSwap: boolean = false
  ): Promise<boolean> => {
    const swapAmount = calculateSwapAmount(currentSolBalance);
    const previousBalance = previousBalanceRef.current;
    const lastAttemptedBalance = lastAttemptedBalanceRef.current;
    const balanceIncrease = currentSolBalance - previousBalance;
    
    const roundedBalance = Math.round(currentSolBalance * 1_000_000) / 1_000_000;
    const roundedLastAttempted = Math.round(lastAttemptedBalance * 1_000_000) / 1_000_000;
    
    if (!embeddedWalletAddress || isSwapping) {
      return false;
    }
    
    const now = Date.now();
    const timeSinceLastSwap = now - lastSwapTimeRef.current;
    if (timeSinceLastSwap < SWAP_COOLDOWN_MS && !forceSwap) {
      return false;
    }

    if (swapAmount <= MIN_SWAP_THRESHOLD) {
      previousBalanceRef.current = currentSolBalance;
      return false;
    }

    if (roundedBalance === roundedLastAttempted && !forceSwap) {
      console.log('[AutoSwap] SKIP: Already attempted swap at this balance:', roundedBalance);
      return false;
    }

    const isFirstDeposit = previousBalance === 0 && currentSolBalance > MIN_SWAP_THRESHOLD;
    const isTopUp = balanceIncrease > 0.001 && previousBalance > 0;
    
    if (forceSwap || isFirstDeposit || isTopUp) {
      console.log('[AutoSwap] Triggering swap for balance:', roundedBalance);
      
      lastAttemptedBalanceRef.current = currentSolBalance;
      
      onStart?.();
      const result = await performAutoSwap(currentSolBalance, embeddedWalletAddress);
      
      if (result.success) {
        previousBalanceRef.current = currentSolBalance;
      }
      
      onComplete?.(result);
      return result.success;
    }

    previousBalanceRef.current = currentSolBalance;
    return false;
  }, [isSwapping, performAutoSwap]);

  const getSwapPreview = useCallback((currentSolBalance: number) => {
    const gasReserve = getDynamicGasReserve(currentSolBalance);
    const swapAmount = calculateSwapAmount(currentSolBalance);
    return {
      swapAmount,
      gasReserve,
      canSwap: swapAmount > MIN_SWAP_THRESHOLD,
      tier: currentSolBalance < MICRO_DEPOSIT_THRESHOLD ? 'micro' : 'standard',
    };
  }, []);

  const resetPreviousBalance = useCallback((balance: number) => {
    previousBalanceRef.current = balance;
  }, []);

  return {
    performAutoSwap,
    checkAndAutoSwap,
    getSwapPreview,
    resetPreviousBalance,
    isSwapping,
    error,
    GAS_RESERVE_MICRO,
    GAS_RESERVE_STANDARD,
    MICRO_DEPOSIT_THRESHOLD,
  };
}
