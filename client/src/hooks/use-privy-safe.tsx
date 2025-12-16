import { createContext, useContext, ReactNode, lazy, Suspense } from 'react';

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

export const PrivySafeContext = createContext<PrivySafeContextType>({
  login: () => {},
  logout: () => {},
  authenticated: false,
  user: null,
  getAccessToken: async () => null,
  ready: true,
});

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
    const PrivyAdapter = lazy(() => import('./privy-adapter'));
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#0a0a0f]" />}>
        <PrivyAdapter>{children}</PrivyAdapter>
      </Suspense>
    );
  }
  return <DemoProvider>{children}</DemoProvider>;
}

export function usePrivySafe(): PrivySafeContextType {
  return useContext(PrivySafeContext);
}
