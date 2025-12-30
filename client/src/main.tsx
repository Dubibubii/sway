import { Buffer } from 'buffer';
(window as any).Buffer = Buffer;

import { createRoot } from "react-dom/client";
import { useEffect, useState, ReactNode, useMemo, useCallback } from "react";
import App from "./App";
import "./index.css";
import { PrivySafeProvider, PrivySafeContext, PrivySafeContextType, PRIVY_ENABLED } from "@/hooks/use-privy-safe";
import { SolanaTransactionContext, SolanaTransactionContextType, createSOLTransferTransaction, createSOLTransferWithFeeTransaction, TransactionResult } from "@/hooks/use-solana-transaction";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { useFundWallet, useSignAndSendTransaction, useWallets, toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import {
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
  registerMwa
} from '@solana-mobile/wallet-standard-mobile';
import { MWA_ENV } from '@/lib/mwa-env';

console.log('[MWA] Environment detection:', MWA_ENV);
console.log('[MWA] User Agent:', navigator.userAgent);
console.log('[MWA] Current URL:', window.location.href);

// Listen for Wallet Standard events for debugging
if (typeof window !== 'undefined') {
  const originalAddEventListener = window.addEventListener;
  window.addEventListener = function(type: string, listener: any, options?: any) {
    if (type.includes('wallet') || type.includes('standard')) {
      console.log('[MWA-Debug] Event listener added:', type);
    }
    return originalAddEventListener.call(this, type, listener, options);
  };
  
  // Monitor for wallet-standard:app-ready events
  window.addEventListener('wallet-standard:app-ready', (e: any) => {
    console.log('[MWA-Debug] wallet-standard:app-ready event:', e);
  });
}

// Register Solana Mobile Wallet Adapter for Android devices (Seeker, etc.)
// This enables hardware wallet connections on mobile Chrome browser
// NOTE: MWA does NOT work in WebView-based APKs - only Android Chrome browser
if (!MWA_ENV.isWebView) {
  try {
    // Determine the app URI - use production domain for APK, otherwise current origin
    const appUri = window.location.hostname.includes('swaymarkets.xyz') 
      ? 'https://swaymarkets.xyz'
      : window.location.origin;
    
    console.log('[MWA] Registering with app URI:', appUri);
    console.log('[MWA] App identity name: SWAY');
    
    const mwaResult = registerMwa({
      appIdentity: {
        name: 'SWAY',
        uri: appUri,
        // Use a data URI for icon to ensure it's always available in APK context
        icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIHJ4PSIyNCIgZmlsbD0iIzBhMGEwZiIvPjx0ZXh0IHg9IjY0IiB5PSI4MCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iNDgiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjMTBiOTgxIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5TV0FZPC90ZXh0Pjwvc3ZnPg=='
      },
      authorizationCache: createDefaultAuthorizationCache(),
      chains: ['solana:mainnet'],
      chainSelector: createDefaultChainSelector(),
      onWalletNotFound: () => {
        console.log('[MWA] onWalletNotFound triggered - Seed Vault may not be available');
        console.log('[MWA] Please ensure Seed Vault Wallet app is installed and set up');
        return Promise.resolve();
      }
    });
    console.log('[MWA] Solana Mobile Wallet Adapter registered successfully');
    console.log('[MWA] Registration result:', mwaResult);
    
    // Check for registered wallets after a delay
    setTimeout(() => {
      if ((window as any).navigator?.wallets) {
        console.log('[MWA-Debug] navigator.wallets available:', (window as any).navigator.wallets);
      }
      // Check wallet-standard registry
      const walletStandard = (window as any)['wallet-standard'];
      if (walletStandard) {
        console.log('[MWA-Debug] wallet-standard registry:', walletStandard);
      }
    }, 2000);
  } catch (err) {
    console.log('[MWA] Mobile Wallet Adapter registration failed:', err);
    console.error('[MWA] Registration error details:', err);
  }
} else {
  console.log('[MWA] WebView detected - MWA not supported. Use Chrome browser for hardware wallet.');
  console.log('[MWA] WebView indicators found in UA');
}

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;
const PRIVY_CLIENT_ID = import.meta.env.VITE_PRIVY_CLIENT_ID;

const LoadingScreen = () => (
  <div className="min-h-screen bg-[#0a0a0f]" />
);

function PrivyInnerAdapter({ children }: { children: ReactNode }) {
  const privy = usePrivy();
  const { fundWallet } = useFundWallet();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { wallets: privyWallets } = useWallets();
  
  const [txIsLoading, setTxIsLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  
  // Comprehensive debugging for wallet connection flow
  useEffect(() => {
    console.log('[Privy-Debug] === Connection State Update ===');
    console.log('[Privy-Debug] ready:', privy.ready);
    console.log('[Privy-Debug] authenticated:', privy.authenticated);
    console.log('[Privy-Debug] user exists:', !!privy.user);
    console.log('[Privy-Debug] user id:', privy.user?.id);
    
    if (privy.user?.linkedAccounts) {
      console.log('[Privy-Debug] Total linked accounts:', privy.user.linkedAccounts.length);
      privy.user.linkedAccounts.forEach((account: any, idx: number) => {
        console.log(`[Privy-Debug] Account ${idx}:`, {
          type: account.type,
          chainType: account.chainType,
          walletClientType: account.walletClientType,
          address: account.address?.slice(0, 8) + '...' + account.address?.slice(-4),
          connectorType: account.connectorType,
          walletClient: account.walletClient,
        });
      });
      
      // Specifically look for external Solana wallets (MWA, Seed Vault)
      const externalSolanaWallets = privy.user.linkedAccounts.filter(
        (acc: any) => acc.type === 'wallet' && acc.chainType === 'solana' && acc.walletClientType !== 'privy'
      );
      console.log('[Privy-Debug] External Solana wallets found:', externalSolanaWallets.length);
      externalSolanaWallets.forEach((w: any) => {
        console.log('[Privy-Debug] External wallet:', {
          address: w.address,
          walletClientType: w.walletClientType,
          connectorType: w.connectorType,
        });
      });
    }
  }, [privy.ready, privy.authenticated, privy.user, privy.user?.linkedAccounts]);
  
  // Debug privyWallets from useWallets hook
  useEffect(() => {
    console.log('[Privy-Debug] useWallets() returned:', privyWallets?.length || 0, 'wallets');
    privyWallets?.forEach((wallet: any, idx: number) => {
      console.log(`[Privy-Debug] Wallet ${idx}:`, {
        address: wallet.address,
        walletClientType: wallet.walletClientType,
        chainType: wallet.chainType,
        isConnected: wallet.isConnected,
        connectionStatus: wallet.connectionStatus,
      });
    });
  }, [privyWallets]);
  
  const embeddedWalletData = useMemo(() => {
    if (!privy.user?.linkedAccounts) return null;
    
    const embedded = privy.user.linkedAccounts.find(
      (account: any) => 
        account.type === 'wallet' && 
        account.walletClientType === 'privy' &&
        account.chainType === 'solana'
    );
    
    if (embedded && 'address' in embedded) {
      console.log('[Privy-Debug] Found embedded Privy wallet:', (embedded as any).address);
      return {
        address: (embedded as any).address,
        walletClientType: 'privy',
        id: (embedded as any).id,
      };
    }
    return null;
  }, [privy.user?.linkedAccounts]);

  const embeddedWallet = embeddedWalletData ? {
    address: embeddedWalletData.address,
    walletClientType: embeddedWalletData.walletClientType,
  } : null;
  
  // Detect external wallet address (e.g., from MWA, Phantom, Solflare)
  const externalWalletAddress = useMemo(() => {
    console.log('[Privy-Debug] Checking for external wallet address...');
    if (!privy.user?.linkedAccounts) {
      console.log('[Privy-Debug] No linked accounts available');
      return null;
    }
    
    const externalWallet = privy.user.linkedAccounts.find(
      (account: any) => 
        account.type === 'wallet' && 
        account.walletClientType !== 'privy' &&
        account.chainType === 'solana'
    );
    
    if (externalWallet && 'address' in externalWallet) {
      console.log('[Privy-Debug] Found external Solana wallet:', {
        address: (externalWallet as any).address,
        walletClientType: (externalWallet as any).walletClientType,
        connectorType: (externalWallet as any).connectorType,
      });
      return (externalWallet as any).address;
    }
    console.log('[Privy-Debug] No external Solana wallet found in linked accounts');
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
    console.log('Opening Privy funding modal for address:', address);
    
    try {
      await fundWallet({
        address,
        options: {
          chain: 'solana:mainnet' as const
        }
      });
    } catch (err: any) {
      console.error('Privy fundWallet error:', err);
      throw err;
    }
  };

  const exportWalletWrapper = async () => {
    alert('To withdraw funds, copy your wallet address and send from an external wallet like Phantom. We are working on direct withdrawals.');
  };

  const getPrivyWallet = useCallback(() => {
    if (!privyWallets || privyWallets.length === 0) return null;
    return privyWallets.find((w: any) => w.address === embeddedWalletData?.address) || privyWallets[0];
  }, [privyWallets, embeddedWalletData]);

  const sendSOL = useCallback(async (toAddress: string, amountSOL: number): Promise<TransactionResult> => {
    if (!embeddedWalletData?.address) {
      throw new Error('No wallet connected');
    }
    if (amountSOL <= 0.000001) {
      throw new Error('Amount too small');
    }
    const wallet = getPrivyWallet();
    if (!wallet || !signAndSendTransaction) {
      throw new Error('Wallet or transaction signing not available');
    }

    setTxIsLoading(true);
    setTxError(null);

    try {
      const { transaction } = await createSOLTransferTransaction(embeddedWalletData.address, toAddress, amountSOL);
      const result = await signAndSendTransaction({
        transaction: transaction.serialize({ requireAllSignatures: false }),
        wallet
      });
      const signature = typeof result === 'string' ? result : (result as any)?.signature || String(result);
      return { signature, success: true };
    } catch (err: any) {
      setTxError(err?.message || 'Transaction failed');
      throw err;
    } finally {
      setTxIsLoading(false);
    }
  }, [embeddedWalletData, signAndSendTransaction, getPrivyWallet]);

  const sendSOLWithFee = useCallback(async (toAddress: string, amountSOL: number, feePercent: number = 1): Promise<TransactionResult> => {
    if (!embeddedWalletData?.address) {
      throw new Error('No wallet connected');
    }
    if (amountSOL <= 0.000001) {
      throw new Error('Amount too small');
    }
    const wallet = getPrivyWallet();
    if (!wallet || !signAndSendTransaction) {
      throw new Error('Wallet or transaction signing not available');
    }

    setTxIsLoading(true);
    setTxError(null);

    try {
      const { transaction, feeAmount } = await createSOLTransferWithFeeTransaction(
        embeddedWalletData.address, 
        toAddress, 
        amountSOL
      );
      const recipientAmount = amountSOL - feeAmount;
      console.log(`Sending ${recipientAmount} SOL to ${toAddress}, fee: ${feeAmount} SOL`);
      const result = await signAndSendTransaction({
        transaction: transaction.serialize({ requireAllSignatures: false }),
        wallet
      });
      const signature = typeof result === 'string' ? result : (result as any)?.signature || String(result);
      return { signature, success: true, feeAmount, recipientAmount };
    } catch (err: any) {
      setTxError(err?.message || 'Transaction failed');
      throw err;
    } finally {
      setTxIsLoading(false);
    }
  }, [embeddedWalletData, signAndSendTransaction, getPrivyWallet]);

  const privySafeValue: PrivySafeContextType = {
    login: privy.login,
    logout: privy.logout,
    authenticated: privy.authenticated,
    user: privy.user,
    getAccessToken: privy.getAccessToken,
    ready: privy.ready,
    embeddedWallet,
    externalWalletAddress,
    createWallet: createWalletWrapper,
    fundWallet: fundWalletWrapper,
    exportWallet: exportWalletWrapper,
  };

  const solanaTransactionValue: SolanaTransactionContextType = {
    sendSOL,
    sendSOLWithFee,
    isLoading: txIsLoading,
    error: txError,
  };

  return (
    <PrivySafeContext.Provider value={privySafeValue}>
      <SolanaTransactionContext.Provider value={solanaTransactionValue}>
        {children}
      </SolanaTransactionContext.Provider>
    </PrivySafeContext.Provider>
  );
}

// Enable Solana wallet connectors with auto-connect for external wallets
// This includes Seed Vault Wallet (Solflare-based) on Solana Seeker devices
const solanaConnectors = toSolanaWalletConnectors({
  shouldAutoConnect: true,
});

function PrivyWrapperComponent({ children }: { children: ReactNode }) {
  const heliusApiKey = import.meta.env.VITE_HELIUS_API_KEY;
  const rpcUrl = heliusApiKey 
    ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
    : 'https://api.mainnet-beta.solana.com';
  const wssUrl = heliusApiKey
    ? `wss://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
    : 'wss://api.mainnet-beta.solana.com';

  const solanaRpc = useMemo(() => createSolanaRpc(rpcUrl), [rpcUrl]);
  const solanaRpcSubscriptions = useMemo(() => createSolanaRpcSubscriptions(wssUrl), [wssUrl]);

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID!}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#10b981',
          showWalletLoginFirst: true,
          walletChainType: 'solana-only',
          // Include detected wallets + popular Solana wallets
          // Solflare is key for Seeker's Seed Vault Wallet which is Solflare-based
          walletList: ['detected_solana_wallets', 'solflare', 'phantom', 'backpack'],
        },
        loginMethods: ['wallet', 'email', 'google'],
        embeddedWallets: {
          showWalletUIs: false,
          solana: {
            createOnLogin: 'all-users',
          },
        },
        externalWallets: {
          solana: {
            connectors: solanaConnectors,
          },
        },
        fundingMethodConfig: {
          moonpay: {
            useSandbox: false,
          },
        },
        solana: {
          rpcs: {
            'solana:mainnet': {
              rpc: solanaRpc,
              rpcSubscriptions: solanaRpcSubscriptions,
            },
          },
        },
      }}
    >
      <PrivyInnerAdapter>
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

export { PRIVY_ENABLED };
