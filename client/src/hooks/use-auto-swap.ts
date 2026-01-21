import { useState, useCallback, useRef, useEffect } from 'react';
import { useWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import { 
  prepareAutoSwap, 
  calculateSwapAmount, 
  getDynamicGasReserve,
  GAS_RESERVE_TINY,
  GAS_RESERVE_MICRO,
  GAS_RESERVE_STANDARD,
  TINY_DEPOSIT_THRESHOLD,
  MICRO_DEPOSIT_THRESHOLD,
  base64ToUint8Array 
} from '@/utils/jupiterSwap';

export interface AutoSwapResult {
  success: boolean;
  signature?: string;
  usdcReceived?: number;
  error?: string;
}

const MIN_SWAP_THRESHOLD = 0.003; // Lower threshold for tiny deposits
const SWAP_COOLDOWN_MS = 30000;
const DEPOSIT_DETECTION_THRESHOLD = 0.001;

// Persistent swap state - survives app close/reopen
const PENDING_SWAP_KEY = 'sway_pending_swap';
const SWAP_RECOVERY_KEY = 'sway_swap_recovery_checked';
const GAS_ONLY_DEPOSIT_KEY = 'sway_gas_only_deposit';

interface PendingSwapState {
  walletAddress: string;
  detectedBalance: number;
  timestamp: number;
}

function savePendingSwap(state: PendingSwapState | null) {
  try {
    if (state) {
      localStorage.setItem(PENDING_SWAP_KEY, JSON.stringify(state));
      console.log('[AutoSwap] Saved pending swap to localStorage:', state);
    } else {
      localStorage.removeItem(PENDING_SWAP_KEY);
    }
  } catch (e) {
    console.warn('[AutoSwap] Failed to save pending swap:', e);
  }
}

function loadPendingSwap(): PendingSwapState | null {
  try {
    const stored = localStorage.getItem(PENDING_SWAP_KEY);
    if (stored) {
      const state = JSON.parse(stored) as PendingSwapState;
      // Only restore if less than 1 hour old
      if (Date.now() - state.timestamp < 60 * 60 * 1000) {
        console.log('[AutoSwap] Loaded pending swap from localStorage:', state);
        return state;
      }
      // Clear stale pending swap
      localStorage.removeItem(PENDING_SWAP_KEY);
    }
  } catch (e) {
    console.warn('[AutoSwap] Failed to load pending swap:', e);
  }
  return null;
}

function markRecoveryChecked(walletAddress: string) {
  try {
    const key = `${SWAP_RECOVERY_KEY}_${walletAddress}`;
    localStorage.setItem(key, Date.now().toString());
  } catch (e) {}
}

function shouldCheckRecovery(walletAddress: string): boolean {
  try {
    const key = `${SWAP_RECOVERY_KEY}_${walletAddress}`;
    const lastCheck = localStorage.getItem(key);
    if (!lastCheck) return true;
    // Check recovery at most once every 5 minutes
    return Date.now() - parseInt(lastCheck) > 5 * 60 * 1000;
  } catch (e) {
    return true;
  }
}

// Gas-only deposit mode - when enabled, auto-swap is bypassed for ONE deposit
// Stores: { expiry: number, preDepositBalance: number }
interface GasOnlyState {
  expiry: number;
  preDepositBalance: number;
}

export function setGasOnlyDepositMode(enabled: boolean, currentBalance?: number) {
  try {
    if (enabled) {
      // Set flag with 10 minute expiry and record current balance
      const state: GasOnlyState = {
        expiry: Date.now() + 10 * 60 * 1000,
        preDepositBalance: currentBalance ?? 0,
      };
      localStorage.setItem(GAS_ONLY_DEPOSIT_KEY, JSON.stringify(state));
      console.log('[AutoSwap] Gas-only deposit mode enabled, pre-deposit balance:', currentBalance);
    } else {
      localStorage.removeItem(GAS_ONLY_DEPOSIT_KEY);
      console.log('[AutoSwap] Gas-only deposit mode disabled');
    }
  } catch (e) {
    console.warn('[AutoSwap] Failed to set gas-only deposit mode:', e);
  }
}

function getGasOnlyState(): GasOnlyState | null {
  try {
    const stored = localStorage.getItem(GAS_ONLY_DEPOSIT_KEY);
    if (!stored) return null;
    const state = JSON.parse(stored) as GasOnlyState;
    if (Date.now() > state.expiry) {
      localStorage.removeItem(GAS_ONLY_DEPOSIT_KEY);
      return null;
    }
    return state;
  } catch (e) {
    return null;
  }
}

export function isGasOnlyDepositMode(): boolean {
  return getGasOnlyState() !== null;
}

// Check if we should skip swap AND clear the flag if balance increased (deposit received)
function checkAndClearGasOnlyMode(currentBalance: number): boolean {
  const state = getGasOnlyState();
  if (!state) return false;
  
  // If balance has increased since gas-only mode was enabled, deposit arrived
  // Use same threshold as DEPOSIT_DETECTION_THRESHOLD for consistency
  if (currentBalance > state.preDepositBalance + DEPOSIT_DETECTION_THRESHOLD) {
    console.log('[AutoSwap] Gas deposit detected, clearing gas-only mode. New balance:', currentBalance);
    localStorage.removeItem(GAS_ONLY_DEPOSIT_KEY);
    return true; // Still skip THIS swap since it's the gas deposit
  }
  
  return true; // Gas-only mode still active, skip swap
}

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
  const { signAndSendTransaction } = useSignAndSendTransaction();
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
      
      if (!embeddedWallet) {
        console.log('[AutoSwap] No wallet found in useWallets array');
        console.log('[AutoSwap] Target address:', userPublicKey);
        throw new Error('Embedded wallet not available. Use the manual convert button.');
      }

      // Use Privy's signAndSendTransaction hook with the transaction bytes
      console.log('[AutoSwap] Using Privy signAndSendTransaction hook');
      const result = await signAndSendTransaction({
        transaction: transactionBytes,
        wallet: embeddedWallet,
      });
      
      const signature = typeof result === 'string' ? result : (result as any).signature || (result as any).hash || String(result);

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
  }, [wallets, walletsReady, isSwapping, signAndSendTransaction]);

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
    
    // Skip auto-swap if user is in gas-only deposit mode (depositing for gas, not USDC)
    // This also clears the flag after the gas deposit is detected
    if (checkAndClearGasOnlyMode(currentSolBalance) && !forceSwap) {
      console.log('[AutoSwap] Skipping - gas-only deposit mode is active');
      previousBalanceRef.current = currentSolBalance;
      return false;
    }
    
    if (swapAmount <= MIN_SWAP_THRESHOLD) {
      previousBalanceRef.current = currentSolBalance;
      swapAttemptedForDepositRef.current = false;
      // Clear any stale pending swap if balance is now low
      savePendingSwap(null);
      return false;
    }

    const isNewDeposit = balanceIncrease >= DEPOSIT_DETECTION_THRESHOLD;
    const isFirstDeposit = previousBalance === 0 && currentSolBalance > MIN_SWAP_THRESHOLD;
    
    if (isNewDeposit || isFirstDeposit) {
      swapAttemptedForDepositRef.current = false;
      console.log('[AutoSwap] New deposit detected! Increase:', balanceIncrease.toFixed(6), 'SOL');
      
      // CRITICAL: Save pending swap immediately so it survives app close
      savePendingSwap({
        walletAddress: embeddedWalletAddress,
        detectedBalance: currentSolBalance,
        timestamp: Date.now(),
      });
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
        // Clear pending swap on success
        savePendingSwap(null);
      }
      
      onComplete?.(result);
      return result.success;
    }

    previousBalanceRef.current = currentSolBalance;
    return false;
  }, [isSwapping, performAutoSwap, walletsReady]);

  // Recovery function - called on app mount to check for missed swaps
  const checkRecoverySwap = useCallback(async (
    currentSolBalance: number,
    embeddedWalletAddress: string | null,
    onStart?: () => void,
    onComplete?: (result: AutoSwapResult) => void
  ): Promise<boolean> => {
    if (!embeddedWalletAddress || isSwapping) {
      return false;
    }
    
    // Skip recovery if user is in gas-only deposit mode
    if (checkAndClearGasOnlyMode(currentSolBalance)) {
      console.log('[AutoSwap] Skipping recovery - gas-only deposit mode is active');
      return false;
    }
    
    // Check if we should run recovery (throttled to every 5 min)
    if (!shouldCheckRecovery(embeddedWalletAddress)) {
      return false;
    }
    markRecoveryChecked(embeddedWalletAddress);
    
    const swapAmount = calculateSwapAmount(currentSolBalance);
    
    // Check 1: Is there a pending swap saved from a previous session?
    const pendingSwap = loadPendingSwap();
    if (pendingSwap && pendingSwap.walletAddress === embeddedWalletAddress) {
      console.log('[AutoSwap] Found pending swap from previous session, attempting recovery...');
      if (swapAmount > MIN_SWAP_THRESHOLD) {
        return checkAndAutoSwap(currentSolBalance, embeddedWalletAddress, onStart, onComplete, true);
      } else {
        // Pending swap no longer needed (balance too low)
        savePendingSwap(null);
      }
    }
    
    // Check 2: Balance-based recovery - if SOL > gas reserve, trigger swap
    // This catches deposits that were never detected at all
    if (swapAmount > MIN_SWAP_THRESHOLD) {
      console.log('[AutoSwap] Recovery check: Found', swapAmount.toFixed(6), 'SOL available for swap');
      return checkAndAutoSwap(currentSolBalance, embeddedWalletAddress, onStart, onComplete, true);
    }
    
    return false;
  }, [isSwapping, checkAndAutoSwap]);

  const getSwapPreview = useCallback((currentSolBalance: number) => {
    const gasReserve = getDynamicGasReserve(currentSolBalance);
    const swapAmount = calculateSwapAmount(currentSolBalance);
    let tier = 'standard';
    if (currentSolBalance < TINY_DEPOSIT_THRESHOLD) tier = 'tiny';
    else if (currentSolBalance < MICRO_DEPOSIT_THRESHOLD) tier = 'micro';
    return {
      swapAmount,
      gasReserve,
      canSwap: swapAmount > MIN_SWAP_THRESHOLD,
      tier,
    };
  }, []);

  const resetPreviousBalance = useCallback((balance: number) => {
    previousBalanceRef.current = balance;
    swapAttemptedForDepositRef.current = false;
  }, []);

  return {
    performAutoSwap,
    checkAndAutoSwap,
    checkRecoverySwap,
    getSwapPreview,
    resetPreviousBalance,
    isSwapping,
    error,
    GAS_RESERVE_TINY,
    GAS_RESERVE_MICRO,
    GAS_RESERVE_STANDARD,
    TINY_DEPOSIT_THRESHOLD,
    MICRO_DEPOSIT_THRESHOLD,
  };
}
