import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import App from "./App";
import "./index.css";
import { PrivySafeProvider, PRIVY_ENABLED } from "@/hooks/use-privy-safe";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;

const LoadingScreen = () => (
  <div className="min-h-screen bg-[#0a0a0f]" />
);

const AppWithProviders = () => {
  if (PRIVY_ENABLED && PRIVY_APP_ID) {
    const PrivyWrapper = lazy(() =>
      import("@privy-io/react-auth").then((mod) => ({
        default: ({ children }: { children: React.ReactNode }) => (
          <mod.PrivyProvider
            appId={PRIVY_APP_ID}
            config={{
              appearance: {
                theme: 'dark',
                accentColor: '#10b981',
                showWalletLoginFirst: true,
              },
              loginMethods: ['wallet', 'email', 'google'],
            }}
          >
            {children}
          </mod.PrivyProvider>
        ),
      }))
    );
    
    return (
      <Suspense fallback={<LoadingScreen />}>
        <PrivyWrapper>
          <PrivySafeProvider>
            <App />
          </PrivySafeProvider>
        </PrivyWrapper>
      </Suspense>
    );
  }
  
  return (
    <PrivySafeProvider>
      <App />
    </PrivySafeProvider>
  );
};

createRoot(document.getElementById("root")!).render(<AppWithProviders />);
