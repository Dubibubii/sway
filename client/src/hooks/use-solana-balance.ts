import { useState, useEffect, useCallback } from 'react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { USDC_MINT } from '@/utils/jupiterSwap';

const heliusApiKey = import.meta.env.VITE_HELIUS_API_KEY;
const SOLANA_RPC_URL = heliusApiKey 
  ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
  : 'https://api.mainnet-beta.solana.com';
const SOL_PRICE_API = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';

interface SolanaBalance {
  solBalance: number;
  usdcBalance: number;
  solPrice: number;
  usdBalance: number;
  totalPortfolioValue: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSolanaBalance(walletAddress: string | null | undefined): SolanaBalance {
  const [solBalance, setSolBalance] = useState(0);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [solPrice, setSolPrice] = useState(0);
  const [usdBalance, setUsdBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!walletAddress) {
      setSolBalance(0);
      setUsdcBalance(0);
      setUsdBalance(0);
      setSolPrice(0);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
      const publicKey = new PublicKey(walletAddress);
      
      const lamports = await connection.getBalance(publicKey);
      const sol = lamports / LAMPORTS_PER_SOL;
      setSolBalance(sol);

      let currentSolPrice = 0;
      try {
        const priceResponse = await fetch(SOL_PRICE_API);
        const priceData = await priceResponse.json();
        currentSolPrice = priceData?.solana?.usd || 200;
        setSolPrice(currentSolPrice);
      } catch (priceError) {
        currentSolPrice = 200;
        setSolPrice(currentSolPrice);
      }
      
      setUsdBalance(sol * currentSolPrice);

      try {
        const usdcMint = new PublicKey(USDC_MINT);
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
          mint: usdcMint,
        });
        
        let totalUsdc = 0;
        for (const account of tokenAccounts.value) {
          const tokenAmount = account.account.data.parsed?.info?.tokenAmount;
          if (tokenAmount) {
            totalUsdc += parseFloat(tokenAmount.uiAmountString || '0');
          }
        }
        setUsdcBalance(totalUsdc);
      } catch (usdcError) {
        console.error('Error fetching USDC balance:', usdcError);
        setUsdcBalance(0);
      }
    } catch (err) {
      console.error('Error fetching Solana balance:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch balance');
      setSolBalance(0);
      setUsdcBalance(0);
      setUsdBalance(0);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 5000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  const totalPortfolioValue = usdcBalance + (solBalance * solPrice);

  return {
    solBalance,
    usdcBalance,
    solPrice,
    usdBalance,
    totalPortfolioValue,
    isLoading,
    error,
    refetch: fetchBalance,
  };
}
