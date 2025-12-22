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
  const { wallets } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const [isSwapping, setIsSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const lastSwapTimeRef = useRef<number>(0);
  const previousBalanceRef = useRef<number>(0);
  const hasAutoSwappedRef = useRef<Set<string>>(new Set());

  const performAutoSwap = useCallback(async (
    currentSolBalance: number
  ): Promise<AutoSwapResult> => {
    if (isSwapping) {
      return { success: false, error: 'Swap already in progress' };
    }

    setIsSwapping(true);
    setError(null);

    try {
      // Debug: Log available wallets
      console.log('[AutoSwap] Available wallets:', wallets.map((w: any) => ({ 
        address: w.address?.slice(0, 8) + '...', 
        type: w.walletClientType,
        chainType: w.chainType 
      })));
      
      // Only use embedded Privy wallet for auto-swap (external wallets manage their own funds)
      const solanaWallet = wallets.find((w: any) => w.walletClientType === 'privy');
      if (!solanaWallet) {
        console.log('[AutoSwap] No embedded Privy wallet found - user may need to wait for wallet init');
        setIsSwapping(false);
        return { success: false };
      }
      
      console.log('[AutoSwap] Using wallet:', solanaWallet.address);

      const userPublicKey = solanaWallet.address;
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
        wallet: solanaWallet,
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
  }, [wallets, signAndSendTransaction, isSwapping]);

  const checkAndAutoSwap = useCallback(async (
    currentSolBalance: number,
    walletAddress: string | null,
    onStart?: () => void,
    onComplete?: (result: AutoSwapResult) => void
  ): Promise<boolean> => {
    const gasReserve = getDynamicGasReserve(currentSolBalance);
    const swapAmount = calculateSwapAmount(currentSolBalance);
    const previousBalance = previousBalanceRef.current;
    const balanceIncrease = currentSolBalance - previousBalance;
    
    // Debug logging
    console.log('[AutoSwap] ========== CHECK ==========');
    console.log('[AutoSwap] Current SOL Balance:', currentSolBalance.toFixed(6));
    console.log('[AutoSwap] Previous Balance:', previousBalance.toFixed(6));
    console.log('[AutoSwap] Balance Increase:', balanceIncrease.toFixed(6));
    console.log('[AutoSwap] Threshold Check: Is', swapAmount.toFixed(6), '>', MIN_SWAP_THRESHOLD, '?', swapAmount > MIN_SWAP_THRESHOLD);
    console.log('[AutoSwap] Calculated Gas Reserve:', gasReserve);
    console.log('[AutoSwap] Calculated Swap Amount:', swapAmount.toFixed(6));
    console.log('[AutoSwap] Wallet Address:', walletAddress);
    console.log('[AutoSwap] Is Swapping:', isSwapping);
    
    if (!walletAddress || isSwapping) {
      console.log('[AutoSwap] SKIP: No wallet or already swapping');
      return false;
    }
    
    const now = Date.now();
    const timeSinceLastSwap = now - lastSwapTimeRef.current;
    if (timeSinceLastSwap < SWAP_COOLDOWN_MS) {
      console.log('[AutoSwap] SKIP: Cooldown active, wait', ((SWAP_COOLDOWN_MS - timeSinceLastSwap) / 1000).toFixed(0), 'seconds');
      return false;
    }

    // Update previous balance AFTER reading it
    previousBalanceRef.current = currentSolBalance;

    if (swapAmount <= MIN_SWAP_THRESHOLD) {
      console.log('[AutoSwap] SKIP: Swap amount too low');
      return false;
    }

    const balanceKey = `${walletAddress}-${currentSolBalance.toFixed(6)}`;
    if (hasAutoSwappedRef.current.has(balanceKey)) {
      console.log('[AutoSwap] SKIP: Already swapped at this balance');
      return false;
    }

    const isFirstDeposit = previousBalance === 0 && currentSolBalance > MIN_SWAP_THRESHOLD;
    const isTopUp = balanceIncrease > 0.001 && previousBalance > 0;
    
    console.log('[AutoSwap] Is First Deposit?', isFirstDeposit, '(prev=0 && current>', MIN_SWAP_THRESHOLD, ')');
    console.log('[AutoSwap] Is Top-Up?', isTopUp, '(increase > 0.001 && prev > 0)');
    
    if (isFirstDeposit || isTopUp) {
      console.log('[AutoSwap] TRIGGERING SWAP!');
      onStart?.();
      const result = await performAutoSwap(currentSolBalance);
      
      if (result.success) {
        hasAutoSwappedRef.current.add(balanceKey);
        
        if (hasAutoSwappedRef.current.size > 100) {
          const entries = Array.from(hasAutoSwappedRef.current);
          hasAutoSwappedRef.current = new Set(entries.slice(-50));
        }
      }
      
      console.log('[AutoSwap] Result:', result);
      onComplete?.(result);
      return result.success;
    }

    console.log('[AutoSwap] SKIP: Not a new deposit or top-up');
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
