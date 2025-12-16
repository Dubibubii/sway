import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import App from "./App";
import "./index.css";
import { PrivySafeProvider, PRIVY_ENABLED } from "@/hooks/use-privy-safe";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;

const AppWithProviders = () => {
  if (PRIVY_ENABLED && PRIVY_APP_ID) {
    return (
      <PrivyProvider
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
        <PrivySafeProvider>
          <App />
        </PrivySafeProvider>
      </PrivyProvider>
    );
  }
  
  return (
    <PrivySafeProvider>
      <App />
    </PrivySafeProvider>
  );
};

createRoot(document.getElementById("root")!).render(<AppWithProviders />);
