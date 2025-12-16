import { motion, useMotionValue, useTransform, useAnimation, PanInfo, MotionValue } from 'framer-motion';
import { Market } from '@/lib/mock-data';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Info } from 'lucide-react';

import { useSettings } from '@/hooks/use-settings';

interface SwipeCardProps {
  market: Market;
  onSwipe: (direction: 'left' | 'right' | 'down') => void;
  active: boolean;
  dragX?: MotionValue<number>;
  dragY?: MotionValue<number>;
}

export function SwipeCard({ market, onSwipe, active, dragX, dragY }: SwipeCardProps) {
  const { settings } = useSettings();
  const localX = useMotionValue(0);
  const localY = useMotionValue(0);
  const controls = useAnimation();

  // Use passed motion values if active, otherwise local (though inactive cards don't drag)
  const x = dragX || localX;
  const y = dragY || localY;

  // Rotation based on x position
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  
  // Scale based on active state (if it's the back card, scale it down)
  const scale = active ? 1 : 0.95;
  const opacity = active ? 1 : 0.6; // Fade out the back card slightly
  const yOffset = active ? 0 : 20; // Move back card down slightly

  // Opacity of overlays
  const yesOpacity = useTransform(x, [50, 150], [0, 1]);
  const noOpacity = useTransform(x, [-50, -150], [0, 1]);
  const skipOpacity = useTransform(y, [50, 150], [0, 1]);

  const handleDragEnd = async (event: any, info: PanInfo) => {
    const offset = info.offset;
    const velocity = info.velocity;

    // Swipe Right (YES)
    if (offset.x > 100 || velocity.x > 500) {
      await controls.start({ x: 500, opacity: 0 });
      onSwipe('right');
    } 
    // Swipe Left (NO)
    else if (offset.x < -100 || velocity.x < -500) {
      await controls.start({ x: -500, opacity: 0 });
      onSwipe('left');
    }
    // Swipe Down (SKIP)
    else if (offset.y > 100 || velocity.y > 500) {
      await controls.start({ y: 500, opacity: 0 });
      onSwipe('down');
    }
    // Reset
    else {
      controls.start({ x: 0, y: 0 });
    }
  };

  return (
    <motion.div
      drag={active ? true : false}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      onDragEnd={handleDragEnd}
      animate={controls}
      style={{ x, y, rotate, scale, opacity, top: yOffset }}
      className={`absolute top-0 left-0 w-full h-full ${active ? 'z-50 cursor-grab active:cursor-grabbing' : 'z-40 pointer-events-none'}`}
      whileTap={{ scale: 1.05 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="w-full h-full overflow-hidden relative rounded-3xl border-0 shadow-2xl bg-card text-card-foreground select-none">
        
        {/* Image Background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10" />
          <div className="absolute inset-0 bg-black/40 z-0" />
          <img 
            src={market.imageUrl} 
            alt="Market" 
            className="w-full h-full object-cover"
          />
        </div>

        {/* Overlays */}
        <motion.div style={{ opacity: yesOpacity }} className="absolute inset-0 bg-primary/40 z-20 flex items-center justify-center pointer-events-none">
          <div className="border-4 border-primary rounded-xl px-6 py-2 transform -rotate-12">
            <span className="text-4xl font-bold text-white tracking-widest uppercase">YES</span>
          </div>
        </motion.div>

        <motion.div style={{ opacity: noOpacity }} className="absolute inset-0 bg-destructive/40 z-20 flex items-center justify-center pointer-events-none">
          <div className="border-4 border-destructive rounded-xl px-6 py-2 transform rotate-12">
            <span className="text-4xl font-bold text-white tracking-widest uppercase">NO</span>
          </div>
        </motion.div>

        <motion.div style={{ opacity: skipOpacity }} className="absolute inset-0 bg-blue-500/40 z-20 flex items-start justify-center pt-20 pointer-events-none">
          <div className="border-4 border-blue-500 rounded-xl px-6 py-2">
            <span className="text-4xl font-bold text-white tracking-widest uppercase">SKIP</span>
          </div>
        </motion.div>

        {/* Content */}
        <div className="absolute bottom-0 left-0 w-full p-6 z-30 flex flex-col gap-4">
          <div className="flex gap-2">
            <Badge variant="secondary" className="bg-white/20 hover:bg-white/30 text-white backdrop-blur-md border-0">
              {market.category}
            </Badge>
            <Badge variant="outline" className="text-white border-white/20 backdrop-blur-md">
              Ends {market.endDate}
            </Badge>
          </div>

          <h2 className="text-xl font-display font-bold leading-tight text-white drop-shadow-md">
            {market.question}
          </h2>

          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="bg-destructive/20 backdrop-blur-md rounded-2xl p-2 border border-destructive/30 flex flex-col items-center">
              <span className="text-[10px] font-medium text-rose-200 uppercase tracking-wider">No Chance</span>
              <div className="flex flex-col items-center gap-0">
                <div className="flex items-center gap-1">
                   <TrendingDown size={16} className="text-rose-400" />
                   <span className="text-xl font-bold text-white tracking-tight">{Math.round(market.noPrice * 100)}%</span>
                </div>
                <span className="text-[10px] font-medium text-rose-200/80">Payout: ${(settings.noWager / market.noPrice).toFixed(2)}</span>
              </div>
            </div>
            <div className="bg-primary/20 backdrop-blur-md rounded-2xl p-2 border border-primary/30 flex flex-col items-center">
              <span className="text-[10px] font-medium text-emerald-200 uppercase tracking-wider">Yes Chance</span>
              <div className="flex flex-col items-center gap-0">
                <div className="flex items-center gap-1">
                   <TrendingUp size={16} className="text-emerald-400" />
                   <span className="text-xl font-bold text-white tracking-tight">{Math.round(market.yesPrice * 100)}%</span>
                </div>
                <span className="text-[10px] font-medium text-emerald-200/80">Payout: ${(settings.yesWager / market.yesPrice).toFixed(2)}</span>
              </div>
            </div>
          </div>
          
          <div className="flex justify-between items-center text-white/60 text-sm mt-2">
             <span>Vol: {market.volume}</span>
             <Info size={18} />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
