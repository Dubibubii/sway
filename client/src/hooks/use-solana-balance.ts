import { useState, useEffect, useCallback } from 'react';

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
      // Fetch balance via backend (uses Helius RPC)
      const balanceResponse = await fetch(`/api/solana/balance/${walletAddress}`);
      if (!balanceResponse.ok) {
        throw new Error('Failed to fetch balance');
      }
      const balanceData = await balanceResponse.json();
      const sol = balanceData.solBalance || 0;
      const usdc = balanceData.usdcBalance || 0;
      
      setSolBalance(sol);
      setUsdcBalance(usdc);

      // Fetch SOL price
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
