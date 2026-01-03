import { useWallets as usePrivyWallets, useSignAndSendTransaction as usePrivySignAndSend } from '@privy-io/react-auth/solana';
import { PRIVY_ENABLED } from './use-privy-safe';

export function useWallets() {
  if (!PRIVY_ENABLED) {
    return { wallets: [], ready: true };
  }
  return usePrivyWallets();
}

export function useSignAndSendTransaction() {
  if (!PRIVY_ENABLED) {
    return {
      signAndSendTransaction: async () => {
        throw new Error('Demo mode - wallet operations disabled');
      }
    };
  }
  return usePrivySignAndSend();
}
