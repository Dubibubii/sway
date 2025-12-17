import { createRoot } from "react-dom/client";
import { useEffect, useState, ReactNode, useMemo, useCallback } from "react";
import App from "./App";
import "./index.css";
import { PrivySafeProvider, PrivySafeContext, PrivySafeContextType, PRIVY_ENABLED } from "@/hooks/use-privy-safe";
import { SolanaTransactionContext, SolanaTransactionContextType, createSOLTransferTransaction, createSOLTransferWithFeeTransaction, TransactionResult } from "@/hooks/use-solana-transaction";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;
const PRIVY_CLIENT_ID = import.meta.env.VITE_PRIVY_CLIENT_ID;

const LoadingScreen = () => (
  <div className="min-h-screen bg-[#0a0a0f]" />
);

const useNoopHook = () => ({ signAndSendTransaction: null, wallets: [] });

function PrivyInnerAdapter({ children, usePrivyHook, useFundWalletHook, useSignAndSendTransactionHook = useNoopHook, useWalletsHook = useNoopHook }: { 
  children: ReactNode; 
  usePrivyHook: () => any; 
  useFundWalletHook: () => any;
  useSignAndSendTransactionHook?: () => any;
  useWalletsHook?: () => any;
}) {
  const privy = usePrivyHook();
  const fundWalletHookResult = useFundWalletHook();
  const privyFundWallet = typeof fundWalletHookResult === 'function' 
    ? fundWalletHookResult 
    : (fundWalletHookResult?.fundWallet || null);
  
  const txHookResult = useSignAndSendTransactionHook();
  const signAndSendTransaction = txHookResult?.signAndSendTransaction || null;
  const walletsHookResult = useWalletsHook();
  const privyWallets = walletsHookResult?.wallets || [];
  const [txIsLoading, setTxIsLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  
  const embeddedWalletData = useMemo(() => {
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
        id: (embedded as any).id,
      };
    }
    return null;
  }, [privy.user?.linkedAccounts]);

  const embeddedWallet = embeddedWalletData ? {
    address: embeddedWalletData.address,
    walletClientType: embeddedWalletData.walletClientType,
  } : null;
  
  const createWalletWrapper = async () => {
    try {
      await (privy.createWallet as any)({ chainType: 'solana' });
    } catch (error) {
      console.error('Failed to create Solana wallet:', error);
    }
  };

  const fundWalletWrapper = async (address: string) => {
    console.log('Opening Privy funding modal for address:', address);
    console.log('Embedded wallet data:', embeddedWalletData);
    console.log('privyFundWallet function:', privyFundWallet);
    
    if (!privyFundWallet) {
      console.error('fundWallet function not available from Privy');
      throw new Error('Funding modal not available');
    }
    
    const result = await privyFundWallet({
      address,
      chain: { type: 'solana' },
      options: {
        cluster: { name: 'mainnet-beta' },
      }
    });
    console.log('Fund wallet result:', result);
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
      const signature = await signAndSendTransaction({
        transaction: transaction.serialize({ requireAllSignatures: false }),
        wallet
      });
      return { signature, success: true };
    } catch (err: any) {
      setTxError(err?.message || 'Transaction failed');
      throw err;
    } finally {
      setTxIsLoading(false);
    }
  }, [embeddedWalletData, signAndSendTransaction, getPrivyWallet]);

  const sendSOLWithFee = useCallback(async (toAddress: string, amountSOL: number): Promise<TransactionResult> => {
    if (!embeddedWalletData?.address) {
      throw new Error('No wallet connected');
    }
    if (amountSOL <= 0.02) {
      throw new Error('Amount too small for fee transaction (minimum ~$0.02)');
    }
    const wallet = getPrivyWallet();
    if (!wallet || !signAndSendTransaction) {
      throw new Error('Wallet or transaction signing not available');
    }

    setTxIsLoading(true);
    setTxError(null);

    try {
      const { transaction, feeAmount } = await createSOLTransferWithFeeTransaction(embeddedWalletData.address, toAddress, amountSOL);
      console.log(`Sending ${amountSOL} SOL with ${feeAmount} SOL fee`);
      const signature = await signAndSendTransaction({
        transaction: transaction.serialize({ requireAllSignatures: false }),
        wallet
      });
      return { signature, success: true };
    } catch (err: any) {
      setTxError(err?.message || 'Transaction failed');
      throw err;
    } finally {
      setTxIsLoading(false);
    }
  }, [embeddedWalletData, signAndSendTransaction, getPrivyWallet]);

  const solanaTransactionValue: SolanaTransactionContextType = {
    sendSOL,
    sendSOLWithFee,
    isLoading: txIsLoading,
    error: txError,
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
      <SolanaTransactionContext.Provider value={solanaTransactionValue}>
        {children}
      </SolanaTransactionContext.Provider>
    </PrivySafeContext.Provider>
  );
}

function PrivyWrapperComponent({ children }: { children: ReactNode }) {
  const [privyModule, setPrivyModule] = useState<{
    PrivyProvider: any;
    usePrivy: () => any;
    useFundWallet: () => any;
    useSignAndSendTransaction: () => any;
    useWallets: () => any;
  } | null>(null);
  const [solanaConnectors, setSolanaConnectors] = useState<any>(null);

  const heliusApiKey = import.meta.env.VITE_HELIUS_API_KEY;
  const rpcUrl = heliusApiKey 
    ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
    : 'https://api.mainnet-beta.solana.com';
  const wssUrl = heliusApiKey
    ? `wss://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
    : 'wss://api.mainnet-beta.solana.com';

  const solanaRpc = useMemo(() => createSolanaRpc(rpcUrl), [rpcUrl]);
  const solanaRpcSubscriptions = useMemo(() => createSolanaRpcSubscriptions(wssUrl), [wssUrl]);

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
          useFundWallet: (privyMod as any).useFundWallet,
          useSignAndSendTransaction: solanaMod.useSignAndSendTransaction,
          useWallets: solanaMod.useWallets,
        });
        setSolanaConnectors(solanaMod.toSolanaWalletConnectors());
      }
    });
    return () => { mounted = false; };
  }, []);

  if (!privyModule || !solanaConnectors) {
    return <LoadingScreen />;
  }

  const { PrivyProvider, usePrivy, useFundWallet, useSignAndSendTransaction, useWallets } = privyModule;

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
      <PrivyInnerAdapter 
        usePrivyHook={usePrivy} 
        useFundWalletHook={useFundWallet}
        useSignAndSendTransactionHook={useSignAndSendTransaction}
        useWalletsHook={useWallets}
      >
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
