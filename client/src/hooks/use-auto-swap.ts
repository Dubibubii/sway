import { useState, useCallback, useRef, useEffect } from 'react';
import { useWallets } from '@privy-io/react-auth/solana';
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
const DEPOSIT_DETECTION_THRESHOLD = 0.001;

function logError(context: string, err: unknown) {
  console.error(`[AutoSwap] ${context}:`, 
    err instanceof Error ? err.message : JSON.stringify(err, Object.getOwnPropertyNames(err as object))
  );
  if (err instanceof Error && err.stack) {
    console.error('[AutoSwap] Stack:', err.stack);
  }
  console.dir(err);
}

export function useAutoSwap() {
  const { wallets, ready: walletsReady } = useWallets();
  const [isSwapping, setIsSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const lastSwapTimeRef = useRef<number>(0);
  const previousBalanceRef = useRef<number>(0);
  const swapAttemptedForDepositRef = useRef<boolean>(false);
  const pendingSwapRef = useRef<{balance: number, address: string, onComplete?: (result: AutoSwapResult) => void} | null>(null);

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
      console.log('[AutoSwap] Starting swap attempt...');
      console.log('[AutoSwap] Wallets ready:', walletsReady);
      console.log('[AutoSwap] Wallet count:', wallets.length);
      console.log('[AutoSwap] Embedded wallet address:', embeddedWalletAddress);
      
      if (!walletsReady) {
        console.log('[AutoSwap] Wallets not ready, will retry when ready');
        setIsSwapping(false);
        return { success: false, error: 'Wallets not ready' };
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
        console.log('[AutoSwap] Embedded wallet not found in useWallets array');
        console.log('[AutoSwap] Available wallets:', wallets.map((w: any) => w.address));
        setIsSwapping(false);
        return { success: false, error: 'Wallet not found' };
      }
      
      if (!walletToUse && wallets.length > 0) {
        console.log('[AutoSwap] Using first available wallet as fallback');
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

      console.log('[AutoSwap] Preparing swap for', swapAmount.toFixed(6), 'SOL');
      const swapResult = await prepareAutoSwap(currentSolBalance, userPublicKey);

      if (!swapResult.success || !swapResult.transactionBase64) {
        throw new Error(swapResult.error || 'Failed to prepare swap');
      }

      console.log('[AutoSwap] Signing and sending transaction...');
      const transactionBytes = base64ToUint8Array(swapResult.transactionBase64);

      // Find the embedded wallet - try multiple matching strategies
      console.log('[AutoSwap] Looking for embedded wallet, available wallets:', wallets.map((w: any) => ({
        address: w.address,
        walletClientType: w.walletClientType,
        connectorType: w.connectorType,
        standardWallet: w.standardWallet?.name
      })));
      
      // Strategy 1: Find wallet by matching address
      let embeddedWallet = wallets.find((w: any) => w.address === userPublicKey);
      
      // Strategy 2: Find any privy/embedded wallet
      if (!embeddedWallet) {
        embeddedWallet = wallets.find((w: any) => 
          w.walletClientType === 'privy' || 
          w.standardWallet?.name === 'Privy' ||
          w.connectorType === 'embedded'
        );
      }
      
      // Strategy 3: Use any available wallet
      if (!embeddedWallet && wallets.length > 0) {
        console.log('[AutoSwap] Using first available wallet');
        embeddedWallet = wallets[0];
      }
      
      let signature: string;
      
      if (embeddedWallet) {
        // Try using getProvider first (for embedded wallets)
        if (typeof (embeddedWallet as any).getProvider === 'function') {
          console.log('[AutoSwap] Using wallet provider for signing');
          const provider = await (embeddedWallet as any).getProvider();
          const { signature: sig } = await provider.request({
            method: 'signAndSendTransaction',
            params: {
              transaction: swapResult.transactionBase64,
              sendOptions: { skipPreflight: false }
            }
          });
          signature = sig;
        } else if (typeof (embeddedWallet as any).signAndSendTransaction === 'function') {
          // Direct signAndSendTransaction method - pass base64 string, not bytes
          console.log('[AutoSwap] Using wallet.signAndSendTransaction');
          const result = await (embeddedWallet as any).signAndSendTransaction(swapResult.transactionBase64);
          signature = result.signature || result;
        } else if (typeof (embeddedWallet as any).sendTransaction === 'function') {
          // Try sendTransaction
          console.log('[AutoSwap] Using wallet.sendTransaction');
          const result = await (embeddedWallet as any).sendTransaction(transactionBytes);
          signature = result.signature || result;
        } else {
          console.log('[AutoSwap] Available wallet methods:', Object.keys(embeddedWallet as any));
          throw new Error('Wallet does not support automatic signing. Use the manual convert button.');
        }
      } else {
        // No wallet available at all
        console.log('[AutoSwap] No wallet found in useWallets array');
        console.log('[AutoSwap] Target address:', userPublicKey);
        throw new Error('Embedded wallet not available. Use the manual convert button.');
      }

      console.log('[AutoSwap] Swap successful! Signature:', signature);
      
      lastSwapTimeRef.current = Date.now();

      setIsSwapping(false);
      return {
        success: true,
        signature,
        usdcReceived: swapResult.expectedUsdcOut,
      };
    } catch (err: unknown) {
      logError('Swap failed', err);
      const errorMessage = err instanceof Error ? err.message : 'Auto-swap failed';
      setError(errorMessage);
      setIsSwapping(false);
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, [wallets, walletsReady, isSwapping]);

  useEffect(() => {
    if (walletsReady && pendingSwapRef.current && !isSwapping) {
      console.log('[AutoSwap] Wallets now ready, executing pending swap');
      const { balance, address, onComplete } = pendingSwapRef.current;
      pendingSwapRef.current = null;
      
      performAutoSwap(balance, address).then((result) => {
        if (result.success) {
          console.log('[AutoSwap] Pending swap completed successfully');
        }
        onComplete?.(result);
      });
    }
  }, [walletsReady, isSwapping, performAutoSwap]);

  const checkAndAutoSwap = useCallback(async (
    currentSolBalance: number,
    embeddedWalletAddress: string | null,
    onStart?: () => void,
    onComplete?: (result: AutoSwapResult) => void,
    forceSwap: boolean = false
  ): Promise<boolean> => {
    const swapAmount = calculateSwapAmount(currentSolBalance);
    const previousBalance = previousBalanceRef.current;
    const balanceIncrease = currentSolBalance - previousBalance;
    
    if (!embeddedWalletAddress || isSwapping) {
      return false;
    }
    
    if (swapAmount <= MIN_SWAP_THRESHOLD) {
      previousBalanceRef.current = currentSolBalance;
      swapAttemptedForDepositRef.current = false;
      return false;
    }

    const isNewDeposit = balanceIncrease >= DEPOSIT_DETECTION_THRESHOLD;
    const isFirstDeposit = previousBalance === 0 && currentSolBalance > MIN_SWAP_THRESHOLD;
    
    if (isNewDeposit || isFirstDeposit) {
      swapAttemptedForDepositRef.current = false;
      console.log('[AutoSwap] New deposit detected! Increase:', balanceIncrease.toFixed(6), 'SOL');
    }

    if (swapAttemptedForDepositRef.current && !forceSwap) {
      return false;
    }

    const now = Date.now();
    const timeSinceLastSwap = now - lastSwapTimeRef.current;
    if (timeSinceLastSwap < SWAP_COOLDOWN_MS && !forceSwap) {
      return false;
    }
    
    if (forceSwap || isFirstDeposit || isNewDeposit) {
      console.log('[AutoSwap] Triggering swap for', currentSolBalance.toFixed(6), 'SOL');
      
      swapAttemptedForDepositRef.current = true;
      previousBalanceRef.current = currentSolBalance;
      
      if (!walletsReady) {
        console.log('[AutoSwap] Wallets not ready, queueing swap for when ready');
        pendingSwapRef.current = { balance: currentSolBalance, address: embeddedWalletAddress, onComplete };
        return false;
      }
      
      onStart?.();
      const result = await performAutoSwap(currentSolBalance, embeddedWalletAddress);
      
      if (result.success) {
        console.log('[AutoSwap] Swap completed successfully');
      }
      
      onComplete?.(result);
      return result.success;
    }

    previousBalanceRef.current = currentSolBalance;
    return false;
  }, [isSwapping, performAutoSwap, walletsReady]);

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
    swapAttemptedForDepositRef.current = false;
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
