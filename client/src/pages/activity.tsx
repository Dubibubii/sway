import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Layout } from '@/components/layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Clock, Plus, X, Loader2, Filter, ChevronDown, ChevronRight, HelpCircle, Info, Sparkles, ExternalLink } from 'lucide-react';
import mascotImage from '@/assets/mascot.png';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { usePrivySafe } from '@/hooks/use-privy-safe';
import { useSolanaTransaction } from '@/hooks/use-solana-transaction';
import { useSolanaBalance } from '@/hooks/use-solana-balance';
import { usePondTrading } from '@/hooks/use-pond-trading';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useErrorToast } from '@/hooks/use-error-feedback';
import { FEE_CONFIG } from '@shared/schema';
import { calculateTradeFeesForBuy } from '@/utils/dflowFees';
import { SpreadExplainerSheet } from '@/components/spread-explainer';
import { useLivePrice } from '@/lib/dflow/livePriceStore';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

type BulkSellMode = 'all' | 'losing' | 'winning' | null;

interface Trade {
  id: string;
  marketId: string;
  marketTitle: string;
  marketCategory: string | null;
  optionLabel: string | null; // e.g., "Democratic Party" - what the user bet on
  direction: string;
  wagerAmount: number; // Stored in cents
  price: string;
  shares: string;
  estimatedPayout: string;
  entryFee: string | null; // Platform fee at entry
  isClosed: boolean;
  closedAt: string | null;
  pnl: string | null;
  createdAt: string;
}

// Back-calculate raw market price from cost basis and fees
// Using quadratic formula since DFlow fee = scale * p * (1-p) * contracts
function calculateRawMarketPrice(costBasis: number, platformFee: number, shares: number): number {
  if (shares < 0.001) return 0; // Epsilon check for near-zero shares
  
  const DFLOW_SCALE = 0.09; // Frost tier taker fee
  const netCost = costBasis - platformFee;
  
  // Solve: netCost = shares * p + DFLOW_SCALE * p * (1-p) * shares
  // => netCost = shares * p * (1 + DFLOW_SCALE - DFLOW_SCALE * p)
  // => DFLOW_SCALE * shares * p^2 - shares * (1 + DFLOW_SCALE) * p + netCost = 0
  // Using quadratic formula: p = (b ± sqrt(b² - 4ac)) / 2a
  const a = DFLOW_SCALE * shares;
  const b = -shares * (1 + DFLOW_SCALE);
  const c = netCost;
  
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    // Fallback to simple approximation
    return netCost / shares;
  }
  
  const sqrtD = Math.sqrt(discriminant);
  const p1 = (-b + sqrtD) / (2 * a);
  const p2 = (-b - sqrtD) / (2 * a);
  
  // Choose the valid price (0 < p < 1)
  if (p2 > 0 && p2 < 1) return p2;
  if (p1 > 0 && p1 < 1) return p1;
  
  // Fallback
  return netCost / shares;
}

export default function Activity() {
  const [, navigate] = useLocation();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Trade | null>(null);
  const [addAmount, setAddAmount] = useState('5');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Bulk sell state
  const [bulkSellMode, setBulkSellMode] = useState<BulkSellMode>(null);
  const [bulkSellModalOpen, setBulkSellModalOpen] = useState(false);
  const [bulkSellProgress, setBulkSellProgress] = useState({ current: 0, total: 0, successes: 0, failures: 0 });
  const [isBulkSelling, setIsBulkSelling] = useState(false);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [priceFetchError, setPriceFetchError] = useState<string | null>(null);
  
  // Sell quote state
  const [sellQuote, setSellQuote] = useState<{
    expectedUSDC: number;
    priceImpactPct: number;
    pricePerShare: number;
    warning: string | null;
    apiInfo?: string;
    isProduction?: boolean;
    error?: string;
    feeBreakdown?: {
      grossValue: number;
      totalFees: number;
      netAmount: number;
    };
    orderbook?: {
      yesBid: number;
      yesAsk: number;
      noBid: number;
      noAsk: number;
    };
  } | null>(null);
  const [isLoadingSellQuote, setIsLoadingSellQuote] = useState(false);
  
  // Spread explainer state (educational modal)
  const [showSpreadExplainer, setShowSpreadExplainer] = useState(false);
  
  // Sell mode selection state - shows choice before sell confirmation
  const [sellModeStep, setSellModeStep] = useState<'choice' | 'confirm'>('choice');
  
  // Position action modal state - shows Sell/More options when clicking a position
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionPosition, setActionPosition] = useState<Trade | null>(null);
  
  // Portfolio AI insight state
  const [insightExpanded, setInsightExpanded] = useState(false);
  const [portfolioInsight, setPortfolioInsight] = useState<string | null>(null);
  const [isLoadingInsight, setIsLoadingInsight] = useState(false);
  const [insightFetched, setInsightFetched] = useState(false);
  
  
  const { toast } = useToast();
  const { showErrorWithReport } = useErrorToast();
  const { getAccessToken, authenticated, embeddedWallet } = usePrivySafe();
  const { sendSOLWithFee } = useSolanaTransaction();
  const { usdcBalance, solBalance, refetch: refetchBalance } = useSolanaBalance(embeddedWallet?.address || null);
  const { placeTrade: placePondTrade, sellPosition, getSellQuote, redeemPosition, checkRedemption, isTrading: isPondTrading } = usePondTrading();
  const queryClient = useQueryClient();
  
  // Live price for selected position (for sell modal)
  const selectedMarketLivePrice = useLivePrice(selectedPosition?.marketId);

  const { data: positionsData, isLoading: positionsLoading } = useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      const token = await getAccessToken();
      const res = await fetch('/api/positions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch positions');
      return res.json() as Promise<{ positions: Trade[] }>;
    },
    enabled: authenticated,
  });

  // Paginated history with infinite scroll
  const {
    data: historyData,
    isLoading: historyLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['tradeHistory'],
    queryFn: async ({ pageParam = 0 }) => {
      const token = await getAccessToken();
      const res = await fetch(`/api/trades/history?limit=20&offset=${pageParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch trade history');
      return res.json() as Promise<{ trades: Trade[]; total: number; hasMore: boolean; nextOffset: number | null }>;
    },
    getNextPageParam: (lastPage) => {
      // Use explicit nextOffset from server to avoid infinite loop
      return lastPage.nextOffset ?? undefined;
    },
    initialPageParam: 0,
    enabled: authenticated,
  });

  const activePositions = positionsData?.positions || [];
  const closedTrades = historyData?.pages.flatMap(page => page.trades) || [];
  const totalClosedTrades = historyData?.pages[0]?.total || 0;
  
  // History scroll container ref for infinite scroll
  const historyScrollRef = useRef<HTMLDivElement>(null);
  
  // Handle scroll to load more history
  const handleHistoryScroll = useCallback(() => {
    if (!historyScrollRef.current || isFetchingNextPage || !hasNextPage) return;
    
    const { scrollTop, scrollHeight, clientHeight } = historyScrollRef.current;
    // Load more when user scrolls within 100px of bottom
    if (scrollHeight - scrollTop - clientHeight < 100) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // Navigate to Discovery page with the market ID to show market details
  const handleCardClick = (marketId: string | undefined) => {
    if (!marketId) return;
    navigate(`/discovery?market=${encodeURIComponent(marketId)}`);
  };
  
  // Show action modal when clicking a position (Sell or More options)
  const handlePositionClick = (position: Trade) => {
    setActionPosition(position);
    setActionModalOpen(true);
  };
  
  // Handle "Sell" from action modal - reuses existing sell flow
  const handleActionSell = () => {
    if (actionPosition) {
      // Create a synthetic event and call the existing handler
      const syntheticEvent = { stopPropagation: () => {} } as React.MouseEvent;
      handleCloseClick(syntheticEvent, actionPosition);
    }
    setActionModalOpen(false);
  };
  
  // Handle "More" from action modal - navigates to Discovery
  const handleActionMore = () => {
    if (actionPosition?.marketId) {
      handleCardClick(actionPosition.marketId);
    }
    setActionModalOpen(false);
  };

  // Calculate total portfolio value using live prices when available
  const totalValue = activePositions.reduce((acc, pos) => {
    const shares = parseFloat(pos.shares);
    const livePrice = currentPrices[pos.marketId];
    const price = livePrice !== undefined ? livePrice : parseFloat(pos.price);
    const currentValue = shares * price;
    return acc + currentValue;
  }, 0);

  // Calculate PnL for each position using current prices when available
  const getPositionPnL = (pos: Trade, useLivePrices = false) => {
    const shares = parseFloat(pos.shares);
    const entryPrice = parseFloat(pos.price);
    const costBasis = pos.wagerAmount / 100;
    // Use current price if available, otherwise fall back to entry price
    const currentPrice = useLivePrices && currentPrices[pos.marketId] !== undefined 
      ? currentPrices[pos.marketId] 
      : entryPrice;
    const currentValue = shares * currentPrice;
    return currentValue - costBasis;
  };

  // Get positions filtered by mode (uses live prices for accurate filtering)
  const getPositionsToSell = (mode: BulkSellMode): Trade[] => {
    if (!mode) return [];
    if (mode === 'all') return activePositions;
    // Only include positions where we have live prices for PnL filtering
    const positionsWithPrices = activePositions.filter(pos => currentPrices[pos.marketId] !== undefined);
    if (mode === 'losing') return positionsWithPrices.filter(pos => getPositionPnL(pos, true) < 0);
    if (mode === 'winning') return positionsWithPrices.filter(pos => getPositionPnL(pos, true) >= 0);
    return [];
  };

  const positionsToSell = getPositionsToSell(bulkSellMode);
  
  // Stable position key for dependency tracking - includes market ID and direction
  const positionsKey = activePositions
    .map(p => `${p.marketId}:${p.direction}`)
    .sort()
    .join(',');

  // Fetch current prices for all positions using Kalshi API
  const fetchCurrentPrices = async () => {
    if (activePositions.length === 0) return;
    
    setIsLoadingPrices(true);
    setPriceFetchError(null);
    const prices: Record<string, number> = {};
    let fetchedCount = 0;
    
    try {
      // Fetch prices in parallel for all unique market IDs
      const uniqueMarketIds = Array.from(new Set(activePositions.map(p => p.marketId)));
      
      await Promise.all(uniqueMarketIds.map(async (marketId) => {
        try {
          // Use the market history endpoint which fetches from Kalshi API
          const res = await fetch(`/api/markets/${marketId}/history`);
          if (res.ok) {
            const data = await res.json();
            // Accept lastPrice of 0 as valid (check for undefined/null, not truthiness)
            if (data.marketInfo?.lastPrice !== undefined && data.marketInfo?.lastPrice !== null) {
              // lastPrice is the YES price (already normalized to 0-1), calculate NO price
              const yesPrice = data.marketInfo.lastPrice;
              const noPrice = 1 - yesPrice;
              
              // Find the position to determine which price to use
              const position = activePositions.find(p => p.marketId === marketId);
              if (position) {
                prices[marketId] = position.direction === 'YES' ? yesPrice : noPrice;
                fetchedCount++;
              }
            }
          }
        } catch (err) {
          console.error('[BulkSell] Failed to fetch price for', marketId, err);
        }
      }));
      
      console.log(`[BulkSell] Fetched ${fetchedCount}/${uniqueMarketIds.length} market prices`);
      setCurrentPrices(prices);
      
      // Set blocking error if any prices are missing for PnL filtering
      const missingCount = uniqueMarketIds.length - fetchedCount;
      if (missingCount > 0) {
        setPriceFetchError(`Could not fetch prices for ${missingCount} market${missingCount > 1 ? 's' : ''}. PnL filtering unavailable.`);
      }
    } catch (err) {
      console.error('[BulkSell] Failed to fetch prices:', err);
      setPriceFetchError('Failed to fetch current prices. PnL filtering unavailable.');
    } finally {
      setIsLoadingPrices(false);
    }
  };

  // Fetch live prices on page load and when positions change
  useEffect(() => {
    if (activePositions.length === 0) {
      // Clear stale prices when no positions
      setCurrentPrices({});
      return;
    }
    
    // Skip if already fetching to avoid overlapping requests
    if (isLoadingPrices) return;
    
    // Always fetch fresh prices when positions change
    fetchCurrentPrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionsKey]);

  // Fetch portfolio AI insight
  const fetchPortfolioInsight = async () => {
    if (insightFetched || isLoadingInsight || activePositions.length === 0) return;
    
    setIsLoadingInsight(true);
    
    try {
      // Build positions data with PnL info
      const positionsWithPnL = activePositions.map(pos => {
        const shares = parseFloat(pos.shares);
        const costBasis = pos.wagerAmount / 100;
        const livePrice = currentPrices[pos.marketId];
        const currentPrice = livePrice !== undefined ? livePrice : parseFloat(pos.price);
        const currentValue = shares * currentPrice;
        const pnl = currentValue - costBasis;
        const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
        
        return {
          marketTitle: pos.marketTitle,
          direction: pos.direction,
          shares: shares.toFixed(0),
          pnlPercent,
        };
      });
      
      // Calculate totals
      const totalPnL = positionsWithPnL.reduce((acc, pos) => {
        const original = activePositions.find(p => p.marketTitle === pos.marketTitle);
        if (!original) return acc;
        const costBasis = original.wagerAmount / 100;
        return acc + (costBasis * pos.pnlPercent / 100);
      }, 0);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dailyPnL = activePositions.reduce((acc, pos) => {
        const posDate = new Date(pos.createdAt);
        if (posDate >= today) {
          const shares = parseFloat(pos.shares);
          const costBasis = pos.wagerAmount / 100;
          const livePrice = currentPrices[pos.marketId];
          const currentPrice = livePrice !== undefined ? livePrice : parseFloat(pos.price);
          return acc + (shares * currentPrice - costBasis);
        }
        return acc;
      }, 0);
      
      const response = await fetch('/api/ai/portfolio-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positions: positionsWithPnL,
          totalPnL,
          dailyPnL,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setPortfolioInsight(data.insight);
      } else {
        setPortfolioInsight('Tap again to get portfolio insights!');
      }
    } catch (err) {
      console.error('[PortfolioInsight] Error:', err);
      setPortfolioInsight('Could not load insight right now.');
    } finally {
      setIsLoadingInsight(false);
      setInsightFetched(true);
    }
  };

  const handleInsightTap = () => {
    if (!insightExpanded) {
      setInsightExpanded(true);
      if (!insightFetched) {
        fetchPortfolioInsight();
      }
    } else {
      setInsightExpanded(false);
    }
  };

  // Reset insight when positions change significantly
  useEffect(() => {
    setInsightFetched(false);
    setPortfolioInsight(null);
    setInsightExpanded(false);
  }, [positionsKey]);

  // Bulk sell handler
  const handleBulkSell = async () => {
    if (positionsToSell.length === 0) return;
    
    // Get auth token once at the start
    const authToken = await getAccessToken();
    
    setIsBulkSelling(true);
    setBulkSellProgress({ current: 0, total: positionsToSell.length, successes: 0, failures: 0 });
    
    let successes = 0;
    let failures = 0;
    
    for (let i = 0; i < positionsToSell.length; i++) {
      const position = positionsToSell[i];
      setBulkSellProgress(prev => ({ ...prev, current: i + 1 }));
      
      try {
        const side = position.direction.toLowerCase() as 'yes' | 'no';
        let shares = parseFloat(position.shares);
        const entryPrice = parseFloat(position.price);
        
        // Fetch token data once and reuse
        const redemptionRes = await fetch(`/api/pond/market/${position.marketId}/tokens`);
        let isRedemption = false;
        let tokenMint = '';
        let tokenData: any = null;
        
        if (redemptionRes.ok) {
          tokenData = await redemptionRes.json();
          tokenMint = side === 'yes' ? tokenData.yesMint : tokenData.noMint;
          const redemptionCheck = await checkRedemption(tokenMint);
          isRedemption = redemptionCheck?.isRedeemable || false;
        }
        
        // Try to sell/redeem
        let result: any;
        let actualUsdcReceived: number;
        
        if (isRedemption && tokenMint) {
          result = await redeemPosition(tokenMint, shares);
          // Redemption pays $1 per share for winning positions
          actualUsdcReceived = result.success ? shares : 0;
        } else {
          result = await sellPosition(position.marketId, side, shares, embeddedWallet?.address);
          
          // Handle partial fill
          if (!result.success && result.error?.includes('tokens available')) {
            const match = result.error.match(/have ([\d.]+) tokens/);
            if (match) {
              const availableShares = parseFloat(match[1]);
              if (availableShares > 0) {
                shares = availableShares;
                result = await sellPosition(position.marketId, side, shares, embeddedWallet?.address);
              }
            }
          }
          
          // Use expectedUSDC from API if available, otherwise estimate
          actualUsdcReceived = result.expectedUSDC && result.expectedUSDC > 0 
            ? result.expectedUSDC 
            : shares * entryPrice;
        }
        
        if (result.success) {
          // Close in database with best available payout info
          const costBasis = position.wagerAmount / 100;
          const pnl = actualUsdcReceived - costBasis;
          
          await fetch(`/api/trades/${position.id}/close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ pnl: pnl.toFixed(2), payout: actualUsdcReceived }),
          });
          
          successes++;
        } else {
          console.error('[BulkSell] Failed to sell position:', position.id, result.error);
          failures++;
        }
      } catch (err) {
        console.error('[BulkSell] Error selling position:', position.id, err);
        failures++;
      }
      
      setBulkSellProgress(prev => ({ ...prev, successes, failures }));
      
      // Small delay between transactions to avoid rate limiting
      if (i < positionsToSell.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    setIsBulkSelling(false);
    setBulkSellModalOpen(false);
    setBulkSellMode(null);
    
    toast({
      title: 'Bulk Sell Complete',
      description: `Sold ${successes} positions. ${failures > 0 ? `${failures} failed.` : ''}`,
      variant: failures > 0 ? 'destructive' : 'default'
    });
    
    // Refresh data
    setTimeout(() => {
      refetchBalance();
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['tradeHistory'] });
    }, 2000);
  };

  const openBulkSellModal = async (mode: BulkSellMode) => {
    setBulkSellMode(mode);
    setBulkSellProgress({ current: 0, total: 0, successes: 0, failures: 0 });
    setPriceFetchError(null);
    setBulkSellModalOpen(true);
    
    // Fetch live prices for PnL-based filtering
    if (mode === 'losing' || mode === 'winning') {
      await fetchCurrentPrices();
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const handleAddClick = (e: React.MouseEvent, position: Trade) => {
    e.stopPropagation();
    setSelectedPosition(position);
    setAddAmount('5');
    setAddModalOpen(true);
  };

  const handleCloseClick = async (e: React.MouseEvent, position: Trade) => {
    e.stopPropagation();
    setSelectedPosition(position);
    setSellQuote(null);
    setSellModeStep('choice'); // Reset to choice screen
    setCloseModalOpen(true);
    
    // Fetch sell quote for accurate pricing
    if (embeddedWallet?.address) {
      setIsLoadingSellQuote(true);
      try {
        const side = position.direction.toLowerCase() as 'yes' | 'no';
        // Use floored shares for quote - Kalshi only accepts whole contracts
        const shares = Math.floor(parseFloat(position.shares));
        if (shares < 1) {
          setSellQuote({ expectedUSDC: 0, priceImpactPct: 0, pricePerShare: 0, warning: null, error: 'Less than 1 whole share - cannot sell fractional shares' });
          return;
        }
        const quote = await getSellQuote(position.marketId, side, shares, embeddedWallet.address);
        setSellQuote(quote);
      } catch (err) {
        console.error('[Activity] Failed to get sell quote:', err);
      } finally {
        setIsLoadingSellQuote(false);
      }
    }
  };

  const handleAddPosition = async () => {
    if (!selectedPosition) return;
    
    const amount = parseFloat(addAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Invalid Amount', description: 'Please enter a valid amount', variant: 'destructive' });
      return;
    }

    // Calculate whole shares and actual spend using positions channel
    const currentPrice = parseFloat(selectedPosition.price);
    const feeBreakdown = calculateTradeFeesForBuy(amount, currentPrice, 'positions');
    const shares = feeBreakdown.netShares;
    const actualSpend = feeBreakdown.actualSpend;
    
    // Check if wager is too small for even 1 whole share
    if (shares < 1) {
      toast({ 
        title: 'Bet Too Small', 
        description: `At ${(currentPrice * 100).toFixed(0)}¢ per share, you need more to buy 1 share. Increase your bet amount.`,
        variant: 'destructive'
      });
      return;
    }

    // Check USDC balance (use actualSpend, not raw amount)
    if (usdcBalance !== undefined && usdcBalance < actualSpend) {
      toast({ title: 'Insufficient Balance', description: `You have $${usdcBalance.toFixed(2)} but need $${actualSpend.toFixed(2)}`, variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    try {
      // Execute on-chain trade via Pond/DFlow
      const side = selectedPosition.direction.toLowerCase() as 'yes' | 'no';
      console.log('[Activity] Starting add to position trade:', selectedPosition.marketId, side, actualSpend);
      
      // Use unified platform fee: 0.045 × p × (1-p) × contracts
      // Use actualSpend (adjusted for whole shares) instead of raw amount
      const result = await placePondTrade(
        selectedPosition.marketId, 
        side, 
        actualSpend, 
        usdcBalance,
        embeddedWallet?.address,
        'positions',
        solBalance
      );
      
      console.log('[Activity] Trade result:', result);
      
      if (!result.success) {
        const errorMsg = result.error || 'Trade failed';
        console.error('[Activity] Trade error:', errorMsg);
        
        // Provide user-friendly error message for common DFlow errors
        if (errorMsg.startsWith('INSUFFICIENT_GAS:')) {
          toast({ title: 'Need More SOL for Gas', description: 'You need at least 0.003 SOL for transaction fees. Deposit more SOL from your profile page.', variant: 'destructive' });
        } else if (errorMsg.startsWith('BALANCE_LOADING:')) {
          toast({ title: 'Loading...', description: 'Please wait for your wallet balance to load, then try again.', variant: 'destructive' });
        } else if (errorMsg.includes('zero_out_amount') || errorMsg.includes('Zero out amount')) {
          toast({ title: 'Trade Failed', description: 'Trade amount too small. Please increase your bet to at least $0.50', variant: 'destructive' });
        } else {
          toast({ title: 'Trade Failed', description: errorMsg, variant: 'destructive' });
        }
        setAddModalOpen(false);
        setIsProcessing(false);
        return;
      }
      
      // Record the trade in the database with actual shares from async trade polling
      const token = await getAccessToken();
      
      console.log('[Activity] Recording trade with actualShares:', result.actualShares || shares, 'executionMode:', result.executionMode);
      
      const recordRes = await fetch('/api/trades', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          marketId: selectedPosition.marketId,
          marketTitle: selectedPosition.marketTitle,
          marketCategory: selectedPosition.marketCategory,
          direction: selectedPosition.direction,
          wagerAmount: actualSpend, // Use adjusted spend
          price: currentPrice,
          actualShares: result.actualShares || shares, // Use whole shares
          signature: result.signature,
          executionMode: result.executionMode,
        }),
      });
      
      if (!recordRes.ok) {
        console.error('[Activity] Failed to record trade in database');
      }
      
      // SUCCESS - Close modal and show success IMMEDIATELY
      setAddModalOpen(false);
      setIsProcessing(false);
      
      // Use whole shares from fee breakdown
      const confirmedShares = result.actualShares || shares;
      const direction = selectedPosition.direction;
      const isAsync = result.executionMode === 'async';
      
      // Show prominent success toast with actual shares info
      toast({ 
        title: `Trade Executed: ${confirmedShares} ${direction} shares @ ${Math.round(currentPrice * 100)}¢`,
        description: `Spent: $${actualSpend.toFixed(2)}${isAsync ? ' (processing...)' : ''}`,
        className: direction === 'YES' ? 'bg-zinc-950/90 border-[#1ED78B]/20 text-white' : 'bg-zinc-950/90 border-rose-500/20 text-white'
      });
      
      // Refresh balance and positions in background
      setTimeout(() => {
        refetchBalance();
        queryClient.invalidateQueries({ queryKey: ['positions'] });
        queryClient.invalidateQueries({ queryKey: ['tradeHistory'] });
      }, 2000);
      
    } catch (error: any) {
      console.error('[Activity] Catch block error:', error);
      showErrorWithReport('Error', error.message || 'Failed to add to position', 'Add Position');
      setIsProcessing(false);
    }
  };

  const handleClosePosition = async (overrideShares?: number, outcomeMint?: string) => {
    if (!selectedPosition) return;
    
    setIsProcessing(true);
    try {
      const rawShares = overrideShares || parseFloat(selectedPosition.shares);
      const costBasis = selectedPosition.wagerAmount / 100; // Convert cents to dollars
      const side = selectedPosition.direction.toLowerCase() as 'yes' | 'no';
      
      console.log('[Activity] Starting close position:', selectedPosition.marketId, side, 'rawShares:', rawShares);
      
      // First, get the outcome mint for this position to check redemption
      let positionOutcomeMint = outcomeMint;
      if (!positionOutcomeMint) {
        const token = await getAccessToken();
        const tokenRes = await fetch(`/api/pond/market/${selectedPosition.marketId}/tokens`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          positionOutcomeMint = side === 'yes' ? tokenData.yesMint : tokenData.noMint;
        }
      }
      
      // Check if this is a settled market that can be redeemed
      let isRedemption = false;
      if (positionOutcomeMint) {
        const redemptionStatus = await checkRedemption(positionOutcomeMint);
        console.log('[Activity] Redemption status:', redemptionStatus);
        
        if (redemptionStatus.isRedeemable) {
          isRedemption = true;
          console.log('[Activity] Market is settled - using redemption flow');
        }
      }
      
      // Determine shares to use
      // Redemption at settlement: try full amount (tokens redeem for $1 each, may accept fractional)
      // Pre-settlement selling: Kalshi requires whole contracts only
      let shares: number;
      
      if (isRedemption) {
        // Redemption: try full amount first, will fail gracefully if fractional not supported
        shares = rawShares;
      } else {
        // Selling: round to nearest whole number first (to handle floating point precision issues)
        // If the value is very close to a whole number (e.g., 3.9999 or 4.0001), treat it as that whole number
        const roundedShares = Math.round(rawShares);
        shares = Math.abs(rawShares - roundedShares) < 0.01 ? roundedShares : Math.floor(rawShares);
        
        if (shares < 1) {
          toast({ 
            title: 'Cannot Sell Fractional Shares', 
            description: `You have ${rawShares.toFixed(2)} shares but only whole contracts can be sold. Wait for market settlement to redeem.`,
            variant: 'destructive'
          });
          setCloseModalOpen(false);
          setIsProcessing(false);
          return;
        }
      }
      
      let result;
      if (isRedemption && positionOutcomeMint) {
        // Use redemption for settled markets
        result = await redeemPosition(
          positionOutcomeMint,
          shares,
          embeddedWallet?.address
        );
        console.log('[Activity] Redemption result:', result);
      } else {
        // Use regular sell for active markets
        result = await sellPosition(
          selectedPosition.marketId,
          side,
          shares,
          embeddedWallet?.address
        );
        console.log('[Activity] Sell result:', result);
      }
      
      if (!result.success) {
        const errorMsg = result.error || 'Close failed';
        console.error('[Activity] Close error:', errorMsg);
        
        // Check if this is a partial fill situation where we can sell available tokens
        if (errorMsg.includes('only have') && errorMsg.includes('tokens available')) {
          const match = errorMsg.match(/only have ([\d.]+) tokens/);
          if (match) {
            const availableTokens = parseFloat(match[1]);
            
            // Update the trade record with actual on-chain balance
            try {
              const token = await getAccessToken();
              console.log('[Activity] Detected partial fill - updating trade record. Recorded:', shares, 'Actual:', availableTokens);
              await fetch(`/api/trades/${selectedPosition.id}/shares`, {
                method: 'PATCH',
                headers: { 
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ actualShares: availableTokens }),
              });
              console.log('[Activity] Trade record updated with actual shares');
            } catch (updateError) {
              console.error('[Activity] Failed to update trade record:', updateError);
            }
            
            setIsProcessing(false);
            return handleClosePosition(availableTokens, positionOutcomeMint);
          }
        }
        
        showErrorWithReport(isRedemption ? 'Redeem Failed' : 'Sell Failed', errorMsg, 'Sell Position');
        setCloseModalOpen(false);
        setIsProcessing(false);
        return;
      }
      
      // Calculate shares and proportional cost basis
      const recordedShares = parseFloat(selectedPosition.shares);
      const remainingShares = recordedShares - shares;
      const hasRemainingFractional = remainingShares > 0.01;
      
      // For async orders, expectedUSDC is 0 - we don't know actual proceeds
      const usdcReceived = result.expectedUSDC || 0;
      const isAsync = result.executionMode === 'async' || usdcReceived === 0;
      
      // Calculate P&L using proportional cost basis (for partial sells)
      const proportionSold = shares / recordedShares;
      const proportionalCostBasis = costBasis * proportionSold;
      
      console.log('[Activity] Position sold! Shares:', shares, 'of', recordedShares, 'executionMode:', result.executionMode, 'expectedUSDC:', usdcReceived, 'Remaining:', remainingShares);
      
      // Update the database
      const token = await getAccessToken();
      
      if (hasRemainingFractional) {
        // Partial sell - update position with remaining shares instead of closing
        // Backend recalculates wagerAmount proportionally based on actualShares
        const res = await fetch(`/api/trades/${selectedPosition.id}/shares`, {
          method: 'PATCH',
          headers: { 
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}` 
          },
          body: JSON.stringify({ actualShares: remainingShares }),
        });
        
        if (!res.ok) {
          console.error('[Activity] Failed to update position with remaining shares');
        } else {
          console.log('[Activity] Position updated with remaining fractional shares:', remainingShares);
        }
      } else {
        // Full close - no remaining shares
        // For async orders, we don't know actual pnl/payout yet
        const pnl = isAsync ? 0 : (usdcReceived - proportionalCostBasis);
        const res = await fetch(`/api/trades/${selectedPosition.id}/close`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}` 
          },
          body: JSON.stringify({
            pnl: pnl.toFixed(2),
            payout: usdcReceived,
          }),
        });

        if (!res.ok) {
          console.error('[Activity] Failed to update database after close');
        }
      }

      // SUCCESS - Close modal and show success
      setCloseModalOpen(false);
      setIsProcessing(false);
      
      // Format message based on whether it was a redemption or sale
      const action = isRedemption ? 'Redeemed' : 'Sold';
      const direction = selectedPosition.direction;
      
      // For async trades, we can't show accurate amounts - just confirm the trade went through
      let title: string;
      let description: string;
      
      if (isAsync) {
        // Async trade - don't show dollar amounts we can't confirm
        title = `${shares} ${direction} Shares Sold`;
        description = 'Processing... Check your balance in a few seconds.';
        if (hasRemainingFractional) {
          description += ` | ${remainingShares.toFixed(2)} fractional shares remain`;
        }
      } else {
        // Sync trade - we have actual amounts
        const pnl = usdcReceived - proportionalCostBasis;
        const pnlSign = pnl >= 0 ? '+' : '';
        const pnlPercent = proportionalCostBasis > 0 ? ((pnl / proportionalCostBasis) * 100) : 0;
        title = `Position ${action}: $${usdcReceived.toFixed(2)}`;
        description = `${shares} shares | P&L: ${pnlSign}$${pnl.toFixed(2)} (${pnlSign}${pnlPercent.toFixed(0)}%)`;
        if (hasRemainingFractional) {
          description += ` | ${remainingShares.toFixed(2)} fractional shares remain`;
        }
      }
      
      toast({ 
        title,
        description,
        className: direction === 'YES' ? 'bg-zinc-950/90 border-[#1ED78B]/20 text-white' : 'bg-zinc-950/90 border-rose-500/20 text-white'
      });
      
      // Refresh balance and positions in background
      setTimeout(() => {
        refetchBalance();
        queryClient.invalidateQueries({ queryKey: ['positions'] });
        queryClient.invalidateQueries({ queryKey: ['tradeHistory'] });
      }, 2000);
      
    } catch (error: any) {
      console.error('[Activity] Close position error:', error);
      showErrorWithReport('Error', error.message || 'Failed to close position', 'Close Position');
      setIsProcessing(false);
    }
  };

  if (!authenticated) {
    return (
      <Layout>
        <div className="min-h-screen bg-background px-6 pb-24 pt-28 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <p>Sign in to view your activity</p>
          </div>
        </div>
      </Layout>
    );
  }

  const isLoading = positionsLoading;

  return (
    <Layout>
      <SpreadExplainerSheet
        open={showSpreadExplainer}
        onClose={() => setShowSpreadExplainer(false)}
      />
      
      {/* Position Action Modal - Sell or More options */}
      <Dialog open={actionModalOpen} onOpenChange={setActionModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-center">
              {actionPosition?.marketTitle}
            </DialogTitle>
            <DialogDescription className="text-center">
              <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                actionPosition?.direction === 'YES' 
                  ? 'bg-[#1ED78B]/20 text-[#1ED78B]' 
                  : 'bg-rose-500/20 text-rose-400'
              }`}>
                {actionPosition?.direction}: {actionPosition?.shares} shares
              </span>
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col gap-3 mt-4">
            <Button
              data-testid="button-action-sell"
              onClick={handleActionSell}
              className="w-full py-6 text-lg font-semibold rounded-xl bg-rose-500 hover:bg-rose-600 text-white"
            >
              Sell
            </Button>
            <Button
              data-testid="button-action-more"
              onClick={handleActionMore}
              variant="outline"
              className="w-full py-6 text-lg font-semibold rounded-xl border-white/20 hover:bg-white/10"
            >
              More Details
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>Add to Position</DialogTitle>
            <DialogDescription>
              Add more to your {selectedPosition?.direction} position on "{selectedPosition?.marketTitle}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Amount ($)</label>
              <Input
                type="number"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                placeholder="5"
                min="0.50"
                step="0.10"
                className="bg-zinc-800 border-zinc-700"
                data-testid="input-add-amount"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setAddModalOpen(false)}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-[#1ED78B] hover:bg-[#19B878]"
                onClick={handleAddPosition}
                disabled={isProcessing}
                data-testid="button-confirm-add"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Add ${addAmount}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={closeModalOpen} onOpenChange={(open) => {
        if (!open) setSellModeStep('choice');
        setCloseModalOpen(open);
      }}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          {sellModeStep === 'choice' ? (
            <>
              <DialogHeader>
                <DialogTitle>How would you like to sell?</DialogTitle>
                <DialogDescription>
                  Choose how to sell your {selectedPosition?.direction} position
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 pt-4">
                {/* Sell Now Option */}
                <button
                  onClick={() => setSellModeStep('confirm')}
                  className="w-full text-left bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-600 rounded-xl p-4 transition-all group"
                  data-testid="button-sell-now-option"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0">
                      <TrendingDown size={20} className="text-rose-400" />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-white group-hover:text-rose-400 transition-colors">
                        Sell Now
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Instant sale at current market price. Get your money immediately but at the current bid price.
                      </p>
                    </div>
                    <ChevronRight size={20} className="text-muted-foreground group-hover:text-white transition-colors mt-2" />
                  </div>
                </button>
                
                {/* Sell Later Option */}
                <div
                  className="w-full text-left bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4 opacity-70"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                      <Clock size={20} className="text-amber-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">Sell Later</span>
                        <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-medium">Coming Soon</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Set your own price and wait for a buyer. You could get a better price because you're patient - 
                        usually there's a few cents difference between buy and sell prices in the orderbook.
                      </p>
                      <div className="mt-2 text-xs text-[#1ED78B]/80 flex items-center gap-1">
                        <TrendingUp size={12} />
                        <span>Lower fees + potentially better price</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <Button
                  variant="outline"
                  className="w-full mt-2"
                  onClick={() => setCloseModalOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <button 
                onClick={() => setSellModeStep('choice')} 
                className="p-1 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <ChevronRight size={18} className="rotate-180 text-muted-foreground" />
              </button>
              Sell Now
            </DialogTitle>
            <DialogDescription>
              Sell your {selectedPosition?.direction} position on "{selectedPosition?.marketTitle}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {selectedPosition && (() => {
              const totalShares = parseFloat(selectedPosition.shares);
              const wholeShares = Math.floor(totalShares);
              const fractionalShares = totalShares - wholeShares;
              const hasFractional = fractionalShares > 0.01;
              const isYes = selectedPosition.direction.toUpperCase() === 'YES';
              const costBasis = selectedPosition.wagerAmount / 100;
              const storedEntryFee = parseFloat(selectedPosition.entryFee || '0');
              // Use swipe flat fee ($0.05) if no entry fee stored, or stored fee is suspiciously small
              const platformFee = storedEntryFee >= 0.01 ? storedEntryFee : 0.05;
              // Calculate raw market price using TOTAL shares (not floored) to match stored cost basis
              const rawMarketPrice = calculateRawMarketPrice(costBasis, platformFee, totalShares);
              // Keep entryPrice for compatibility (cost per share including fees)
              const entryPrice = parseFloat(selectedPosition.price);
              
              // Get current prices - prefer quote pricePerShare, then orderbook, then live data
              const ob = sellQuote?.orderbook;
              const quoteSellPrice = sellQuote?.pricePerShare ?? null;
              const orderbookSellPrice = ob ? (isYes ? ob.yesBid : ob.noBid) : null;
              const liveSellPrice = selectedMarketLivePrice ? (isYes ? selectedMarketLivePrice.yesBid : selectedMarketLivePrice.noBid) : null;
              const sellPrice = quoteSellPrice ?? orderbookSellPrice ?? liveSellPrice ?? null;
              const buyPrice = ob ? (isYes ? ob.yesAsk : ob.noAsk) : (selectedMarketLivePrice ? (isYes ? selectedMarketLivePrice.yesAsk : selectedMarketLivePrice.noAsk) : null);
              const hasPrices = sellPrice !== null && sellPrice > 0;
              
              // Fee and proceeds calculation - use quote values when available
              const fb = sellQuote?.feeBreakdown;
              const hasQuote = sellQuote && sellQuote.expectedUSDC !== undefined;
              const grossValue = fb?.grossValue ?? (hasPrices ? wholeShares * sellPrice : 0);
              const totalFees = fb?.totalFees ?? 0;
              // Use nullish coalescing so 0 is preserved (async fills)
              const netAmount = hasQuote && sellQuote.expectedUSDC > 0 
                ? sellQuote.expectedUSDC 
                : (grossValue - totalFees);
              const pnlFromSale = netAmount - costBasis;
              const isAsyncFill = hasQuote && sellQuote.expectedUSDC === 0;
              
              return (
              <>
                {/* SECTION 1: Current Prices Block - Make sell price obvious */}
                <div className="bg-zinc-800/80 rounded-xl p-4 border border-zinc-700">
                  <div className="text-xs text-muted-foreground mb-2 font-medium">Current {isYes ? 'YES' : 'NO'} Prices</div>
                  
                  {isLoadingSellQuote ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Loading prices...</span>
                    </div>
                  ) : hasPrices ? (
                    <div className="space-y-2">
                      {/* Sell Price - BIG and prominent */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Sell price (you receive)</span>
                        <span className="text-2xl font-bold text-[#1ED78B]">{(sellPrice * 100).toFixed(0)}¢</span>
                      </div>
                      {/* Spread explainer */}
                      {sellPrice < entryPrice && (
                        <button 
                          onClick={() => setShowSpreadExplainer(true)}
                          className="flex items-center gap-2 w-full text-xs bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 text-amber-300 px-3 py-2 rounded-lg transition-all mt-3"
                        >
                          <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                            <Info size={12} className="text-amber-400" />
                          </div>
                          <span>Why is the sell price lower than my entry?</span>
                          <ChevronRight size={14} className="ml-auto text-amber-400/60" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-amber-400">Price unavailable</div>
                  )}
                </div>
                
                {/* SECTION 2: Position Details (demoted entry price) */}
                <div className="bg-zinc-800/50 rounded-lg p-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Shares to sell</span>
                    <span className="font-medium">{wholeShares}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">You bought at</span>
                    <span>{(rawMarketPrice * 100).toFixed(0)}¢</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Cost basis</span>
                    <span>${costBasis.toFixed(2)}</span>
                  </div>
                  {hasPrices && sellPrice < entryPrice && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Price change</span>
                      <span className="text-red-400">-{((entryPrice - sellPrice) * 100).toFixed(0)}¢</span>
                    </div>
                  )}
                  {hasFractional && (
                    <div className="text-xs text-amber-400 mt-1">
                      {fractionalShares.toFixed(2)} fractional shares can't be sold
                    </div>
                  )}
                </div>
                
                {/* SECTION 3: Proceeds Breakdown - clear math */}
                <div className="bg-zinc-800 rounded-lg p-4 space-y-2">
                  <div className="text-xs text-muted-foreground font-medium mb-2">
                    {isAsyncFill ? 'Estimated proceeds' : 'What you\'ll receive'}
                  </div>
                  
                  {hasPrices ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{wholeShares} shares × {(sellPrice * 100).toFixed(0)}¢</span>
                        <span>${grossValue.toFixed(2)}</span>
                      </div>
                      {totalFees > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Trading fees</span>
                          <span className="text-amber-400">-${totalFees.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="border-t border-zinc-600 pt-2 mt-2 flex justify-between">
                        <span className="font-bold">{isAsyncFill ? 'Est. proceeds' : 'You\'ll receive'}</span>
                        <span className="text-xl font-bold text-[#1ED78B]">${netAmount.toFixed(2)}</span>
                      </div>
                      {!isAsyncFill && (
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Your P&L</span>
                          <span className={pnlFromSale >= 0 ? 'text-[#1ED78B]' : 'text-red-400'}>
                            {pnlFromSale >= 0 ? '+' : ''}${pnlFromSale.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {sellQuote?.priceImpactPct && sellQuote.priceImpactPct > 1 && (
                        <div className="text-xs text-amber-400 mt-1">
                          Note: {sellQuote.priceImpactPct.toFixed(1)}% price impact due to trade size
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm text-amber-400">
                      Unable to calculate. Try again in a moment.
                    </div>
                  )}
                </div>
                
                {/* Async fill / market conditions notice */}
                <div className="text-xs text-muted-foreground text-center">
                  {isAsyncFill 
                    ? 'Final amount updates after fill completes'
                    : 'Final amount may vary slightly based on market conditions'}
                </div>
              </>
            );})()}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setCloseModalOpen(false)}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-rose-500 hover:bg-rose-600"
                onClick={() => handleClosePosition()}
                disabled={isProcessing}
                data-testid="button-confirm-sell"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Sell Position
              </Button>
            </div>
          </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Sell Modal */}
      <Dialog open={bulkSellModalOpen} onOpenChange={(open) => { if (!isBulkSelling) { setBulkSellModalOpen(open); if (!open) setBulkSellMode(null); } }}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>
              {bulkSellMode === 'all' && 'Sell All Positions'}
              {bulkSellMode === 'losing' && 'Sell Losing Positions'}
              {bulkSellMode === 'winning' && 'Sell Winning Positions'}
            </DialogTitle>
            <DialogDescription>
              {isBulkSelling 
                ? `Selling positions... ${bulkSellProgress.current} of ${bulkSellProgress.total}`
                : isLoadingPrices
                  ? 'Loading current prices...'
                  : `This will sell ${positionsToSell.length} position${positionsToSell.length !== 1 ? 's' : ''}.`
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {isLoadingPrices ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : isBulkSelling ? (
              <div className="space-y-3">
                {/* Progress bar showing sold (green) and failed (red) as portions of total */}
                <div className="h-2 w-full bg-zinc-700 rounded-full overflow-hidden flex">
                  <div 
                    className="h-full bg-[#1ED78B] transition-all duration-300"
                    style={{ width: `${(bulkSellProgress.successes / bulkSellProgress.total) * 100}%` }}
                  />
                  <div 
                    className="h-full bg-rose-500 transition-all duration-300"
                    style={{ width: `${(bulkSellProgress.failures / bulkSellProgress.total) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#1ED78B]">{bulkSellProgress.successes} sold</span>
                  <span className="text-rose-500">{bulkSellProgress.failures} failed</span>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-zinc-800 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Positions to Sell</span>
                    <span>{positionsToSell.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Est. Total Value</span>
                    <span>${positionsToSell.reduce((acc, pos) => {
                      const shares = parseFloat(pos.shares);
                      const price = currentPrices[pos.marketId] ?? parseFloat(pos.price);
                      return acc + shares * price;
                    }, 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Cost Basis</span>
                    <span>${positionsToSell.reduce((acc, pos) => acc + pos.wagerAmount / 100, 0).toFixed(2)}</span>
                  </div>
                </div>
                {priceFetchError && (bulkSellMode === 'losing' || bulkSellMode === 'winning') ? (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                    <p className="text-xs text-amber-400">
                      {priceFetchError}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {(bulkSellMode === 'losing' || bulkSellMode === 'winning') 
                      ? 'Positions filtered using current market prices. Actual amounts may vary.'
                      : 'Positions will be sold one by one. Actual amounts may vary due to market conditions.'
                    }
                  </p>
                )}
              </>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setBulkSellModalOpen(false); setBulkSellMode(null); }}
                disabled={isBulkSelling}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-rose-500 hover:bg-rose-600"
                onClick={handleBulkSell}
                disabled={isBulkSelling || isLoadingPrices || positionsToSell.length === 0 || !!(priceFetchError && (bulkSellMode === 'losing' || bulkSellMode === 'winning'))}
                data-testid="button-confirm-bulk-sell"
              >
                {isBulkSelling ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {isBulkSelling ? 'Selling...' : positionsToSell.length === 0 ? 'No Positions Found' : `Sell ${positionsToSell.length} Positions`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="min-h-screen bg-background px-6 pb-24 pt-28 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-display font-bold">Activity</h1>
          <div className="text-right">
             <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Portfolio Value</div>
             <div className="text-xl font-mono font-bold text-[#1ED78B]">${totalValue.toFixed(2)}</div>
          </div>
        </div>

        {/* Cost vs Resolution Chart Section */}
        {(() => {
          // Calculate total cost (what user spent) and total resolution value (what they'll get if they win)
          const totalCost = activePositions.reduce((acc, position) => {
            return acc + (position.wagerAmount / 100);
          }, 0);
          
          const totalResolutionValue = activePositions.reduce((acc, position) => {
            return acc + parseFloat(position.shares);
          }, 0);
          
          const potentialProfit = totalResolutionValue - totalCost;
          
          // Generate 7-day chart data showing cost vs resolution value
          const chartData = Array.from({ length: 7 }, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - i));
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            
            // Calculate cumulative cost and resolution value up to this day
            let dayCost = 0;
            let dayResolution = 0;
            activePositions.forEach(position => {
              const positionDate = new Date(position.createdAt);
              positionDate.setHours(0, 0, 0, 0);
              const currentDay = new Date(date);
              currentDay.setHours(0, 0, 0, 0);
              
              if (positionDate <= currentDay) {
                dayCost += position.wagerAmount / 100;
                dayResolution += parseFloat(position.shares);
              }
            });
            
            return {
              name: dayNames[date.getDay()],
              cost: dayCost,
              resolution: dayResolution,
            };
          });
          
          const hasPositions = activePositions.length > 0;
          
          return (
            <div className="mb-6 glass-panel rounded-2xl p-4">
              {/* Stats Row - Show Cost vs Resolution */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Cost</div>
                  <div className="text-xl font-mono font-bold text-white/70">
                    ${hasPositions ? totalCost.toFixed(2) : '0.00'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">If Resolved</div>
                  <div className="text-2xl font-mono font-bold text-[#1ED78B]">
                    ${hasPositions ? totalResolutionValue.toFixed(2) : '0.00'}
                  </div>
                  {hasPositions && potentialProfit > 0 && (
                    <div className="text-xs text-[#1ED78B]/80 font-medium">
                      +${potentialProfit.toFixed(2)} profit
                    </div>
                  )}
                </div>
              </div>
              
              {/* 7-Day Chart - Two Lines */}
              <div className="h-32">
                {hasPositions ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <defs>
                        <linearGradient id="resolutionGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1ED78B" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#1ED78B" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#71717a" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#71717a" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#71717a', fontSize: 10 }}
                      />
                      <YAxis hide domain={[0, 'dataMax']} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#18181b', 
                          border: '1px solid #3f3f46',
                          borderRadius: '8px',
                          fontSize: '12px'
                        }}
                        formatter={(value: number, name: string) => [
                          `$${value.toFixed(2)}`, 
                          name === 'resolution' ? 'If Resolved' : 'Cost'
                        ]}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="resolution" 
                        stroke="#1ED78B" 
                        strokeWidth={2}
                        fill="url(#resolutionGradient)" 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="cost" 
                        stroke="#71717a" 
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                        fill="url(#costGradient)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                    Place some bets to see your portfolio
                  </div>
                )}
              </div>
              
              {/* Legend */}
              <div className="flex justify-center gap-4 mt-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-[#1ED78B] rounded-full"></div>
                  <span className="text-[10px] text-muted-foreground">Resolution Value</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-zinc-500 rounded-full" style={{ borderStyle: 'dashed' }}></div>
                  <span className="text-[10px] text-muted-foreground">Cost</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Portfolio AI Insight Card */}
        {activePositions.length > 0 && (
          <motion.div 
            className="mb-6"
            initial={false}
          >
            <button
              onClick={handleInsightTap}
              className={`w-full glass-panel rounded-2xl p-4 transition-all ${
                insightExpanded ? 'ring-1 ring-[#1ED78B]/30' : ''
              }`}
              data-testid="button-portfolio-insight"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#1ED78B]/50 bg-black shrink-0">
                  <img
                    src={mascotImage}
                    alt="AI Assistant"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">AI Portfolio Review</span>
                    {!insightFetched && !insightExpanded && (
                      <span className="flex items-center gap-1 text-[10px] bg-[#1ED78B]/20 text-[#1ED78B] px-2 py-0.5 rounded-full">
                        <Sparkles size={10} />
                        Tap for insights
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {insightExpanded ? 'Tap to minimize' : 'Get AI-powered analysis of your positions'}
                  </p>
                </div>
                <ChevronDown 
                  size={18} 
                  className={`text-muted-foreground transition-transform ${insightExpanded ? 'rotate-180' : ''}`}
                />
              </div>
              
              <AnimatePresence>
                {insightExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-4 mt-4 border-t border-white/10">
                      {isLoadingInsight ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 size={14} className="animate-spin" />
                          <span>Analyzing your portfolio...</span>
                        </div>
                      ) : (
                        <p className="text-sm text-white/90 leading-relaxed text-left">
                          {portfolioInsight || 'Tap to get insights about your positions'}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </motion.div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
             {/* Active Positions */}
             <div className="mb-8">
               <div className="flex items-center justify-between mb-4">
                 <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Positions</h2>
                 {activePositions.length > 0 && (
                   <div className="flex gap-2">
                     <Button
                       variant="outline"
                       size="sm"
                       className="h-7 text-xs px-2 border-zinc-700 hover:bg-zinc-800"
                       onClick={() => openBulkSellModal('all')}
                       data-testid="button-sell-all"
                     >
                       Sell All
                     </Button>
                     <Button
                       variant="outline"
                       size="sm"
                       className="h-7 text-xs px-2 border-rose-500/50 text-rose-400 hover:bg-rose-500/10"
                       onClick={() => openBulkSellModal('losing')}
                       data-testid="button-sell-losing"
                     >
                       Sell -PnL
                     </Button>
                     <Button
                       variant="outline"
                       size="sm"
                       className="h-7 text-xs px-2 border-[#1ED78B]/50 text-[#1ED78B] hover:bg-[#1ED78B]/10"
                       onClick={() => openBulkSellModal('winning')}
                       data-testid="button-sell-winning"
                     >
                       Sell +PnL
                     </Button>
                   </div>
                 )}
               </div>
               
               {activePositions.length === 0 ? (
                 <div className="text-center py-8 text-muted-foreground text-sm">
                   No active positions. Swipe on markets to place bets!
                 </div>
               ) : (
                 <div className="space-y-3">
                   {activePositions.map((position) => {
                     const isYes = position.direction === 'YES';
                     const shares = parseFloat(position.shares);
                     const storedPrice = parseFloat(position.price); // This is the entry price (cost/shares)
                     const estimatedPayout = parseFloat(position.estimatedPayout);
                     const costBasis = position.wagerAmount / 100; // Convert cents to dollars
                     // Use LIVE market price for current value, fall back to entry price if not available
                     const livePrice = currentPrices[position.marketId];
                     const hasLivePrice = livePrice !== undefined;
                     const currentPrice = hasLivePrice ? livePrice : storedPrice;
                     const currentValue = shares * currentPrice;
                     const pnl = currentValue - costBasis;
                     const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
                     const entryPrice = storedPrice; // Entry price is stored in DB
                     
                     return (
                       <Card 
                          key={position.id} 
                          className="glass-panel border-0 transition-all duration-200 cursor-pointer overflow-hidden hover:bg-white/5 relative"
                          onClick={() => handlePositionClick(position)}
                          data-testid={`card-position-${position.id}`}
                       >
                         <CardContent className="p-0">
                           <div className="p-4 pr-10 flex items-center gap-4">
                             <div className={`w-12 h-12 rounded-xl bg-[#1ED78B]/10 text-[#1ED78B] flex items-center justify-center`}>
                                <TrendingUp size={24} />
                             </div>
                             <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-sm leading-tight">{position.marketTitle}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="secondary" className={`${isYes ? 'bg-[#1ED78B]/20 text-[#1ED78B]' : 'bg-rose-500/20 text-rose-500'} hover:bg-opacity-20 text-[10px] h-5 max-w-[140px] truncate shrink-0`}>
                                    {position.direction}{position.optionLabel ? `: ${position.optionLabel}` : ''}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">{shares.toFixed(0)} shares</span>
                                  <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">• {formatDate(position.createdAt)}</span>
                                </div>
                                {/* Minimal cost/value info */}
                                <div className="flex items-center gap-3 mt-1.5 text-[10px]">
                                  <span className="text-muted-foreground">Cost: <span className="text-white font-medium">${costBasis.toFixed(2)}</span></span>
                                  <span className="text-muted-foreground">Now: <span className="text-white/70 font-medium">${currentValue.toFixed(2)}</span></span>
                                </div>
                             </div>
                             <div className="text-right shrink-0">
                                {/* Show potential resolution payout (always green/positive) */}
                                <div className="font-mono font-bold text-[#1ED78B]">
                                  ${shares.toFixed(2)}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  if resolved
                                </div>
                             </div>
                           </div>

                           {/* Navigate indicator */}
                           <div className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/40">
                             <ExternalLink size={16} />
                           </div>
                         </CardContent>
                       </Card>
                     );
                   })}
                 </div>
               )}
             </div>

             {/* History */}
             <div className="flex flex-col">
               <div className="flex items-center justify-between mb-4">
                 <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">History</h2>
                 {totalClosedTrades > 0 && (
                   <span className="text-xs text-muted-foreground">{closedTrades.length} of {totalClosedTrades}</span>
                 )}
               </div>
               
               {historyLoading ? (
                 <div className="flex items-center justify-center py-8">
                   <Loader2 className="w-6 h-6 animate-spin text-primary" />
                 </div>
               ) : closedTrades.length === 0 ? (
                 <div className="text-center py-8 text-muted-foreground text-sm">
                   No trade history yet
                 </div>
               ) : (
                 <div 
                   ref={historyScrollRef}
                   onScroll={handleHistoryScroll}
                   className="overflow-y-auto overscroll-contain touch-pan-y pr-2 space-y-4 pb-24"
                   style={{ 
                     height: 'calc(100vh - 450px)', 
                     minHeight: '250px',
                     maxHeight: '500px',
                     WebkitOverflowScrolling: 'touch' 
                   }}
                   data-testid="history-scroll-container"
                 >
                    {closedTrades.map((trade) => {
                      const pnl = parseFloat(trade.pnl || '0');
                      return (
                        <div key={trade.id} className="flex items-center justify-between border-b border-white/5 pb-4" data-testid={`history-trade-${trade.id}`}>
                           <div className="flex items-center gap-3">
                              <div className="p-2 rounded-full bg-white/5">
                                 <Clock size={16} className="text-muted-foreground" />
                              </div>
                              <div>
                                 <div className="text-sm font-medium">
                                   {pnl >= 0 ? 'Won' : 'Lost'} {trade.direction} - {trade.marketTitle}
                                 </div>
                                 <div className="text-xs text-muted-foreground">{formatDate(trade.closedAt || trade.createdAt)}</div>
                              </div>
                           </div>
                           <span className={`font-mono text-sm ${pnl >= 0 ? 'text-[#1ED78B]' : 'text-red-400'}`}>
                             {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
                           </span>
                        </div>
                      );
                    })}
                    
                    {/* Load more indicator */}
                    {isFetchingNextPage && (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
                        <span className="text-xs text-muted-foreground">Loading more...</span>
                      </div>
                    )}
                    
                    {/* Load more button as fallback */}
                    {hasNextPage && !isFetchingNextPage && (
                      <Button 
                        variant="ghost" 
                        className="w-full text-muted-foreground hover:text-white"
                        onClick={() => fetchNextPage()}
                        data-testid="load-more-history"
                      >
                        <ChevronDown className="w-4 h-4 mr-2" />
                        Load more ({totalClosedTrades - closedTrades.length} remaining)
                      </Button>
                    )}
                 </div>
               )}
             </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
