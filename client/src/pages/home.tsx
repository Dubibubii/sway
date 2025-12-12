import { useState } from 'react';
import { SwipeCard } from '@/components/swipe-card';
import { MOCK_MARKETS } from '@/lib/mock-data';
import { Layout } from '@/components/layout';
import { useSettings } from '@/hooks/use-settings';
import { useToast } from '@/hooks/use-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Home() {
  const [markets, setMarkets] = useState(MOCK_MARKETS);
  const { settings } = useSettings();
  const { toast } = useToast();

  const handleSwipe = (id: string, direction: 'left' | 'right' | 'down') => {
    // Remove card from stack (visually handled by Framer Motion, but we need to update state)
    setTimeout(() => {
      setMarkets(prev => prev.filter(m => m.id !== id));
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

  const resetDeck = () => {
    setMarkets(MOCK_MARKETS);
  };

  return (
    <Layout>
      <div className="h-[100dvh] flex flex-col items-center justify-center p-4 relative bg-background">
        
        {/* Header */}
        <div className="absolute top-6 left-0 w-full px-6 flex justify-between items-center z-50">
           <div className="flex items-center gap-2">
             <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
               <div className="w-4 h-4 bg-primary rounded-full animate-pulse" />
             </div>
             <span className="font-display font-bold text-xl tracking-tight">Pulse</span>
           </div>
           <div className="bg-card/40 backdrop-blur-md rounded-full px-4 py-1 border border-white/5">
              <span className="text-xs font-mono text-muted-foreground">ETH: $3,420</span>
           </div>
        </div>

        {/* Deck */}
        <div className="w-full max-w-sm h-[600px] relative">
          <AnimatePresence>
            {markets.map((market, index) => (
              index >= markets.length - 2 && ( // Only render top 2 cards for performance
                <SwipeCard 
                  key={market.id} 
                  market={market} 
                  active={index === markets.length - 1}
                  onSwipe={(dir) => handleSwipe(market.id, dir)}
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
        
        {/* Controls Hint */}
        {markets.length > 0 && (
          <div className="absolute bottom-24 flex gap-8 text-muted-foreground/50 text-sm font-medium z-0">
             <span>NO</span>
             <span>SKIP</span>
             <span>YES</span>
          </div>
        )}
      </div>
    </Layout>
  );
}
