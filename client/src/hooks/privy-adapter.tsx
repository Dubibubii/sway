import { ReactNode, useMemo, useCallback } from 'react';
import { usePrivy, useFundWallet, useExportAccount } from '@privy-io/react-auth';
import { PrivySafeContext, PrivySafeContextType } from './use-privy-safe';

export default function PrivyAdapter({ children }: { children: ReactNode }) {
  const privy = usePrivy();
  const { fundWallet: privyFundWallet } = useFundWallet();
  const { exportAccount: privyExportAccount } = useExportAccount();
  
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
  
  const createWalletWrapper = async () => {
    try {
      await (privy.createWallet as any)({ chainType: 'solana' });
    } catch (error) {
      console.error('Failed to create wallet:', error);
    }
  };
  
  const fundWalletWrapper = useCallback(async (address: string) => {
    try {
      await privyFundWallet(address, { chain: { id: 'solana:mainnet' } as any });
    } catch (error) {
      console.error('Failed to fund wallet:', error);
    }
  }, [privyFundWallet]);
  
  const exportWalletWrapper = useCallback(async () => {
    try {
      if (embeddedWallet?.address) {
        await privyExportAccount({ address: embeddedWallet.address });
      }
    } catch (error) {
      console.error('Failed to export wallet:', error);
    }
  }, [privyExportAccount, embeddedWallet?.address]);
  
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
