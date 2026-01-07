import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { SwipeCard } from '@/components/swipe-card';
import { Layout } from '@/components/layout';
import { useSettings } from '@/hooks/use-settings';
import { useToast } from '@/hooks/use-toast';
import { useSwipeHistory } from '@/hooks/use-swipe-history';
import { usePondTrading } from '@/hooks/use-pond-trading';
import { useSolanaBalance } from '@/hooks/use-solana-balance';
import { usePageView, useBetPlaced } from '@/hooks/use-analytics';
import { AnimatePresence, useMotionValue, useTransform, motion, animate } from 'framer-motion';
import { RefreshCw, X, Check, ChevronsDown, Loader2, Wallet, DollarSign, ArrowRight, ExternalLink, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMarkets, createTrade, getBalancedPercentages, type Market, type MarketsResponse } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { usePrivy } from '@privy-io/react-auth';
import { usePrivySafe, PRIVY_ENABLED } from '@/hooks/use-privy-safe';
import { MWA_ENV } from '@/lib/mwa-env';
import { useWebSocketSubscription, useLivePrices, useConnectionStatus } from '@/lib/dflow';
import { calculateTradeFeesForBuy } from '@/utils/dflowFees';

const BATCH_SIZE = 50;
const LOW_CARDS_THRESHOLD = 10;

interface DisplayMarket {
  id: string;
  question: string;
  category: string;
  volume: string;
  yesPrice: number;
  noPrice: number;
  yesAsk?: number; // Actual price to BUY YES (higher)
  yesBid?: number; // Actual price to SELL YES (lower)
  noAsk?: number;  // Actual price to BUY NO
  noBid?: number;  // Actual price to SELL NO
  yesLabel: string;
  noLabel: string;
  endDate: string;
  imageUrl?: string;
  isLive?: boolean;
}

function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) {
    return `$${(volume / 1_000_000_000).toFixed(1)}B`;
  } else if (volume >= 1_000_000) {
    return `$${(volume / 1_000_000).toFixed(1)}M`;
  } else if (volume >= 1_000) {
    return `$${(volume / 1_000).toFixed(0)}K`;
  }
  return `$${volume}`;
}

function formatMarket(m: Market): DisplayMarket {
  let endDateFormatted: string;
  const endDateValue = m.endDate;
  
  if (typeof endDateValue === 'number') {
    const timestamp = endDateValue < 10000000000 ? endDateValue * 1000 : endDateValue;
    endDateFormatted = new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } else if (typeof endDateValue === 'string') {
    endDateFormatted = new Date(endDateValue).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } else {
    endDateFormatted = 'TBD';
  }
  
  return {
    id: m.id,
    question: m.title,
    category: m.category,
    volume: formatVolume(m.volume),
    yesPrice: m.yesPrice,
    noPrice: m.noPrice,
    yesAsk: m.yesAsk,
    yesBid: m.yesBid,
    noAsk: m.noAsk,
    noBid: m.noBid,
    yesLabel: m.yesLabel || 'Yes',
    noLabel: m.noLabel || 'No',
    endDate: endDateFormatted,
    imageUrl: m.imageUrl,
  };
}

export default function Home() {
  usePageView('home');
  const trackBet = useBetPlaced();
  
  const queryClient = useQueryClient();
  const { login, authenticated, ready } = usePrivy();
  const { embeddedWallet } = usePrivySafe();
  const { recordSwipe, getVisibleCards, resetHistory, updateCacheTimestamp, getSwipedIds } = useSwipeHistory();
  const { placeTrade: placePondTrade, isTrading: isPondTrading } = usePondTrading();
  
  const embeddedAddress = embeddedWallet?.address || null;
  const { usdcBalance, solBalance, refetch: refetchBalance } = useSolanaBalance(embeddedAddress);
  
  const [showFundingPrompt, setShowFundingPrompt] = useState(false);
  const [requiredAmount, setRequiredAmount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  const fetchedMarketIdsRef = useRef<Set<string>>(new Set());
  
  const {
    data: marketsData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['markets'],
    queryFn: async ({ pageParam = 0 }) => {
      const excludeIds = getSwipedIds();
      const response = await getMarkets({
        limit: BATCH_SIZE,
        offset: pageParam,
        excludeIds: excludeIds.length > 0 ? excludeIds : undefined,
      });
      
      if (response.cacheTimestamp) {
        const wasReset = updateCacheTimestamp(response.cacheTimestamp);
        if (wasReset) {
          fetchedMarketIdsRef.current.clear();
        }
      }
      
      return response;
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      const totalFetched = allPages.reduce((sum, page) => sum + page.markets.length, 0);
      return totalFetched;
    },
    initialPageParam: 0,
    refetchInterval: 30000,
  });
  
  const [displayedMarkets, setDisplayedMarkets] = useState<DisplayMarket[]>([]);
  const { settings } = useSettings();
  
  useEffect(() => {
    if (marketsData?.pages) {
      const allMarkets: DisplayMarket[] = [];
      const seenIds = new Set<string>();
      
      for (const page of marketsData.pages) {
        for (const market of page.markets) {
          if (market.isInitialized !== false && !seenIds.has(market.id)) {
            seenIds.add(market.id);
            fetchedMarketIdsRef.current.add(market.id);
            allMarkets.push(formatMarket(market));
          }
        }
      }
      
      const visibleMarkets = getVisibleCards(allMarkets);
      setDisplayedMarkets(visibleMarkets);
    }
  }, [marketsData, getVisibleCards]);
  
  useEffect(() => {
    if (displayedMarkets.length < LOW_CARDS_THRESHOLD && hasNextPage && !isFetchingNextPage && !isLoadingMore) {
      setIsLoadingMore(true);
      fetchNextPage().finally(() => setIsLoadingMore(false));
    }
  }, [displayedMarkets.length, hasNextPage, isFetchingNextPage, isLoadingMore, fetchNextPage]);

  const tickersToSubscribe = useMemo(() => {
    return displayedMarkets.slice(0, 30).map(m => m.id);
  }, [displayedMarkets]);

  useWebSocketSubscription(tickersToSubscribe, displayedMarkets.length > 0);

  const wsStatus = useConnectionStatus();
  const livePrices = useLivePrices(tickersToSubscribe);

  const marketsWithLivePrices = useMemo(() => {
    return displayedMarkets.map(market => {
      const livePrice = livePrices[market.id];
      if (livePrice) {
        return {
          ...market,
          yesPrice: livePrice.yesPrice || market.yesPrice,
          noPrice: livePrice.noPrice || market.noPrice,
          // Preserve bid/ask from live data if available, otherwise keep initial values
          yesAsk: livePrice.yesAsk ?? market.yesAsk,
          yesBid: livePrice.yesBid ?? market.yesBid,
          noAsk: livePrice.noAsk ?? market.noAsk,
          noBid: livePrice.noBid ?? market.noBid,
          isLive: true,
        };
      }
      return { ...market, isLive: false };
    });
  }, [displayedMarkets, livePrices]);
  
  const tradeMutation = useMutation({
    mutationFn: async (trade: { 
      market: DisplayMarket; 
      direction: 'YES' | 'NO'; 
      wagerAmount: number;
      actualShares?: number;
      signature?: string;
      executionMode?: 'sync' | 'async';
    }) => {
      if (!settings.connected || !settings.privyId) {
        return null;
      }
      const price = trade.direction === 'YES' ? trade.market.yesPrice : trade.market.noPrice;
      // Get the option label based on bet direction
      const optionLabel = trade.direction === 'YES' ? trade.market.yesLabel : trade.market.noLabel;
      return createTrade(settings.privyId, {
        marketId: trade.market.id,
        marketTitle: trade.market.question,
        marketCategory: trade.market.category,
        optionLabel: optionLabel !== trade.direction ? optionLabel : null, // Only store if different from YES/NO
        direction: trade.direction,
        wagerAmount: trade.wagerAmount,
        price,
        actualShares: trade.actualShares,
        signature: trade.signature,
        executionMode: trade.executionMode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['tradeHistory'] });
    },
  });
  const { toast } = useToast();
  
  // Motion values for the active card to drive UI feedback
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  // Note: Motion value reset is handled in handleSwipe's setTimeout, after the card removal animation.
  // DO NOT add a useEffect that resets x/y on displayedMarkets change - it causes the card to snap back
  // before the swipe animation completes.

  // Button transforms based on drag
  const noScale = useTransform(x, [-150, 0], [1.2, 1]);
  const noColor = useTransform(x, [-150, 0], ["rgba(225, 29, 72, 1)", "rgba(225, 29, 72, 0.2)"]);
  const noBorder = useTransform(x, [-150, 0], ["rgba(225, 29, 72, 1)", "rgba(225, 29, 72, 0)"]);
  
  const yesScale = useTransform(x, [0, 150], [1, 1.2]);
  const yesColor = useTransform(x, [0, 150], ["rgba(16, 185, 129, 0.2)", "rgba(16, 185, 129, 1)"]);
  const yesBorder = useTransform(x, [0, 150], ["rgba(16, 185, 129, 0)", "rgba(16, 185, 129, 1)"]);
  
  const skipScale = useTransform(y, [0, 150], [1, 1.2]);
  const skipColor = useTransform(y, [0, 150], ["rgba(59, 130, 246, 0.2)", "rgba(59, 130, 246, 1)"]);
  const skipBorder = useTransform(y, [0, 150], ["rgba(59, 130, 246, 0)", "rgba(59, 130, 246, 1)"]);

  const handleSwipe = async (id: string, direction: 'left' | 'right' | 'down') => {
    const market = displayedMarkets.find(m => m.id === id);
    
    recordSwipe(id);

    setTimeout(() => {
      setDisplayedMarkets(prev => prev.filter(m => m.id !== id));
      x.set(0);
      y.set(0);
    }, 200);

    if (!market) return;

    if (direction === 'right') {
      // Calculate fees using DFlow's fee formula: scale * p * (1-p) * contracts
      // IMPORTANT: Use yesAsk (actual buy price) if available, not mid-price
      // Shares are floored to whole contracts to avoid fractional share issues
      const executionPrice = market.yesAsk ?? market.yesPrice;
      const feeBreakdown = calculateTradeFeesForBuy(settings.yesWager, executionPrice, 'swipe');
      const shares = feeBreakdown.netShares; // Already floored to whole contracts
      const actualSpend = feeBreakdown.actualSpend; // Adjusted for whole shares
      const payout = shares.toFixed(0); // Whole shares = whole payout
      
      // Check if wager is too small for even 1 whole share
      if (shares < 1) {
        toast({
          title: "Bet Too Small",
          description: `At ${(executionPrice * 100).toFixed(0)}¢ per share, you need at least $${(executionPrice + 0.05).toFixed(2)} to buy 1 share. Increase your bet amount in settings.`,
          variant: "destructive",
        });
        return;
      }
      
      if (settings.connected) {
        // Execute REAL on-chain trade via Pond/DFlow (embedded wallet only)
        // Use actualSpend (adjusted for whole shares) instead of raw wager
        const result = await placePondTrade(market.id, 'yes', actualSpend, usdcBalance, embeddedAddress || undefined, 'swipe', solBalance);
        
        if (result.success) {
          // Refresh balance after successful trade
          setTimeout(() => refetchBalance(), 2000);
          tradeMutation.mutate({ 
            market, 
            direction: 'YES', 
            wagerAmount: actualSpend, // Use adjusted spend for whole shares
            actualShares: result.actualShares || shares,
            signature: result.signature,
            executionMode: result.executionMode,
          });
          trackBet(market.id, market.question, actualSpend);
          
          // Use the pre-calculated whole shares (from fee breakdown)
          const confirmedShares = result.actualShares || shares;
          const pricePerShare = getBalancedPercentages(market.yesPrice, market.noPrice).yesPercent;
          const isAsync = result.executionMode === 'async';
          
          toast({
            title: (
              <div className="flex items-center gap-2">
                <div className="bg-[#1ED78B]/20 p-1 rounded-full">
                  <Check size={14} className="text-[#1ED78B]" />
                </div>
                <span className="text-[#1ED78B] font-bold uppercase tracking-wider text-xs">Trade Executed</span>
              </div>
            ),
            description: (
              <div className="mt-2 space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-3xl font-black tracking-tighter text-white">YES</span>
                  <span className="text-sm font-mono text-[#1ED78B] bg-[#1ED78B]/10 px-2 py-0.5 rounded">@{pricePerShare}¢</span>
                </div>
                <div className="h-px bg-white/10 w-full" />
                <div className="flex flex-col gap-1 text-xs text-zinc-400 font-medium">
                  <div className="flex justify-between">
                    <span>Bought: <span className="text-zinc-200">{confirmedShares} shares</span></span>
                    <span>Spent: <span className="text-zinc-200">${actualSpend.toFixed(2)}</span></span>
                  </div>
                  <div className="flex justify-between">
                    <span>Payout if Yes: <span className="text-[#1ED78B] font-mono">${confirmedShares}</span></span>
                    {isAsync && <span className="text-amber-400 text-[10px]">Processing...</span>}
                  </div>
                </div>
              </div>
            ),
            className: "bg-zinc-950/90 border-[#1ED78B]/20 text-white backdrop-blur-xl shadow-2xl shadow-[#1ED78B]/10 p-4"
          });
        } else if (result.error?.startsWith('INSUFFICIENT_FUNDS:')) {
          // Show funding prompt
          setRequiredAmount(settings.yesWager);
          setShowFundingPrompt(true);
        } else if (result.error?.startsWith('INSUFFICIENT_GAS:')) {
          // Not enough SOL for gas fees
          toast({
            title: "Need More SOL for Gas",
            description: "You need at least 0.003 SOL for transaction fees. Deposit more SOL from your profile page.",
            variant: "destructive",
          });
        } else if (result.error?.startsWith('BALANCE_LOADING:')) {
          // Balance not yet loaded
          toast({
            title: "Loading...",
            description: "Please wait for your wallet balance to load, then try again.",
            variant: "destructive",
          });
        } else {
          // Check for zero out amount error - trade too small for DFlow
          const errorMsg = result.error?.includes('zero_out_amount') || result.error?.includes('Zero out amount')
            ? 'Trade amount too small. Try increasing your bet to at least $0.50'
            : (result.error || "Could not execute trade on-chain");
          toast({
            title: "Trade Failed",
            description: errorMsg,
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: (
            <div className="flex items-center gap-2">
              <div className="bg-[#1ED78B]/20 p-1 rounded-full">
                <Check size={14} className="text-[#1ED78B]" />
              </div>
              <span className="text-[#1ED78B] font-bold uppercase tracking-wider text-xs">Demo: Long Position</span>
            </div>
          ),
          description: (
            <div className="mt-2 space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-3xl font-black tracking-tighter text-white">YES</span>
                <span className="text-sm font-mono text-[#1ED78B] bg-[#1ED78B]/10 px-2 py-0.5 rounded">@{getBalancedPercentages(market.yesPrice, market.noPrice).yesPercent}¢</span>
              </div>
              <div className="h-px bg-white/10 w-full" />
              <div className="text-xs text-zinc-400">Connect wallet to place real trades</div>
            </div>
          ),
          className: "bg-zinc-950/90 border-[#1ED78B]/20 text-white backdrop-blur-xl shadow-2xl shadow-[#1ED78B]/10 p-4"
        });
      }
    } else if (direction === 'left') {
      // Calculate fees using DFlow's fee formula: scale * p * (1-p) * contracts
      // IMPORTANT: Use noAsk (actual buy price) if available, not mid-price
      // Shares are floored to whole contracts to avoid fractional share issues
      const executionPrice = market.noAsk ?? market.noPrice;
      const feeBreakdown = calculateTradeFeesForBuy(settings.noWager, executionPrice, 'swipe');
      const shares = feeBreakdown.netShares; // Already floored to whole contracts
      const actualSpend = feeBreakdown.actualSpend; // Adjusted for whole shares
      const payout = shares.toFixed(0); // Whole shares = whole payout
      
      // Check if wager is too small for even 1 whole share
      if (shares < 1) {
        toast({
          title: "Bet Too Small",
          description: `At ${(executionPrice * 100).toFixed(0)}¢ per share, you need at least $${(executionPrice + 0.05).toFixed(2)} to buy 1 share. Increase your bet amount in settings.`,
          variant: "destructive",
        });
        return;
      }

      if (settings.connected) {
        // Execute REAL on-chain trade via Pond/DFlow (embedded wallet only)
        // Use actualSpend (adjusted for whole shares) instead of raw wager
        const result = await placePondTrade(market.id, 'no', actualSpend, usdcBalance, embeddedAddress || undefined, 'swipe', solBalance);
        
        if (result.success) {
          // Refresh balance after successful trade
          setTimeout(() => refetchBalance(), 2000);
          tradeMutation.mutate({ 
            market, 
            direction: 'NO', 
            wagerAmount: actualSpend, // Use adjusted spend for whole shares
            actualShares: result.actualShares || shares,
            signature: result.signature,
            executionMode: result.executionMode,
          });
          trackBet(market.id, market.question, actualSpend);
          
          // Use the pre-calculated whole shares (from fee breakdown)
          const confirmedShares = result.actualShares || shares;
          const pricePerShare = getBalancedPercentages(market.yesPrice, market.noPrice).noPercent;
          const isAsync = result.executionMode === 'async';
          
          toast({
            title: (
              <div className="flex items-center gap-2">
                <div className="bg-rose-500/20 p-1 rounded-full">
                  <X size={14} className="text-rose-500" />
                </div>
                <span className="text-rose-500 font-bold uppercase tracking-wider text-xs">Trade Executed</span>
              </div>
            ),
            description: (
              <div className="mt-2 space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-3xl font-black tracking-tighter text-white">NO</span>
                  <span className="text-sm font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">@{pricePerShare}¢</span>
                </div>
                <div className="h-px bg-white/10 w-full" />
                <div className="flex flex-col gap-1 text-xs text-zinc-400 font-medium">
                  <div className="flex justify-between">
                    <span>Bought: <span className="text-zinc-200">{confirmedShares} shares</span></span>
                    <span>Spent: <span className="text-zinc-200">${actualSpend.toFixed(2)}</span></span>
                  </div>
                  <div className="flex justify-between">
                    <span>Payout if No: <span className="text-rose-400 font-mono">${confirmedShares}</span></span>
                    {isAsync && <span className="text-amber-400 text-[10px]">Processing...</span>}
                  </div>
                </div>
              </div>
            ),
            className: "bg-zinc-950/90 border-rose-500/20 text-white backdrop-blur-xl shadow-2xl shadow-rose-500/10 p-4"
          });
        } else if (result.error?.startsWith('INSUFFICIENT_FUNDS:')) {
          // Show funding prompt
          setRequiredAmount(settings.noWager);
          setShowFundingPrompt(true);
        } else if (result.error?.startsWith('INSUFFICIENT_GAS:')) {
          // Not enough SOL for gas fees
          toast({
            title: "Need More SOL for Gas",
            description: "You need at least 0.003 SOL for transaction fees. Deposit more SOL from your profile page.",
            variant: "destructive",
          });
        } else if (result.error?.startsWith('BALANCE_LOADING:')) {
          // Balance not yet loaded
          toast({
            title: "Loading...",
            description: "Please wait for your wallet balance to load, then try again.",
            variant: "destructive",
          });
        } else {
          // Check for zero out amount error - trade too small for DFlow
          const errorMsg = result.error?.includes('zero_out_amount') || result.error?.includes('Zero out amount')
            ? 'Trade amount too small. Try increasing your bet to at least $0.50'
            : (result.error || "Could not execute trade on-chain");
          toast({
            title: "Trade Failed",
            description: errorMsg,
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: (
            <div className="flex items-center gap-2">
              <div className="bg-rose-500/20 p-1 rounded-full">
                <X size={14} className="text-rose-500" />
              </div>
              <span className="text-rose-500 font-bold uppercase tracking-wider text-xs">Demo: Short Position</span>
            </div>
          ),
          description: (
            <div className="mt-2 space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-3xl font-black tracking-tighter text-white">NO</span>
                <span className="text-sm font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">@{getBalancedPercentages(market.yesPrice, market.noPrice).noPercent}¢</span>
              </div>
              <div className="h-px bg-white/10 w-full" />
              <div className="text-xs text-zinc-400">Connect wallet to place real trades</div>
            </div>
          ),
          className: "bg-zinc-950/90 border-rose-500/20 text-white backdrop-blur-xl shadow-2xl shadow-rose-500/10 p-4"
        });
      }
    }
  };

  const manualSwipe = (direction: 'left' | 'right' | 'down') => {
    // The active card is marketsWithLivePrices[0] (first in the displayed list)
    // because we show .slice(0, 2).reverse() and the last item in reversed array is the top card
    if (marketsWithLivePrices.length === 0) return;
    const currentMarket = marketsWithLivePrices[0];
    if (!currentMarket) return;
    
    console.log('[ManualSwipe] Direction:', direction, 'Market:', currentMarket.id);
    
    // Animate the motion values to show visual feedback
    // The animate() function updates the motion value which drives the card position via style prop
    try {
      if (direction === 'left') {
        animate(x, -500, { duration: 0.25, ease: "easeOut" });
      } else if (direction === 'right') {
        animate(x, 500, { duration: 0.25, ease: "easeOut" });
      } else if (direction === 'down') {
        animate(y, 500, { duration: 0.25, ease: "easeOut" });
      }
    } catch (e) {
      // Animation may fail silently, still proceed with swipe
      console.log('[ManualSwipe] Animation error:', e);
    }
    
    // Small delay to let animation start visually, then trigger the swipe logic
    setTimeout(() => {
      handleSwipe(currentMarket.id, direction);
    }, 50);
  };

  const resetDeck = () => {
    resetHistory();
    fetchedMarketIdsRef.current.clear();
    queryClient.resetQueries({ queryKey: ['markets'] });
  };

  const handleConnectWallet = () => {
    login();
  };

  return (
    <Layout>
      <Dialog open={!authenticated && ready} onOpenChange={() => {}}>
        <DialogContent 
          className="sm:max-w-sm bg-zinc-950 border border-zinc-800/80 shadow-2xl [&>button]:hidden rounded-3xl"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <div className="flex flex-col items-center text-center px-2 py-6">
            <div className="mb-8">
              <div className="text-5xl font-black tracking-tighter bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                SWAY
              </div>
              <div className="text-zinc-500 text-sm mt-1 font-medium tracking-wide">
                Prediction Markets
              </div>
            </div>
            
            <div className="w-full space-y-3 mb-6">
              <div className="flex items-center gap-3 text-left bg-zinc-900/50 rounded-xl p-3 border border-zinc-800/50">
                <div className="w-10 h-10 rounded-full bg-[#1ED78B]/20 flex items-center justify-center shrink-0">
                  <Check size={20} className="text-[#1ED78B]" />
                </div>
                <div>
                  <div className="text-white text-sm font-semibold">Swipe Right</div>
                  <div className="text-zinc-500 text-xs">Bet YES on markets</div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 text-left bg-zinc-900/50 rounded-xl p-3 border border-zinc-800/50">
                <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0">
                  <X size={20} className="text-rose-400" />
                </div>
                <div>
                  <div className="text-white text-sm font-semibold">Swipe Left</div>
                  <div className="text-zinc-500 text-xs">Bet NO on markets</div>
                </div>
              </div>
            </div>
            
            <Button 
              onClick={handleConnectWallet}
              className="w-full bg-white hover:bg-zinc-100 text-black font-bold py-6 text-base rounded-2xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              data-testid="button-connect-wallet-modal"
            >
              <Wallet className="mr-2" size={20} />
              Connect Wallet
            </Button>
            
            <p className="text-zinc-600 text-[11px] mt-4 tracking-wide">
              Phantom, Solflare, Backpack & more
            </p>

            {MWA_ENV.isWebView && MWA_ENV.isAndroid && (
              <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <p className="text-amber-400 text-xs text-center">
                  <ExternalLink size={12} className="inline mr-1" />
                  For Seed Vault/hardware wallet, open this app in Chrome browser
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Funding Prompt Dialog */}
      <Dialog open={showFundingPrompt} onOpenChange={setShowFundingPrompt}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-sm mx-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-bold">Add Funds to Trade</DialogTitle>
            <DialogDescription className="text-center text-zinc-400">
              Your embedded wallet needs USDC to place trades
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
              <DollarSign size={32} className="text-primary" />
            </div>
            
            <div className="text-center space-y-2">
              <p className="text-zinc-400 text-sm">
                You need <span className="text-white font-bold">${requiredAmount} USDC</span> for this trade
              </p>
              <p className="text-zinc-500 text-xs">
                Current balance: <span className="text-zinc-300">${(usdcBalance ?? 0).toFixed(2)} USDC</span>
              </p>
            </div>
            
            <div className="w-full space-y-3 mt-4">
              <Button 
                onClick={() => {
                  setShowFundingPrompt(false);
                  window.location.href = '/profile';
                }}
                className="w-full bg-primary hover:bg-primary/90 text-black font-bold py-6 text-base rounded-2xl"
              >
                <ArrowRight className="mr-2" size={20} />
                Go to Profile to Add Funds
              </Button>
              
              <p className="text-zinc-600 text-xs text-center">
                Deposit SOL and it will auto-convert to USDC
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="h-[100dvh] flex flex-col items-center p-0 relative bg-background overflow-hidden">
        
        {/* Deck */}
        <div className="flex-1 w-full max-w-md relative mt-20 mb-32 z-10 px-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <div className="text-muted-foreground">Loading markets...</div>
            </div>
          ) : (
            <>
              <AnimatePresence>
                {marketsWithLivePrices.slice(0, 2).reverse().map((market, index, arr) => (
                    <SwipeCard 
                      key={market.id} 
                      market={market} 
                      active={index === arr.length - 1}
                      onSwipe={(dir) => handleSwipe(market.id, dir)}
                      dragX={index === arr.length - 1 ? x : undefined}
                      dragY={index === arr.length - 1 ? y : undefined}
                    />
                ))}
              </AnimatePresence>

              {marketsWithLivePrices.length === 0 && !isFetchingNextPage && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-4">
                  <div className="text-muted-foreground text-lg">No more markets for now.</div>
                  <Button onClick={resetDeck} variant="outline" className="gap-2">
                    <RefreshCw size={16} />
                    Refresh Deck
                  </Button>
                </div>
              )}

              {isFetchingNextPage && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center gap-3 bg-background/80 backdrop-blur-sm z-20" data-testid="loading-more-indicator">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <div className="text-muted-foreground text-sm">Loading more markets...</div>
                </div>
              )}
            </>
          )}
        </div>
        
        {/* Controls Area */}
        <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-black to-transparent z-20 flex items-end justify-between px-6 pb-8">
           {/* NO Button */}
           <motion.div 
             style={{ scale: noScale, backgroundColor: noColor, borderColor: noBorder }}
             className="w-20 h-20 rounded-full border-2 border-destructive/30 flex items-center justify-center backdrop-blur-sm transition-shadow shadow-lg cursor-pointer hover:bg-destructive/30 active:scale-95"
             onClick={() => manualSwipe('left')}
             whileTap={{ scale: 0.9 }}
           >
             <X size={32} className="text-white" />
           </motion.div>

           {/* SKIP Button */}
           <motion.div 
             style={{ scale: skipScale, backgroundColor: skipColor, borderColor: skipBorder }}
             className="w-16 h-16 rounded-full border-2 border-blue-500/30 flex items-center justify-center backdrop-blur-sm mb-2 cursor-pointer hover:bg-blue-500/30 active:scale-95"
             onClick={() => manualSwipe('down')}
             whileTap={{ scale: 0.9 }}
           >
             <ChevronsDown size={28} className="text-white" />
           </motion.div>

           {/* YES Button */}
           <motion.div 
             style={{ scale: yesScale, backgroundColor: yesColor, borderColor: yesBorder }}
             className="w-20 h-20 rounded-full border-2 border-primary/30 flex items-center justify-center backdrop-blur-sm transition-shadow shadow-lg cursor-pointer hover:bg-primary/30 active:scale-95"
             onClick={() => manualSwipe('right')}
             whileTap={{ scale: 0.9 }}
           >
             <Check size={32} className="text-white" />
           </motion.div>
        </div>
      </div>
    </Layout>
  );
}
