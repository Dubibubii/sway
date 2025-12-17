import { createRoot } from "react-dom/client";
import { useEffect, useState, ReactNode, useMemo } from "react";
import App from "./App";
import "./index.css";
import { PrivySafeProvider, PrivySafeContext, PrivySafeContextType, PRIVY_ENABLED } from "@/hooks/use-privy-safe";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;

const LoadingScreen = () => (
  <div className="min-h-screen bg-[#0a0a0f]" />
);

function PrivyInnerAdapter({ children, usePrivyHook, useFundWalletHook }: { children: ReactNode; usePrivyHook: () => any; useFundWalletHook: () => any }) {
  const privy = usePrivyHook();
  const fundWalletHookResult = useFundWalletHook();
  const privyFundWallet = fundWalletHookResult?.fundWallet || fundWalletHookResult?.openFunding;
  
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
      console.error('Failed to create Solana wallet:', error);
    }
  };

  const fundWalletWrapper = async (address: string) => {
    try {
      await privyFundWallet({ 
        address,
        defaultFundingMethod: 'manual'
      });
    } catch (error) {
      console.error('Failed to open funding modal:', error);
    }
  };

  const exportWalletWrapper = async () => {
    alert('To withdraw funds, copy your wallet address and send from an external wallet like Phantom. We are working on direct withdrawals.');
  };
  
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

function PrivyWrapperComponent({ children }: { children: ReactNode }) {
  const [privyModule, setPrivyModule] = useState<{
    PrivyProvider: any;
    usePrivy: () => any;
    useFundWallet: () => any;
  } | null>(null);
  const [solanaConnectors, setSolanaConnectors] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      import("@privy-io/react-auth"),
      import("@privy-io/react-auth/solana")
    ]).then(([privyMod, solanaMod]) => {
      if (mounted) {
        setPrivyModule({
          PrivyProvider: privyMod.PrivyProvider,
          usePrivy: privyMod.usePrivy,
          useFundWallet: solanaMod.useFundWallet,
        });
        setSolanaConnectors(solanaMod.toSolanaWalletConnectors());
      }
    });
    return () => { mounted = false; };
  }, []);

  if (!privyModule || !solanaConnectors) {
    return <LoadingScreen />;
  }

  const { PrivyProvider, usePrivy, useFundWallet } = privyModule;

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#10b981',
          showWalletLoginFirst: true,
          walletChainType: 'solana-only',
          walletList: ['detected_solana_wallets', 'phantom', 'solflare', 'backpack', 'magic_eden', 'jupiter'],
        },
        loginMethods: ['wallet', 'email', 'google'],
        embeddedWallets: {
          solana: {
            createOnLogin: 'all-users',
          },
        },
        externalWallets: {
          solana: {
            connectors: solanaConnectors,
          },
        },
      }}
    >
      <PrivyInnerAdapter usePrivyHook={usePrivy} useFundWalletHook={useFundWallet}>
        {children}
      </PrivyInnerAdapter>
    </PrivyProvider>
  );
}

const AppWithProviders = () => {
  if (PRIVY_ENABLED && PRIVY_APP_ID) {
    return (
      <PrivyWrapperComponent>
        <App />
      </PrivyWrapperComponent>
    );
  }
  
  return (
    <PrivySafeProvider>
      <App />
    </PrivySafeProvider>
  );
};

createRoot(document.getElementById("root")!).render(<AppWithProviders />);
