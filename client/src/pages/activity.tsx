import { useState } from 'react';
import { Layout } from '@/components/layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Clock, CheckCircle2, Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Activity() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const activePositions = [
    {
      id: '1',
      title: 'Will Bitcoin hit $100k?',
      type: 'YES',
      shares: 15,
      avgPrice: 32,
      pnl: 12.40,
      pnlPercent: 24,
      isPositive: true,
      variant: 'primary' as const
    },
    {
      id: '2',
      title: 'Fed Rate Cut March?',
      type: 'NO',
      shares: 50,
      avgPrice: 85,
      pnl: -2.50,
      pnlPercent: -1.2,
      isPositive: false,
      variant: 'destructive' as const
    }
  ];

  const handleCardClick = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <Layout>
      <div className="min-h-screen bg-background px-6 pb-24 pt-28 overflow-y-auto">
        <h1 className="text-3xl font-display font-bold mb-6">Activity</h1>

        <div className="space-y-4">
           {/* Active Positions */}
           <div className="mb-8">
             <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Active Positions</h2>
             
             <div className="space-y-3">
               {activePositions.map((position) => (
                 <Card 
                    key={position.id} 
                    className={`glass-panel border-0 transition-all duration-200 cursor-pointer overflow-hidden ${expandedId === position.id ? 'ring-1 ring-white/20 bg-white/5' : 'hover:bg-white/5'}`}
                    onClick={() => handleCardClick(position.id)}
                 >
                   <CardContent className="p-0">
                     <div className="p-4 flex items-center gap-4">
                       <div className={`w-12 h-12 rounded-xl bg-${position.variant}/10 flex items-center justify-center text-${position.variant}`}>
                          {position.isPositive ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                       </div>
                       <div className="flex-1">
                          <h3 className="font-bold text-sm leading-tight">{position.title}</h3>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="secondary" className={`bg-${position.variant}/20 text-${position.variant} hover:bg-${position.variant}/20 text-[10px] h-5`}>
                              {position.type}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{position.shares} shares @ {position.avgPrice}¢</span>
                          </div>
                       </div>
                       <div className="text-right">
                          <div className={`font-mono font-bold ${position.isPositive ? 'text-green-400' : 'text-white/60'}`}>
                            {position.pnl > 0 ? '+' : ''}${Math.abs(position.pnl).toFixed(2)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {position.pnlPercent > 0 ? '+' : ''}{position.pnlPercent}%
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
                             <Button className="flex-1 h-9 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20" variant="outline" size="sm">
                               <Plus size={16} className="mr-2" /> Add
                             </Button>
                             <Button className="flex-1 h-9 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20" variant="outline" size="sm">
                               <X size={16} className="mr-2" /> Close
                             </Button>
                           </div>
                         </motion.div>
                       )}
                     </AnimatePresence>
                   </CardContent>
                 </Card>
               ))}
             </div>
           </div>

           {/* History */}
           <div>
             <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">History</h2>
             
             <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between border-b border-white/5 pb-4">
                     <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-white/5">
                           <Clock size={16} className="text-muted-foreground" />
                        </div>
                        <div>
                           <div className="text-sm font-medium">Sold YES - Taylor Swift</div>
                           <div className="text-xs text-muted-foreground">Dec 10, 2:30 PM</div>
                        </div>
                     </div>
                     <span className="font-mono text-sm text-white">+$45.00</span>
                  </div>
                ))}
             </div>
           </div>
        </div>
      </div>
    </Layout>
  );
}
