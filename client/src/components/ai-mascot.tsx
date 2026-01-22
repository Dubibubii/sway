import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import mascotImage from '@/assets/mascot.png';

interface AIMascotProps {
  marketTitle: string;
  category?: string;
  yesPrice: number;
  noPrice: number;
  className?: string;
  alignRight?: boolean; // When true, popup opens to the left
}

export function AIMascot({ marketTitle, category, yesPrice, noPrice, className = '', alignRight = false }: AIMascotProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchInsight = async () => {
    if (hasFetched || isLoading) return;
    
    setIsLoading(true);
    setHasError(false);
    
    try {
      const response = await fetch('/api/ai/market-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketTitle,
          category,
          yesPrice,
          noPrice,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setInsight(data.insight);
      } else {
        setHasError(true);
        setInsight('Tap me again for insights!');
      }
    } catch (err) {
      setHasError(true);
      setInsight('Could not load insight right now.');
    } finally {
      setIsLoading(false);
      setHasFetched(true);
    }
  };

  const handleTap = () => {
    if (!isExpanded) {
      setIsExpanded(true);
      if (!hasFetched) {
        fetchInsight();
      }
    } else {
      setIsExpanded(false);
    }
  };

  useEffect(() => {
    setHasFetched(false);
    setInsight(null);
    setIsExpanded(false);
  }, [marketTitle]);

  return (
    <div className={`absolute top-3 left-3 z-[200] ${className}`}>
      <motion.button
        onClick={handleTap}
        whileTap={{ scale: 0.9 }}
        animate={isExpanded ? {} : { 
          y: [0, -3, 0],
        }}
        transition={isExpanded ? {} : {
          y: { repeat: Infinity, duration: 2, repeatDelay: 3 }
        }}
        className="relative w-10 h-10 rounded-full overflow-hidden shadow-lg border-2 border-[#1ED78B]/50 bg-black"
        data-testid="button-ai-mascot"
      >
        <img
          src={mascotImage}
          alt="AI Assistant"
          className="w-full h-full object-cover"
        />
        
        {!hasFetched && !isExpanded && (
          <motion.div 
            className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#1ED78B] rounded-full flex items-center justify-center"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            <span className="text-[8px] font-bold text-black">!</span>
          </motion.div>
        )}
      </motion.button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
            className={`absolute top-12 w-[calc(100vw-48px)] max-w-[340px] bg-zinc-900/95 backdrop-blur-sm rounded-2xl p-4 shadow-2xl border border-zinc-700 z-[300] ${alignRight ? 'right-0' : 'left-0'}`}
          >
            <div className={`absolute -top-2 w-4 h-4 bg-zinc-900 border-l border-t border-zinc-700 rotate-45 ${alignRight ? 'right-4' : 'left-4'}`} />
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(false);
              }}
              className="absolute top-2 right-2 p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 z-10"
              data-testid="button-close-ai-insight"
            >
              <X size={16} className="text-white" />
            </button>
            
            <div className="pr-6 max-h-[180px] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-zinc-300">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Thinking...</span>
                </div>
              ) : (
                <p className="text-sm text-white leading-relaxed">
                  {insight || 'Tap to get AI insights!'}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
