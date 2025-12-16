import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import App from "./App";
import "./index.css";

// NOTE: Replace this with your actual Privy App ID from the dashboard
const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || "cm4r9r8h602h6125k9q8y6y6j"; 

createRoot(document.getElementById("root")!).render(
  <PrivyProvider
    appId={PRIVY_APP_ID}
    config={{
      appearance: {
        theme: 'dark',
        accentColor: '#10b981', // Emerald-500
        showWalletLoginFirst: true,
      },
      loginMethods: ['wallet', 'email', 'google', 'twitter'],
      embeddedWallets: {
        createOnLogin: 'users-without-wallets',
      },
    }}
  >
    <App />
  </PrivyProvider>
);
