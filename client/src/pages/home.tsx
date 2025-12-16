import { useState, useEffect } from 'react';
import { SwipeCard } from '@/components/swipe-card';
import { Layout } from '@/components/layout';
import { useSettings } from '@/hooks/use-settings';
import { useToast } from '@/hooks/use-toast';
import { AnimatePresence, useMotionValue, useTransform, motion, animate } from 'framer-motion';
import { RefreshCw, X, Check, ChevronsDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMarkets, createTrade, type Market } from '@/lib/api';

interface DisplayMarket {
  id: string;
  question: string;
  category: string;
  volume: string;
  yesPrice: number;
  noPrice: number;
  endDate: string;
  imageUrl?: string;
}

function formatMarket(m: Market): DisplayMarket {
  return {
    id: m.id,
    question: m.title,
    category: m.category,
    volume: `$${(m.volume / 1000).toFixed(0)}K`,
    yesPrice: m.yesPrice,
    noPrice: m.noPrice,
    endDate: new Date(m.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    imageUrl: m.imageUrl,
  };
}

export default function Home() {
  const queryClient = useQueryClient();
  
  const { data: marketsData, isLoading, refetch } = useQuery({
    queryKey: ['markets'],
    queryFn: () => getMarkets(),
  });
  
  const [displayedMarkets, setDisplayedMarkets] = useState<DisplayMarket[]>([]);
  const { settings } = useSettings();
  
  useEffect(() => {
    if (marketsData?.markets) {
      let filteredMarkets = marketsData.markets;
      
      if (settings.interests.length > 0) {
        const normalizedInterests = settings.interests.map(i => i.toLowerCase());
        filteredMarkets = marketsData.markets.filter(m => 
          normalizedInterests.includes(m.category.toLowerCase())
        );
        console.log('Filtering by interests:', settings.interests, 'Found:', filteredMarkets.length, 'markets');
      }
      
      setDisplayedMarkets(filteredMarkets.map(formatMarket));
    }
  }, [marketsData, settings.interests]);
  
  const tradeMutation = useMutation({
    mutationFn: async (trade: { market: DisplayMarket; direction: 'YES' | 'NO'; wagerAmount: number }) => {
      if (!settings.connected || !settings.privyId) {
        return null;
      }
      const price = trade.direction === 'YES' ? trade.market.yesPrice : trade.market.noPrice;
      return createTrade(settings.privyId, {
        marketId: trade.market.id,
        marketTitle: trade.market.question,
        marketCategory: trade.market.category,
        direction: trade.direction,
        wagerAmount: trade.wagerAmount,
        price,
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

  const handleSwipe = (id: string, direction: 'left' | 'right' | 'down') => {
    const market = displayedMarkets.find(m => m.id === id);

    setTimeout(() => {
      setDisplayedMarkets(prev => prev.filter(m => m.id !== id));
      x.set(0);
      y.set(0);
    }, 200);

    if (!market) return;

    if (direction === 'right') {
      const shares = settings.yesWager / market.yesPrice;
      const payout = shares.toFixed(2);
      
      if (settings.connected) {
        tradeMutation.mutate({ market, direction: 'YES', wagerAmount: settings.yesWager });
      }
      
      toast({
        title: (
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500/20 p-1 rounded-full">
              <Check size={14} className="text-emerald-500" />
            </div>
            <span className="text-emerald-500 font-bold uppercase tracking-wider text-xs">Long Position Opened</span>
          </div>
        ),
        description: (
          <div className="mt-2 space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-3xl font-black tracking-tighter text-white">YES</span>
              <span className="text-sm font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">@{Math.round(market.yesPrice * 100)}¢</span>
            </div>
            <div className="h-px bg-white/10 w-full" />
            <div className="flex justify-between text-xs text-zinc-400 font-medium">
              <span>Wager: <span className="text-zinc-200">${settings.yesWager}</span></span>
              <span>Est. Payout: <span className="text-emerald-400 font-mono">${payout}</span></span>
            </div>
          </div>
        ),
        className: "bg-zinc-950/90 border-emerald-500/20 text-white backdrop-blur-xl shadow-2xl shadow-emerald-500/10 p-4"
      });
    } else if (direction === 'left') {
      const shares = settings.noWager / market.noPrice;
      const payout = shares.toFixed(2);

      if (settings.connected) {
        tradeMutation.mutate({ market, direction: 'NO', wagerAmount: settings.noWager });
      }

      toast({
        title: (
          <div className="flex items-center gap-2">
            <div className="bg-rose-500/20 p-1 rounded-full">
              <X size={14} className="text-rose-500" />
            </div>
            <span className="text-rose-500 font-bold uppercase tracking-wider text-xs">Short Position Opened</span>
          </div>
        ),
        description: (
          <div className="mt-2 space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-3xl font-black tracking-tighter text-white">NO</span>
              <span className="text-sm font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">@{Math.round(market.noPrice * 100)}¢</span>
            </div>
            <div className="h-px bg-white/10 w-full" />
            <div className="flex justify-between text-xs text-zinc-400 font-medium">
              <span>Wager: <span className="text-zinc-200">${settings.noWager}</span></span>
              <span>Est. Payout: <span className="text-rose-400 font-mono">${payout}</span></span>
            </div>
          </div>
        ),
        className: "bg-zinc-950/90 border-rose-500/20 text-white backdrop-blur-xl shadow-2xl shadow-rose-500/10 p-4"
      });
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
    refetch();
  };

  return (
    <Layout>
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
                {displayedMarkets.map((market, index) => (
                  index >= displayedMarkets.length - 2 && (
                    <SwipeCard 
                      key={market.id} 
                      market={market} 
                      active={index === displayedMarkets.length - 1}
                      onSwipe={(dir) => handleSwipe(market.id, dir)}
                      dragX={index === displayedMarkets.length - 1 ? x : undefined}
                      dragY={index === displayedMarkets.length - 1 ? y : undefined}
                    />
                  )
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
