import { Layout } from '@/components/layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Clock, CheckCircle2 } from 'lucide-react';

export default function Activity() {
  return (
    <Layout>
      <div className="min-h-screen bg-background p-6 pb-24 overflow-y-auto">
        <h1 className="text-3xl font-display font-bold mb-6 mt-4">Activity</h1>

        <div className="space-y-4">
           {/* Active Positions */}
           <div className="mb-8">
             <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Active Positions</h2>
             
             <Card className="glass-panel border-0 mb-3">
               <CardContent className="p-4 flex items-center gap-4">
                 <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <TrendingUp size={24} />
                 </div>
                 <div className="flex-1">
                    <h3 className="font-bold text-sm leading-tight">Will Bitcoin hit $100k?</h3>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="secondary" className="bg-primary/20 text-primary hover:bg-primary/20 text-[10px] h-5">YES</Badge>
                      <span className="text-xs text-muted-foreground">15 shares @ 32¢</span>
                    </div>
                 </div>
                 <div className="text-right">
                    <div className="font-mono font-bold text-green-400">+$12.40</div>
                    <div className="text-xs text-muted-foreground">+24%</div>
                 </div>
               </CardContent>
             </Card>

             <Card className="glass-panel border-0">
               <CardContent className="p-4 flex items-center gap-4">
                 <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive">
                    <TrendingDown size={24} />
                 </div>
                 <div className="flex-1">
                    <h3 className="font-bold text-sm leading-tight">Fed Rate Cut March?</h3>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="secondary" className="bg-destructive/20 text-destructive hover:bg-destructive/20 text-[10px] h-5">NO</Badge>
                      <span className="text-xs text-muted-foreground">50 shares @ 85¢</span>
                    </div>
                 </div>
                 <div className="text-right">
                    <div className="font-mono font-bold text-white/60">-$2.50</div>
                    <div className="text-xs text-muted-foreground">-1.2%</div>
                 </div>
               </CardContent>
             </Card>
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
