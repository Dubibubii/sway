import { ReactNode, useMemo } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { PrivySafeContext, PrivySafeContextType } from './use-privy-safe';

export default function PrivyAdapter({ children }: { children: ReactNode }) {
  const privy = usePrivy();
  
  const embeddedWallet = useMemo(() => {
    if (!privy.user) return null;
    const embeddedAccount = privy.user.linkedAccounts?.find(
      (account: any) => 
        account.type === 'wallet' && 
        account.walletClientType === 'privy' &&
        account.chainType === 'solana'
    );
    if (embeddedAccount) {
      return {
        address: (embeddedAccount as any).address,
        walletClientType: 'privy',
      };
    }
    return null;
  }, [privy.user]);
  
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
    createWallet: async () => {
      console.log('Embedded wallets are auto-created on login. Please log in again if wallet is missing.');
    },
  };
  
  return (
    <PrivySafeContext.Provider value={value}>
      {children}
    </PrivySafeContext.Provider>
  );
}
