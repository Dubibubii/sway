import { useState } from 'react';
import { HelpCircle, X, TrendingUp, TrendingDown, ArrowRight, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';

interface SpreadExplainerTooltipProps {
  buyPrice: number;
  sellPrice: number;
  direction: 'YES' | 'NO';
  className?: string;
}

export function SpreadExplainerTooltip({ buyPrice, sellPrice, direction, className = '' }: SpreadExplainerTooltipProps) {
  const [showSheet, setShowSheet] = useState(false);
  
  const spreadCents = Math.round((buyPrice - sellPrice) * 100);
  const spreadPercent = ((buyPrice - sellPrice) / buyPrice * 100).toFixed(1);
  
  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setShowSheet(true); }}
        className={`inline-flex items-center gap-1 text-muted-foreground hover:text-white transition-colors ${className}`}
        data-testid="button-spread-info"
      >
        <HelpCircle size={12} />
      </button>
      
      <SpreadExplainerSheet 
        open={showSheet} 
        onClose={() => setShowSheet(false)}
        buyPrice={buyPrice}
        sellPrice={sellPrice}
        direction={direction}
      />
    </>
  );
}

interface SpreadExplainerSheetProps {
  open: boolean;
  onClose: () => void;
  buyPrice?: number;
  sellPrice?: number;
  direction?: 'YES' | 'NO';
}

export function SpreadExplainerSheet({ open, onClose, buyPrice, sellPrice, direction = 'YES' }: SpreadExplainerSheetProps) {
  const showExample = buyPrice === undefined || sellPrice === undefined;
  const displayBuyPrice = buyPrice ?? 0.60;
  const displaySellPrice = sellPrice ?? 0.52;
  const spreadCents = Math.round((displayBuyPrice - displaySellPrice) * 100);
  const spreadPercent = displayBuyPrice > 0 ? ((displayBuyPrice - displaySellPrice) / displayBuyPrice * 100).toFixed(1) : '0';
  
  return (
    <Drawer open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DrawerContent className="max-h-[85vh] bg-zinc-900 border-zinc-800">
        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Why Estimates Vary</h2>
            <DrawerClose asChild>
              <button className="p-2 rounded-full hover:bg-white/10" data-testid="button-close-spread">
                <X size={20} />
              </button>
            </DrawerClose>
          </div>
          
          <div className="bg-zinc-800 rounded-xl p-4 space-y-3">
            <div className="text-xs text-center text-muted-foreground mb-2">
              {showExample ? 'Example spread' : 'Current market spread'}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-[#1ED78B]/20 text-[#1ED78B]`}>
                  <TrendingUp size={16} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Buy at</div>
                  <div className="font-bold">{(displayBuyPrice * 100).toFixed(0)}¢</div>
                </div>
              </div>
              <ArrowRight size={20} className="text-muted-foreground" />
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Sell at</div>
                  <div className="font-bold text-amber-400">{(displaySellPrice * 100).toFixed(0)}¢</div>
                </div>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/20 text-amber-400">
                  <TrendingDown size={16} />
                </div>
              </div>
            </div>
            
            <div className="flex justify-center">
              <div className="bg-zinc-700 rounded-lg px-3 py-1.5">
                <span className="text-amber-400 font-bold">{spreadCents}¢ gap</span>
                <span className="text-muted-foreground text-sm ml-1">({spreadPercent}%)</span>
              </div>
            </div>
          </div>
          
          <div className="space-y-4 text-sm">
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                1
              </div>
              <div>
                <div className="font-medium">What is the bid-ask spread?</div>
                <p className="text-muted-foreground mt-1">
                  The difference between what buyers pay (ask) and what sellers receive (bid). This gap exists because buyers and sellers don't always agree on the exact value.
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                2
              </div>
              <div>
                <div className="font-medium">Why does it affect my value?</div>
                <p className="text-muted-foreground mt-1">
                  The "Value" shown uses the sell price (bid), so it may look lower than what you paid. This doesn't mean you're losing money - it just reflects what you'd get if you sold right now.
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                3
              </div>
              <div>
                <div className="font-medium">When does it matter?</div>
                <p className="text-muted-foreground mt-1">
                  Only if you sell before the market resolves. If you hold and your prediction is correct, you'll receive $1 per share regardless of the spread!
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex gap-2">
            <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-200">
              High-volume markets typically have tighter spreads (smaller gaps). The spread can change as new buyers and sellers enter the market.
            </p>
          </div>
          
          <DrawerClose asChild>
            <Button 
              className="w-full py-5"
              data-testid="button-got-it"
            >
              Got it
            </Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

interface SpreadIndicatorProps {
  buyPrice: number;
  sellPrice: number;
  showLabel?: boolean;
  className?: string;
}

export function SpreadIndicator({ buyPrice, sellPrice, showLabel = true, className = '' }: SpreadIndicatorProps) {
  const spreadCents = Math.round((buyPrice - sellPrice) * 100);
  const isWide = spreadCents >= 10;
  const isTight = spreadCents <= 3;
  
  const colorClass = isTight 
    ? 'text-[#1ED78B]' 
    : isWide 
      ? 'text-amber-400' 
      : 'text-muted-foreground';
  
  return (
    <span className={`text-xs ${colorClass} ${className}`}>
      {showLabel && 'Spread: '}{spreadCents}¢
    </span>
  );
}
