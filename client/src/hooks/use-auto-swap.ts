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
  const previousBalanceRef = useRef<number>(0);
  const hasAutoSwappedRef = useRef<Set<string>>(new Set());

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
      // Debug: Log available wallets with full details
      console.log('[AutoSwap] Wallets Ready:', walletsReady);
      console.log('[AutoSwap] Available wallets count:', wallets.length);
      console.log('[AutoSwap] Embedded wallet address passed:', embeddedWalletAddress);
      console.log('[AutoSwap] Wallet Contents:', JSON.stringify(wallets.map((w: any) => ({
        address: w.address,
        walletClientType: w.walletClientType,
        chainType: w.chainType,
        type: w.type,
        connectorType: w.connectorType,
      })), null, 2));
      
      // Wait for wallets to be ready
      if (!walletsReady) {
        console.log('[AutoSwap] Wallets not ready yet, will retry later');
        setIsSwapping(false);
        return { success: false };
      }
      
      // First, try to find the wallet by the embedded address we know
      let walletToUse = embeddedWalletAddress 
        ? wallets.find((w: any) => w.address === embeddedWalletAddress)
        : null;
      
      // If not found, try to find by Privy identifier
      if (!walletToUse) {
        walletToUse = wallets.find((w: any) => 
          w.walletClientType === 'privy' || 
          w.connectorType === 'embedded'
        );
      }
      
      // Check if the embedded wallet is now in the wallets array
      if (!walletToUse && embeddedWalletAddress) {
        console.log('[AutoSwap] Embedded wallet not in useWallets() array - this is a Privy SDK limitation');
        console.log('[AutoSwap] User should use the manual "Convert to USDC" button');
        setIsSwapping(false);
        return { success: false, error: 'Embedded wallet not ready for signing. Please use the Convert button manually.' };
      }
      
      // Fallback: use the first available wallet (but only if addresses match)
      if (!walletToUse && wallets.length > 0 && !embeddedWalletAddress) {
        console.log('[AutoSwap] Using first available wallet as fallback');
        walletToUse = wallets[0];
      }
      
      if (!walletToUse) {
        console.log('[AutoSwap] No wallet available at all');
        setIsSwapping(false);
        return { success: false, error: 'No wallet available' };
      }
      
      console.log('[AutoSwap] Using wallet:', walletToUse.address);

      // Use the embedded wallet address for the transaction if provided
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
    console.log('[AutoSwap] Embedded Wallet Address:', embeddedWalletAddress);
    console.log('[AutoSwap] Is Swapping:', isSwapping);
    
    if (!embeddedWalletAddress || isSwapping) {
      console.log('[AutoSwap] SKIP: No embedded wallet or already swapping');
      return false;
    }
    
    const now = Date.now();
    const timeSinceLastSwap = now - lastSwapTimeRef.current;
    if (timeSinceLastSwap < SWAP_COOLDOWN_MS) {
      console.log('[AutoSwap] SKIP: Cooldown active, wait', ((SWAP_COOLDOWN_MS - timeSinceLastSwap) / 1000).toFixed(0), 'seconds');
      return false;
    }

    if (swapAmount <= MIN_SWAP_THRESHOLD) {
      console.log('[AutoSwap] SKIP: Swap amount too low');
      // Still update previous balance when below threshold (balance is just too low)
      previousBalanceRef.current = currentSolBalance;
      return false;
    }

    const balanceKey = `${embeddedWalletAddress}-${currentSolBalance.toFixed(6)}`;
    if (hasAutoSwappedRef.current.has(balanceKey)) {
      console.log('[AutoSwap] SKIP: Already swapped at this balance');
      return false;
    }

    const isFirstDeposit = previousBalance === 0 && currentSolBalance > MIN_SWAP_THRESHOLD;
    const isTopUp = balanceIncrease > 0.001 && previousBalance > 0;
    
    console.log('[AutoSwap] Force Swap?', forceSwap);
    console.log('[AutoSwap] Is First Deposit?', isFirstDeposit, '(prev=0 && current>', MIN_SWAP_THRESHOLD, ')');
    console.log('[AutoSwap] Is Top-Up?', isTopUp, '(increase > 0.001 && prev > 0)');
    
    if (forceSwap || isFirstDeposit || isTopUp) {
      console.log('[AutoSwap] TRIGGERING SWAP!');
      onStart?.();
      const result = await performAutoSwap(currentSolBalance, embeddedWalletAddress);
      
      if (result.success) {
        // Only update previous balance on successful swap
        previousBalanceRef.current = currentSolBalance;
        hasAutoSwappedRef.current.add(balanceKey);
        
        if (hasAutoSwappedRef.current.size > 100) {
          const entries = Array.from(hasAutoSwappedRef.current);
          hasAutoSwappedRef.current = new Set(entries.slice(-50));
        }
      } else if (result.error && !result.error.includes('not ready')) {
        // Update balance on hard failure (not transient "not ready" issues)
        previousBalanceRef.current = currentSolBalance;
      }
      // If wallets not ready, DON'T update previousBalance - allows retry
      
      console.log('[AutoSwap] Result:', result);
      onComplete?.(result);
      return result.success;
    }

    // Not a deposit scenario - update previous balance
    previousBalanceRef.current = currentSolBalance;
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
