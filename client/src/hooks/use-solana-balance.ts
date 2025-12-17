import { useState, useEffect, useCallback } from 'react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
const SOL_PRICE_API = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';

interface SolanaBalance {
  solBalance: number;
  usdBalance: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSolanaBalance(walletAddress: string | null | undefined): SolanaBalance {
  const [solBalance, setSolBalance] = useState(0);
  const [usdBalance, setUsdBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!walletAddress) {
      setSolBalance(0);
      setUsdBalance(0);
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

      try {
        const priceResponse = await fetch(SOL_PRICE_API);
        const priceData = await priceResponse.json();
        const solPrice = priceData?.solana?.usd || 0;
        setUsdBalance(sol * solPrice);
      } catch (priceError) {
        const fallbackPrice = 200;
        setUsdBalance(sol * fallbackPrice);
      }
    } catch (err) {
      console.error('Error fetching Solana balance:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch balance');
      setSolBalance(0);
      setUsdBalance(0);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  return {
    solBalance,
    usdBalance,
    isLoading,
    error,
    refetch: fetchBalance,
  };
}
