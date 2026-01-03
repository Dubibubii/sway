import { ReactNode, useMemo, useCallback, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useFundWallet, useWallets as useSolanaWallets } from '@privy-io/react-auth/solana';
import { PrivySafeContext, PrivySafeContextType } from './use-privy-safe';

export default function PrivyAdapter({ children }: { children: ReactNode }) {
  const privy = usePrivy();
  const { fundWallet: privyFundWallet } = useFundWallet();
  const { wallets: solanaWallets } = useSolanaWallets();
  
  useEffect(() => {
    console.log('[Privy Debug] linkedAccounts:', JSON.stringify(privy.user?.linkedAccounts, null, 2));
    console.log('[Privy Debug] solanaWallets:', JSON.stringify(solanaWallets?.map((w: any) => ({ address: w.address, walletClientType: w.walletClientType })), null, 2));
    console.log('[Privy Debug] user.wallet:', privy.user?.wallet);
  }, [privy.user?.linkedAccounts, solanaWallets, privy.user?.wallet]);
  
  const embeddedWallet = useMemo(() => {
    if (!privy.user?.linkedAccounts) return null;
    
    const embedded = privy.user.linkedAccounts.find(
      (account: any) => 
        account.type === 'wallet' && 
        account.walletClientType === 'privy' &&
        account.chainType === 'solana'
    );
    
    if (embedded && 'address' in embedded) {
      return {
        address: (embedded as any).address,
        walletClientType: 'privy',
      };
    }
    return null;
  }, [privy.user?.linkedAccounts]);
  
  const externalWalletAddress = useMemo(() => {
    // First: Check useSolanaWallets for external wallets (most reliable for connected Solana wallets)
    if (solanaWallets && solanaWallets.length > 0) {
      const externalSolana = solanaWallets.find((w: any) => w.walletClientType !== 'privy');
      if (externalSolana) {
        console.log('[Privy Debug] Found external via useSolanaWallets:', externalSolana.address);
        return externalSolana.address;
      }
    }
    
    if (!privy.user?.linkedAccounts) return null;
    
    // Second: Check linkedAccounts for external Solana wallets
    const externalWallet = privy.user.linkedAccounts.find(
      (account: any) => 
        account.type === 'wallet' && 
        account.walletClientType !== 'privy' &&
        account.chainType === 'solana'
    );
    
    if (externalWallet && 'address' in externalWallet) {
      console.log('[Privy Debug] Found external via linkedAccounts (solana):', (externalWallet as any).address);
      return (externalWallet as any).address;
    }
    
    // Fallback: use user.wallet if it's different from embedded wallet
    const embeddedAddress = embeddedWallet?.address;
    if (privy.user?.wallet?.address && privy.user.wallet.address !== embeddedAddress) {
      console.log('[Privy Debug] Found external via user.wallet:', privy.user.wallet.address);
      return privy.user.wallet.address;
    }
    
    return null;
  }, [privy.user?.wallet?.address, privy.user?.linkedAccounts, embeddedWallet?.address, solanaWallets]);
  
  const createWalletWrapper = async () => {
    try {
      await (privy.createWallet as any)({ chainType: 'solana' });
    } catch (error) {
      console.error('Failed to create wallet:', error);
    }
  };
  
  const fundWalletWrapper = useCallback(async (address: string) => {
    try {
      console.log('[Privy] Calling fundWallet for address:', address);
      // Use simple call without options - Privy handles network config from dashboard
      await privyFundWallet({ address });
    } catch (error) {
      console.error('[Privy] Failed to fund wallet:', error);
      throw error;
    }
  }, [privyFundWallet]);
  
  const exportWalletWrapper = useCallback(async () => {
    console.log('Export wallet - copy address to send from external wallet');
  }, []);
  
  const value: PrivySafeContextType = {
    login: privy.login,
    logout: privy.logout,
    authenticated: privy.authenticated,
    user: privy.user ? {
      id: privy.user.id,
      wallet: privy.user.wallet ? { address: privy.user.wallet.address } : undefined,
      email: privy.user.email ? { address: privy.user.email.address } : undefined,
    } : null,
    getAccessToken: privy.getAccessToken,
    ready: privy.ready,
    embeddedWallet,
    externalWalletAddress,
    createWallet: createWalletWrapper,
    fundWallet: fundWalletWrapper,
    exportWallet: exportWalletWrapper,
  };
  
  return (
    <PrivySafeContext.Provider value={value}>
      {children}
    </PrivySafeContext.Provider>
  );
}
