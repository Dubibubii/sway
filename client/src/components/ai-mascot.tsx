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
}

export function AIMascot({ marketTitle, category, yesPrice, noPrice, className = '' }: AIMascotProps) {
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
    <div className={`absolute top-3 left-3 z-50 ${className}`}>
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
            className="absolute top-12 left-0 w-64 bg-zinc-900/95 backdrop-blur-xl rounded-2xl p-4 shadow-xl border border-white/10"
          >
            <div className="absolute -top-2 left-4 w-4 h-4 bg-zinc-900/95 border-l border-t border-white/10 rotate-45" />
            
            <button
              onClick={() => setIsExpanded(false)}
              className="absolute top-2 right-2 p-1 rounded-full hover:bg-white/10"
            >
              <X size={14} className="text-white/50" />
            </button>
            
            <div className="pr-6">
              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-white/70">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Thinking...</span>
                </div>
              ) : (
                <p className="text-sm text-white/90 leading-relaxed">
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
