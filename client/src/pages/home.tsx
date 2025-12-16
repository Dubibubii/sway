import { useState, useEffect } from 'react';
import { SwipeCard } from '@/components/swipe-card';
import { MOCK_MARKETS } from '@/lib/mock-data';
import { Layout } from '@/components/layout';
import { useSettings } from '@/hooks/use-settings';
import { useToast } from '@/hooks/use-toast';
import { AnimatePresence, useMotionValue, useTransform, motion, animate } from 'framer-motion';
import { RefreshCw, X, Check, ChevronsDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Home() {
  const [markets, setMarkets] = useState(MOCK_MARKETS);
  const { settings } = useSettings();
  const { toast } = useToast();
  
  // Motion values for the active card to drive UI feedback
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Reset motion values when markets change (new card becomes active)
  useEffect(() => {
    x.set(0);
    y.set(0);
  }, [markets, x, y]);

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
    // Remove card from stack (visually handled by Framer Motion, but we need to update state)
    setTimeout(() => {
      setMarkets(prev => prev.filter(m => m.id !== id));
      // Reset values immediately after swipe to prevent lingering highlight
      x.set(0);
      y.set(0);
    }, 200);

    if (direction === 'right') {
      toast({
        title: "Trade Executed: YES",
        description: `Bought YES for $${settings.yesWager} @ 32¢`,
        className: "bg-primary border-primary text-primary-foreground"
      });
    } else if (direction === 'left') {
      toast({
        title: "Trade Executed: NO",
        description: `Bought NO for $${settings.noWager} @ 68¢`,
        variant: "destructive"
      });
    }
  };

  const manualSwipe = async (direction: 'left' | 'right' | 'down') => {
    if (markets.length === 0) return;
    const currentId = markets[markets.length - 1].id;
    
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
    setMarkets(MOCK_MARKETS);
  };

  return (
    <Layout>
      <div className="h-[100dvh] flex flex-col items-center p-0 relative bg-background overflow-hidden">
        
        {/* Deck */}
        <div className="flex-1 w-full max-w-md relative mt-20 mb-32 z-10 px-4">
          <AnimatePresence>
            {markets.map((market, index) => (
              index >= markets.length - 2 && ( // Only render top 2 cards for performance
                <SwipeCard 
                  key={market.id} 
                  market={market} 
                  active={index === markets.length - 1}
                  onSwipe={(dir) => handleSwipe(market.id, dir)}
                  dragX={index === markets.length - 1 ? x : undefined}
                  dragY={index === markets.length - 1 ? y : undefined}
                />
              )
            ))}
          </AnimatePresence>

          {markets.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <div className="text-muted-foreground text-lg">No more markets for now.</div>
              <Button onClick={resetDeck} variant="outline" className="gap-2">
                <RefreshCw size={16} />
                Refresh Deck
              </Button>
            </div>
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
