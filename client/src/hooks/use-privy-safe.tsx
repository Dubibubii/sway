import { createContext, useContext, ReactNode } from 'react';
import { usePrivy } from '@privy-io/react-auth';

export const PRIVY_ENABLED = !!import.meta.env.VITE_PRIVY_APP_ID;

export interface PrivySafeContextType {
  login: () => void;
  logout: () => void;
  authenticated: boolean;
  user: {
    id: string;
    wallet?: { address: string };
    email?: { address: string };
  } | null;
  getAccessToken: () => Promise<string | null>;
  ready: boolean;
}

const PrivySafeContext = createContext<PrivySafeContextType>({
  login: () => {},
  logout: () => {},
  authenticated: false,
  user: null,
  getAccessToken: async () => null,
  ready: true,
});

function PrivyAdapter({ children }: { children: ReactNode }) {
  const privy = usePrivy();
  
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
  };
  
  return (
    <PrivySafeContext.Provider value={value}>
      {children}
    </PrivySafeContext.Provider>
  );
}

function DemoProvider({ children }: { children: ReactNode }) {
  const value: PrivySafeContextType = {
    login: () => { alert('Demo mode - connect wallet disabled. Please configure VITE_PRIVY_APP_ID for wallet authentication.'); },
    logout: () => {},
    authenticated: false,
    user: null,
    getAccessToken: async () => null,
    ready: true,
  };
  
  return (
    <PrivySafeContext.Provider value={value}>
      {children}
    </PrivySafeContext.Provider>
  );
}

export function PrivySafeProvider({ children }: { children: ReactNode }) {
  if (PRIVY_ENABLED) {
    return <PrivyAdapter>{children}</PrivyAdapter>;
  }
  return <DemoProvider>{children}</DemoProvider>;
}

export function usePrivySafe(): PrivySafeContextType {
  return useContext(PrivySafeContext);
}
