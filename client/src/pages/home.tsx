import { useState, useEffect } from 'react';
import { SwipeCard } from '@/components/swipe-card';
import { Layout } from '@/components/layout';
import { useSettings } from '@/hooks/use-settings';
import { useToast } from '@/hooks/use-toast';
import { useSwipeHistory } from '@/hooks/use-swipe-history';
import { usePondTrading } from '@/hooks/use-pond-trading';
import { useSolanaBalance } from '@/hooks/use-solana-balance';
import { usePageView, useBetPlaced } from '@/hooks/use-analytics';
import { AnimatePresence, useMotionValue, useTransform, motion, animate } from 'framer-motion';
import { RefreshCw, X, Check, ChevronsDown, Loader2, Wallet, DollarSign, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMarkets, createTrade, type Market } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { usePrivy } from '@privy-io/react-auth';
import { OnboardingTour } from '@/components/onboarding-tour';
import { usePrivySafe, PRIVY_ENABLED } from '@/hooks/use-privy-safe';

interface DisplayMarket {
  id: string;
  question: string;
  category: string;
  volume: string;
  yesPrice: number;
  noPrice: number;
  yesLabel: string;
  noLabel: string;
  endDate: string;
  imageUrl?: string;
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
  return {
    id: m.id,
    question: m.title,
    category: m.category,
    volume: formatVolume(m.volume),
    yesPrice: m.yesPrice,
    noPrice: m.noPrice,
    yesLabel: m.yesLabel || 'Yes',
    noLabel: m.noLabel || 'No',
    endDate: new Date(m.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    imageUrl: m.imageUrl,
  };
}

export default function Home() {
  usePageView('home');
  const trackBet = useBetPlaced();
  
  const queryClient = useQueryClient();
  const { login, authenticated, ready } = usePrivy();
  const { embeddedWallet } = usePrivySafe();
  const { recordSwipe, getVisibleCards, resetHistory } = useSwipeHistory();
  const { placeTrade: placePondTrade, isTrading: isPondTrading } = usePondTrading();
  
  // Only use embedded wallet for trading (auto-confirm enabled)
  const embeddedAddress = embeddedWallet?.address || null;
  const { usdcBalance, refetch: refetchBalance } = useSolanaBalance(embeddedAddress);
  
  // State for showing funding prompt
  const [showFundingPrompt, setShowFundingPrompt] = useState(false);
  const [requiredAmount, setRequiredAmount] = useState(0);
  
  const { data: marketsData, isLoading, refetch } = useQuery({
    queryKey: ['markets'],
    queryFn: () => getMarkets(),
  });
  
  const [displayedMarkets, setDisplayedMarkets] = useState<DisplayMarket[]>([]);
  const { settings, completeOnboarding } = useSettings();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (authenticated && !settings.onboardingCompleted) {
      const timer = setTimeout(() => {
        setShowOnboarding(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [authenticated, settings.onboardingCompleted]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    completeOnboarding();
  };
  
  useEffect(() => {
    if (marketsData?.markets) {
      const allMarkets = marketsData.markets.map(formatMarket);
      const visibleMarkets = getVisibleCards(allMarkets);
      setDisplayedMarkets(visibleMarkets);
    }
  }, [marketsData, getVisibleCards]);
  
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
      queryClient.invalidateQueries({ queryKey: ['trades'] });
    },
  });
  const { toast } = useToast();
  
  // Motion values for the active card to drive UI feedback
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Reset motion values when markets change (new card becomes active)
  useEffect(() => {
    x.set(0);
    y.set(0);
  }, [displayedMarkets, x, y]);

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
      // Apply accurate cost adjustments using swipe channel fee ($0.05 flat)
      const platformFee = 0.05; // $0.05 flat fee for swipe channel
      // Conservative price impact estimate (smaller for swipe's typically smaller trades)
      const priceImpactRate = settings.yesWager < 5 ? 0.015 : 0.01;
      const priceImpact = settings.yesWager * priceImpactRate;
      const effectiveBetAmount = Math.max(0.01, settings.yesWager - platformFee - priceImpact);
      const shares = effectiveBetAmount / market.yesPrice;
      const payout = shares.toFixed(2);
      
      if (settings.connected) {
        // Execute REAL on-chain trade via Pond/DFlow (embedded wallet only)
        // Use 'swipe' channel - $0.05 flat fee
        const result = await placePondTrade(market.id, 'yes', settings.yesWager, usdcBalance, embeddedAddress || undefined, 'swipe');
        
        if (result.success) {
          // Refresh balance after successful trade
          setTimeout(() => refetchBalance(), 2000);
          tradeMutation.mutate({ 
            market, 
            direction: 'YES', 
            wagerAmount: settings.yesWager,
            actualShares: result.actualShares,
            signature: result.signature,
            executionMode: result.executionMode,
          });
          trackBet(market.id, market.question, settings.yesWager);
          
          // Calculate actual shares from trade result or estimate
          const actualShares = result.actualShares || result.expectedShares || shares;
          const actualPayout = actualShares.toFixed(2);
          const pricePerShare = Math.round(market.yesPrice * 100);
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
                    <span>Bought: <span className="text-zinc-200">{actualShares.toFixed(2)} shares</span></span>
                    <span>Spent: <span className="text-zinc-200">${settings.yesWager.toFixed(2)}</span></span>
                  </div>
                  <div className="flex justify-between">
                    <span>Payout if Yes: <span className="text-[#1ED78B] font-mono">${actualPayout}</span></span>
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
                <span className="text-sm font-mono text-[#1ED78B] bg-[#1ED78B]/10 px-2 py-0.5 rounded">@{Math.round(market.yesPrice * 100)}¢</span>
              </div>
              <div className="h-px bg-white/10 w-full" />
              <div className="text-xs text-zinc-400">Connect wallet to place real trades</div>
            </div>
          ),
          className: "bg-zinc-950/90 border-[#1ED78B]/20 text-white backdrop-blur-xl shadow-2xl shadow-[#1ED78B]/10 p-4"
        });
      }
    } else if (direction === 'left') {
      // Apply accurate cost adjustments using swipe channel fee ($0.05 flat)
      const platformFee = 0.05; // $0.05 flat fee for swipe channel
      // Conservative price impact estimate (smaller for swipe's typically smaller trades)
      const priceImpactRate = settings.noWager < 5 ? 0.015 : 0.01;
      const priceImpact = settings.noWager * priceImpactRate;
      const effectiveBetAmount = Math.max(0.01, settings.noWager - platformFee - priceImpact);
      const shares = effectiveBetAmount / market.noPrice;
      const payout = shares.toFixed(2);

      if (settings.connected) {
        // Execute REAL on-chain trade via Pond/DFlow (embedded wallet only)
        // Use 'swipe' channel - $0.05 flat fee
        const result = await placePondTrade(market.id, 'no', settings.noWager, usdcBalance, embeddedAddress || undefined, 'swipe');
        
        if (result.success) {
          // Refresh balance after successful trade
          setTimeout(() => refetchBalance(), 2000);
          tradeMutation.mutate({ 
            market, 
            direction: 'NO', 
            wagerAmount: settings.noWager,
            actualShares: result.actualShares,
            signature: result.signature,
            executionMode: result.executionMode,
          });
          trackBet(market.id, market.question, settings.noWager);
          
          // Calculate actual shares from trade result or estimate
          const actualShares = result.actualShares || result.expectedShares || shares;
          const actualPayout = actualShares.toFixed(2);
          const pricePerShare = Math.round(market.noPrice * 100);
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
                    <span>Bought: <span className="text-zinc-200">{actualShares.toFixed(2)} shares</span></span>
                    <span>Spent: <span className="text-zinc-200">${settings.noWager.toFixed(2)}</span></span>
                  </div>
                  <div className="flex justify-between">
                    <span>Payout if No: <span className="text-rose-400 font-mono">${actualPayout}</span></span>
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
                <span className="text-sm font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">@{Math.round(market.noPrice * 100)}¢</span>
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

  const manualSwipe = async (direction: 'left' | 'right' | 'down') => {
    if (displayedMarkets.length === 0) return;
    const currentId = displayedMarkets[displayedMarkets.length - 1].id;
    
    if (direction === 'left') {
      await animate(x, -500, { duration: 0.3 }).finished;
    } else if (direction === 'right') {
      await animate(x, 500, { duration: 0.3 }).finished;
    } else if (direction === 'down') {
      await animate(y, 500, { duration: 0.3 }).finished;
    }
    
    handleSwipe(currentId, direction);
  };

  const resetDeck = () => {
    resetHistory();
    refetch();
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

      <AnimatePresence>
        {showOnboarding && (
          <OnboardingTour onComplete={handleOnboardingComplete} />
        )}
      </AnimatePresence>

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
                {displayedMarkets.slice(0, 2).reverse().map((market, index, arr) => (
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

              {displayedMarkets.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-4">
                  <div className="text-muted-foreground text-lg">No more markets for now.</div>
                  <Button onClick={resetDeck} variant="outline" className="gap-2">
                    <RefreshCw size={16} />
                    Refresh Deck
                  </Button>
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
