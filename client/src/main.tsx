import { createRoot } from "react-dom/client";
import { lazy, Suspense, useEffect, useState, ReactNode } from "react";
import App from "./App";
import "./index.css";
import { PrivySafeProvider, PRIVY_ENABLED } from "@/hooks/use-privy-safe";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;

const LoadingScreen = () => (
  <div className="min-h-screen bg-[#0a0a0f]" />
);

function PrivyWrapperComponent({ children }: { children: ReactNode }) {
  const [PrivyProvider, setPrivyProvider] = useState<any>(null);
  const [solanaConnectors, setSolanaConnectors] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      import("@privy-io/react-auth"),
      import("@privy-io/react-auth/solana")
    ]).then(([privyMod, solanaMod]) => {
      setPrivyProvider(() => privyMod.PrivyProvider);
      setSolanaConnectors(() => solanaMod.toSolanaWalletConnectors());
    });
  }, []);

  if (!PrivyProvider || !solanaConnectors) {
    return <LoadingScreen />;
  }

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
          createOnLogin: 'all-users',
          showWalletUIs: true,
        },
        externalWallets: {
          solana: {
            connectors: solanaConnectors,
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

const AppWithProviders = () => {
  if (PRIVY_ENABLED && PRIVY_APP_ID) {
    return (
      <PrivyWrapperComponent>
        <PrivySafeProvider>
          <App />
        </PrivySafeProvider>
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
