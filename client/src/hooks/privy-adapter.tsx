import { ReactNode, useMemo, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useFundWallet } from '@privy-io/react-auth/solana';
import { PrivySafeContext, PrivySafeContextType } from './use-privy-safe';

export default function PrivyAdapter({ children }: { children: ReactNode }) {
  const privy = usePrivy();
  const { fundWallet: privyFundWallet } = useFundWallet();
  
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
    if (!privy.user?.linkedAccounts) return null;
    
    const externalWallet = privy.user.linkedAccounts.find(
      (account: any) => 
        account.type === 'wallet' && 
        account.walletClientType !== 'privy' &&
        account.chainType === 'solana'
    );
    
    if (externalWallet && 'address' in externalWallet) {
      return (externalWallet as any).address;
    }
    return null;
  }, [privy.user?.linkedAccounts]);
  
  const createWalletWrapper = async () => {
    try {
      await (privy.createWallet as any)({ chainType: 'solana' });
    } catch (error) {
      console.error('Failed to create wallet:', error);
    }
  };
  
  const fundWalletWrapper = useCallback(async (address: string) => {
    try {
      await privyFundWallet({
        address,
        options: {
          chain: 'solana:mainnet' as const
        }
      });
    } catch (error) {
      console.error('Failed to fund wallet:', error);
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
