import { useState } from 'react';
import { Layout } from '@/components/layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Clock, Plus, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { usePrivySafe } from '@/hooks/use-privy-safe';

interface Trade {
  id: string;
  marketId: string;
  marketTitle: string;
  marketCategory: string | null;
  direction: string;
  wagerAmount: number;
  price: string;
  shares: string;
  estimatedPayout: string;
  isClosed: boolean;
  closedAt: string | null;
  pnl: string | null;
  createdAt: string;
}

export default function Activity() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { getAccessToken, authenticated } = usePrivySafe();

  const { data: positionsData, isLoading: positionsLoading } = useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      const token = await getAccessToken();
      const res = await fetch('/api/positions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch positions');
      return res.json() as Promise<{ positions: Trade[] }>;
    },
    enabled: authenticated,
  });

  const { data: tradesData, isLoading: tradesLoading } = useQuery({
    queryKey: ['trades'],
    queryFn: async () => {
      const token = await getAccessToken();
      const res = await fetch('/api/trades', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch trades');
      return res.json() as Promise<{ trades: Trade[] }>;
    },
    enabled: authenticated,
  });

  const activePositions = positionsData?.positions || [];
  const closedTrades = tradesData?.trades.filter(t => t.isClosed) || [];

  const handleCardClick = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const totalValue = activePositions.reduce((acc, pos) => {
    const shares = parseFloat(pos.shares);
    const price = parseFloat(pos.price);
    const currentValue = shares * price;
    return acc + currentValue;
  }, 0);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  if (!authenticated) {
    return (
      <Layout>
        <div className="min-h-screen bg-background px-6 pb-24 pt-28 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <p>Sign in to view your activity</p>
          </div>
        </div>
      </Layout>
    );
  }

  const isLoading = positionsLoading || tradesLoading;

  return (
    <Layout>
      <div className="min-h-screen bg-background px-6 pb-24 pt-28 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-display font-bold">Activity</h1>
          <div className="text-right">
             <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Portfolio Value</div>
             <div className="text-xl font-mono font-bold text-emerald-400">${totalValue.toFixed(2)}</div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
             {/* Active Positions */}
             <div className="mb-8">
               <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Active Positions</h2>
               
               {activePositions.length === 0 ? (
                 <div className="text-center py-8 text-muted-foreground text-sm">
                   No active positions. Swipe on markets to place bets!
                 </div>
               ) : (
                 <div className="space-y-3">
                   {activePositions.map((position) => {
                     const isYes = position.direction === 'YES';
                     const shares = parseFloat(position.shares);
                     const price = parseFloat(position.price);
                     const estimatedPayout = parseFloat(position.estimatedPayout);
                     const costBasis = position.wagerAmount;
                     const currentValue = shares * price;
                     const pnl = currentValue - costBasis;
                     const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
                     
                     return (
                       <Card 
                          key={position.id} 
                          className={`glass-panel border-0 transition-all duration-200 cursor-pointer overflow-hidden ${expandedId === position.id ? 'ring-1 ring-white/20 bg-white/5' : 'hover:bg-white/5'}`}
                          onClick={() => handleCardClick(position.id)}
                          data-testid={`card-position-${position.id}`}
                       >
                         <CardContent className="p-0">
                           <div className="p-4 flex items-center gap-4">
                             <div className={`w-12 h-12 rounded-xl ${isYes ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'} flex items-center justify-center`}>
                                {pnl >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                             </div>
                             <div className="flex-1">
                                <h3 className="font-bold text-sm leading-tight">{position.marketTitle}</h3>
                                <div className="flex gap-2 mt-1">
                                  <Badge variant="secondary" className={`${isYes ? 'bg-emerald-500/20 text-emerald-500' : 'bg-rose-500/20 text-rose-500'} hover:bg-opacity-20 text-[10px] h-5`}>
                                    {position.direction}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">{shares.toFixed(0)} shares @ {(price * 100).toFixed(0)}¢</span>
                                </div>
                             </div>
                             <div className="text-right">
                                <div className={`font-mono font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%
                                </div>
                             </div>
                           </div>

                           <AnimatePresence>
                             {expandedId === position.id && (
                               <motion.div
                                 initial={{ height: 0, opacity: 0 }}
                                 animate={{ height: 'auto', opacity: 1 }}
                                 exit={{ height: 0, opacity: 0 }}
                                 transition={{ duration: 0.2 }}
                                 className="border-t border-white/5 bg-black/20"
                               >
                                 <div className="flex p-2 gap-2">
                                   <Button className="flex-1 h-9 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20" variant="outline" size="sm" data-testid={`button-add-${position.id}`}>
                                     <Plus size={16} className="mr-2" /> Add
                                   </Button>
                                   <Button className="flex-1 h-9 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20" variant="outline" size="sm" data-testid={`button-close-${position.id}`}>
                                     <X size={16} className="mr-2" /> Close
                                   </Button>
                                 </div>
                               </motion.div>
                             )}
                           </AnimatePresence>
                         </CardContent>
                       </Card>
                     );
                   })}
                 </div>
               )}
             </div>

             {/* History */}
             <div>
               <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">History</h2>
               
               {closedTrades.length === 0 ? (
                 <div className="text-center py-8 text-muted-foreground text-sm">
                   No trade history yet
                 </div>
               ) : (
                 <div className="space-y-4">
                    {closedTrades.map((trade) => {
                      const pnl = parseFloat(trade.pnl || '0');
                      return (
                        <div key={trade.id} className="flex items-center justify-between border-b border-white/5 pb-4" data-testid={`history-trade-${trade.id}`}>
                           <div className="flex items-center gap-3">
                              <div className="p-2 rounded-full bg-white/5">
                                 <Clock size={16} className="text-muted-foreground" />
                              </div>
                              <div>
                                 <div className="text-sm font-medium">
                                   {pnl >= 0 ? 'Won' : 'Lost'} {trade.direction} - {trade.marketTitle}
                                 </div>
                                 <div className="text-xs text-muted-foreground">{formatDate(trade.closedAt || trade.createdAt)}</div>
                              </div>
                           </div>
                           <span className={`font-mono text-sm ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                             {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
                           </span>
                        </div>
                      );
                    })}
                 </div>
               )}
             </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
