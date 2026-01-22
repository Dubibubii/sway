import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useMotionValue, useTransform, useAnimation, PanInfo } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Share2, X, Check, Copy, Wifi } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import { useToast } from '@/hooks/use-toast';
import { getBalancedPercentages } from '@/lib/api';

const LONG_PRESS_DURATION = 800; // 800ms for long press

interface MarketData {
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
  isLive?: boolean;
  eventTicker?: string;
}

interface SwipeCardProps {
  market: MarketData;
  onSwipe: (direction: 'left' | 'right' | 'down') => void;
  onLongPress?: () => void;
  active: boolean;
}

export function SwipeCard({ market, onSwipe, onLongPress, active }: SwipeCardProps) {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const loadedImageUrlRef = useRef<string | null>(null);
  
  // Each card has its own completely isolated motion values
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const controls = useAnimation();
  const exitDirectionRef = useRef<'left' | 'right' | 'down' | null>(null);
  
  // Long press detection
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);
  const hasDraggedRef = useRef(false);

  // Preload the image - only reset if URL actually changed
  useEffect(() => {
    if (market.imageUrl) {
      // Only reset if the URL is different from what we already loaded
      if (loadedImageUrlRef.current !== market.imageUrl) {
        setImageLoaded(false);
        const img = new Image();
        img.onload = () => {
          loadedImageUrlRef.current = market.imageUrl || null;
          setImageLoaded(true);
        };
        img.onerror = () => setImageLoaded(false);
        img.src = market.imageUrl;
      }
    }
  }, [market.imageUrl]);
  
  const handlePointerDown = useCallback(() => {
    if (!active || !onLongPress) return;
    
    isLongPressRef.current = false;
    hasDraggedRef.current = false;
    
    longPressTimerRef.current = setTimeout(() => {
      if (!hasDraggedRef.current) {
        isLongPressRef.current = true;
        onLongPress();
      }
    }, LONG_PRESS_DURATION);
  }, [active, onLongPress]);
  
  const handlePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);
  
  const handleDragStart = useCallback(() => {
    hasDraggedRef.current = true;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const getShareUrl = () => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/market/${market.id}`;
  };

  const getShareText = () => {
    const { yesPercent } = getBalancedPercentages(market.yesPrice, market.noPrice);
    return `${market.question} - Currently at ${yesPercent}% YES on SWAY`;
  };

  const shareToTwitter = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = encodeURIComponent(getShareText());
    const url = encodeURIComponent(getShareUrl());
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
    setShowShareMenu(false);
  };

  const shareToFacebook = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = encodeURIComponent(getShareUrl());
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
    setShowShareMenu(false);
  };

  const copyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(getShareUrl());
      toast({
        title: "Link copied!",
        description: "Share this market with your friends",
      });
    } catch {
      toast({
        title: "Failed to copy",
        variant: "destructive",
      });
    }
    setShowShareMenu(false);
  };

  const handleShareClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowShareMenu(!showShareMenu);
  };

  // Rotation based on x position
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  
  // Smoothly transition the back card to become the front card
  // The back card springs from center (scaled down) to full size - "zoom in" effect
  useEffect(() => {
    // Always reset motion values to ensure clean state
    x.set(0);
    y.set(0);
    
    if (active) {
      // Immediate reset of position, then animate scale for bouncy "pop" effect
      controls.set({ x: 0, y: 0, scale: 0.8, opacity: 0.7 }); // Start smaller and slightly faded
      controls.start({ 
        scale: 1, 
        opacity: 1,
        transition: { 
          type: "spring", 
          stiffness: 500,  // Higher = faster initial burst
          damping: 12,     // Lower = more pronounced bounce
          mass: 0.6,       // Lower = snappier, more elastic
        }
      });
    } else {
      // Back card: centered but smaller (ready to "pop" when it becomes active)
      controls.set({ x: 0, y: 0 }); // Always centered
      controls.start({
        scale: 0.88,
        opacity: 0.6,
        transition: { duration: 0.15 }
      });
    }
  }, [active, controls, x, y]);

  // Opacity of overlays - only show on ACTIVE card and only the dominant direction
  // Inactive cards never show overlays to prevent bleed-through from previous swipes
  const yesOpacity = useTransform(() => {
    if (!active) return 0; // Never show overlay on inactive cards
    const xVal = x.get();
    const yVal = y.get();
    // Only show YES if horizontal movement is dominant
    if (xVal > 0 && Math.abs(xVal) > Math.abs(yVal)) {
      return Math.min(1, Math.max(0, (xVal - 60) / 100));
    }
    return 0;
  });
  const noOpacity = useTransform(() => {
    if (!active) return 0; // Never show overlay on inactive cards
    const xVal = x.get();
    const yVal = y.get();
    // Only show NO if horizontal movement is dominant
    if (xVal < 0 && Math.abs(xVal) > Math.abs(yVal)) {
      return Math.min(1, Math.max(0, (-xVal - 60) / 100));
    }
    return 0;
  });
  const skipOpacity = useTransform(() => {
    if (!active) return 0; // Never show overlay on inactive cards
    const xVal = x.get();
    const yVal = y.get();
    // Only show SKIP if vertical movement is dominant
    if (yVal > 0 && Math.abs(yVal) > Math.abs(xVal)) {
      return Math.min(1, Math.max(0, (yVal - 60) / 100));
    }
    return 0;
  });

  const handleDragEnd = async (event: any, info: PanInfo) => {
    const velocity = info.velocity;
    // Use current position (where thumb is NOW) not offset (total distance traveled)
    const currentX = x.get();
    const currentY = y.get();

    // Higher thresholds to prevent accidental swipes
    const SWIPE_THRESHOLD = 130;
    const VELOCITY_THRESHOLD = 800;
    const MIN_POSITION_FOR_VELOCITY = 70;

    // Determine dominant direction - horizontal vs vertical
    const isHorizontalDominant = Math.abs(currentX) > Math.abs(currentY);
    const horizontalVelocityDominant = Math.abs(velocity.x) > Math.abs(velocity.y);

    // Swipe Right (YES) - horizontal dominant AND positive X
    if (isHorizontalDominant && (currentX > SWIPE_THRESHOLD || (velocity.x > VELOCITY_THRESHOLD && horizontalVelocityDominant && currentX > MIN_POSITION_FOR_VELOCITY))) {
      exitDirectionRef.current = 'right';
      onSwipe('right');
    } 
    // Swipe Left (NO) - horizontal dominant AND negative X
    else if (isHorizontalDominant && (currentX < -SWIPE_THRESHOLD || (velocity.x < -VELOCITY_THRESHOLD && horizontalVelocityDominant && currentX < -MIN_POSITION_FOR_VELOCITY))) {
      exitDirectionRef.current = 'left';
      onSwipe('left');
    }
    // Swipe Down (SKIP) - vertical dominant AND positive Y
    else if (!isHorizontalDominant && (currentY > SWIPE_THRESHOLD || (velocity.y > VELOCITY_THRESHOLD && !horizontalVelocityDominant && currentY > MIN_POSITION_FOR_VELOCITY))) {
      exitDirectionRef.current = 'down';
      onSwipe('down');
    }
    // Reset - snap back to center
    else {
      x.set(0);
      y.set(0);
      controls.start({ x: 0, y: 0, scale: 1, opacity: 1 });
    }
  };

  // When external dragX/dragY are provided, they drive the animation
  // When dragging ends, controls takes over for the exit animation
  // This avoids conflicts between motion values and controls
  
  // Use stored exit direction (motion values may be reset before exit animation runs)
  const getExitAnimation = () => {
    const dir = exitDirectionRef.current;
    if (dir === 'down') return { y: 600, opacity: 0, transition: { duration: 0.3 } };
    if (dir === 'right') return { x: 600, opacity: 0, transition: { duration: 0.3 } };
    if (dir === 'left') return { x: -600, opacity: 0, transition: { duration: 0.3 } };
    return { opacity: 0, scale: 0.8, transition: { duration: 0.2 } };
  };

  return (
    <motion.div
      drag={active}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.7}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      animate={controls}
      initial={active ? { scale: 1, opacity: 1, x: 0, y: 0 } : { scale: 0.9, opacity: 0.5, x: 0, y: 0 }}
      exit={getExitAnimation()}
      style={active ? { x, y, rotate } : { rotate: 0 }}
      className={`absolute top-0 left-0 w-full h-full will-change-transform ${active ? 'z-[100] cursor-grab active:cursor-grabbing' : 'z-[50] pointer-events-none'}`}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <Card className="w-full h-full overflow-hidden relative rounded-3xl border-0 shadow-2xl bg-card text-card-foreground select-none">
        
        {/* Image Background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-black z-0" />
          {market.imageUrl && (
            <img 
              src={market.imageUrl} 
              alt={market.question}
              className={`absolute inset-0 w-full h-full object-cover z-10 transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImageLoaded(true)}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <div className="absolute inset-0 bg-black/30 z-20" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent z-30" />
        </div>

        {/* Overlays */}
        <motion.div style={{ opacity: yesOpacity }} className="absolute inset-0 bg-primary/40 z-20 flex items-start justify-center pt-20 pointer-events-none">
          <div className="border-4 border-primary rounded-xl px-6 py-2 transform -rotate-12 -translate-x-16">
            <span className="text-4xl font-bold text-white tracking-widest uppercase">YES</span>
          </div>
        </motion.div>

        <motion.div style={{ opacity: noOpacity }} className="absolute inset-0 bg-destructive/40 z-20 flex items-start justify-center pt-20 pointer-events-none">
          <div className="border-4 border-destructive rounded-xl px-6 py-2 transform rotate-12 translate-x-16">
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

          {market.yesLabel && market.yesLabel !== 'Yes' && (
            <div className="text-center">
              <span className="text-sm font-medium text-white bg-white/20 px-4 py-1.5 rounded-full backdrop-blur-sm border border-white/20">{market.yesLabel}</span>
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="bg-destructive/20 backdrop-blur-md rounded-2xl p-3 border border-destructive/30 flex flex-col items-center gap-2">
              <span className="text-lg font-bold text-white">No</span>
              <div className="flex items-center gap-1">
                <TrendingDown size={16} className="text-rose-400" />
                <span className="text-xl font-bold text-white tracking-tight">{getBalancedPercentages(market.yesPrice, market.noPrice).noPercent}%</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-zinc-500">If No:</span>
                <span className="text-zinc-400">${settings.noWager < 10 ? settings.noWager.toFixed(2) : settings.noWager}</span>
                <span className="text-zinc-500">→</span>
                <span className="text-rose-400 font-semibold">${(() => {
                  const returnVal = settings.noWager / market.noPrice;
                  return returnVal < 10 ? returnVal.toFixed(2) : returnVal.toFixed(0);
                })()}</span>
              </div>
            </div>
            <div className="bg-primary/20 backdrop-blur-md rounded-2xl p-3 border border-primary/30 flex flex-col items-center gap-2">
              <span className="text-lg font-bold text-white">Yes</span>
              <div className="flex items-center gap-1">
                <TrendingUp size={16} className="text-[#1ED78B]" />
                <span className="text-xl font-bold text-white tracking-tight">{getBalancedPercentages(market.yesPrice, market.noPrice).yesPercent}%</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-zinc-500">If Yes:</span>
                <span className="text-zinc-400">${settings.yesWager < 10 ? settings.yesWager.toFixed(2) : settings.yesWager}</span>
                <span className="text-zinc-500">→</span>
                <span className="text-[#1ED78B] font-semibold">${(() => {
                  const returnVal = settings.yesWager / market.yesPrice;
                  return returnVal < 10 ? returnVal.toFixed(2) : returnVal.toFixed(0);
                })()}</span>
              </div>
            </div>
          </div>
          
          <div className="flex justify-between items-center text-white/60 text-sm mt-2">
             <span>Vol: {market.volume}</span>
             <div className="relative">
               <button 
                 onClick={handleShareClick}
                 className="p-2 rounded-full hover:bg-white/10 transition-colors"
                 data-testid="button-share"
               >
                 <Share2 size={18} />
               </button>
               
               {showShareMenu && (
                 <div 
                   className="absolute bottom-full right-0 mb-2 bg-zinc-900/95 backdrop-blur-xl rounded-xl border border-white/10 shadow-2xl overflow-hidden z-50"
                   onClick={(e) => e.stopPropagation()}
                 >
                   <button 
                     onClick={shareToTwitter}
                     className="flex items-center gap-3 px-4 py-3 w-full hover:bg-white/10 transition-colors text-white text-sm"
                     data-testid="button-share-twitter"
                   >
                     <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                     <span>Share on X</span>
                   </button>
                   <button 
                     onClick={shareToFacebook}
                     className="flex items-center gap-3 px-4 py-3 w-full hover:bg-white/10 transition-colors text-white text-sm"
                     data-testid="button-share-facebook"
                   >
                     <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                     <span>Share on Facebook</span>
                   </button>
                   <button 
                     onClick={copyLink}
                     className="flex items-center gap-3 px-4 py-3 w-full hover:bg-white/10 transition-colors text-white text-sm"
                     data-testid="button-copy-link"
                   >
                     <Copy size={16} />
                     <span>Copy Link</span>
                   </button>
                 </div>
               )}
             </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
