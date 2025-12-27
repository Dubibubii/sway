import { useState } from 'react';
import { Layout } from '@/components/layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Clock, Plus, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePrivySafe } from '@/hooks/use-privy-safe';
import { useSolanaTransaction } from '@/hooks/use-solana-transaction';
import { useSolanaBalance } from '@/hooks/use-solana-balance';
import { usePondTrading } from '@/hooks/use-pond-trading';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { FEE_CONFIG } from '@shared/schema';

interface Trade {
  id: string;
  marketId: string;
  marketTitle: string;
  marketCategory: string | null;
  direction: string;
  wagerAmount: number; // Stored in cents
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
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Trade | null>(null);
  const [addAmount, setAddAmount] = useState('5');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const { toast } = useToast();
  const { getAccessToken, authenticated, embeddedWallet } = usePrivySafe();
  const { sendSOLWithFee } = useSolanaTransaction();
  const { usdcBalance, refetch: refetchBalance } = useSolanaBalance(embeddedWallet?.address || null);
  const { placeTrade: placePondTrade, sellPosition, isTrading: isPondTrading } = usePondTrading();
  const queryClient = useQueryClient();

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

  const handleAddClick = (e: React.MouseEvent, position: Trade) => {
    e.stopPropagation();
    setSelectedPosition(position);
    setAddAmount('5');
    setAddModalOpen(true);
  };

  const handleCloseClick = (e: React.MouseEvent, position: Trade) => {
    e.stopPropagation();
    setSelectedPosition(position);
    setCloseModalOpen(true);
  };

  const handleAddPosition = async () => {
    if (!selectedPosition) return;
    
    const amount = parseFloat(addAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Invalid Amount', description: 'Please enter a valid amount', variant: 'destructive' });
      return;
    }

    // Minimum trade amount for DFlow
    const MIN_TRADE_AMOUNT = 0.50;
    if (amount < MIN_TRADE_AMOUNT) {
      toast({ title: 'Amount Too Small', description: `Minimum trade amount is $${MIN_TRADE_AMOUNT.toFixed(2)}`, variant: 'destructive' });
      return;
    }

    // Check USDC balance
    if (usdcBalance !== undefined && usdcBalance < amount) {
      toast({ title: 'Insufficient Balance', description: `You have $${usdcBalance.toFixed(2)} but need $${amount.toFixed(2)}`, variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    try {
      // Execute on-chain trade via Pond/DFlow
      const side = selectedPosition.direction.toLowerCase() as 'yes' | 'no';
      console.log('[Activity] Starting add to position trade:', selectedPosition.marketId, side, amount);
      
      const result = await placePondTrade(
        selectedPosition.marketId, 
        side, 
        amount, 
        usdcBalance,
        embeddedWallet?.address
      );
      
      console.log('[Activity] Trade result:', result);
      
      if (!result.success) {
        const errorMsg = result.error || 'Trade failed';
        console.error('[Activity] Trade error:', errorMsg);
        
        // Provide user-friendly error message for common DFlow errors
        if (errorMsg.includes('zero_out_amount') || errorMsg.includes('Zero out amount')) {
          toast({ title: 'Trade Failed', description: 'Trade amount too small. Please increase your bet to at least $0.50', variant: 'destructive' });
        } else {
          toast({ title: 'Trade Failed', description: errorMsg, variant: 'destructive' });
        }
        setAddModalOpen(false);
        setIsProcessing(false);
        return;
      }
      
      // Record the trade in the database with actual shares from async trade polling
      const token = await getAccessToken();
      const currentPrice = parseFloat(selectedPosition.price);
      
      console.log('[Activity] Recording trade with actualShares:', result.actualShares, 'executionMode:', result.executionMode);
      
      const recordRes = await fetch('/api/trades', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          marketId: selectedPosition.marketId,
          marketTitle: selectedPosition.marketTitle,
          marketCategory: selectedPosition.marketCategory,
          direction: selectedPosition.direction,
          wagerAmount: amount,
          price: currentPrice,
          actualShares: result.actualShares, // Pass actual filled shares for async trades
          signature: result.signature,
          executionMode: result.executionMode,
        }),
      });
      
      if (!recordRes.ok) {
        console.error('[Activity] Failed to record trade in database');
      }
      
      // SUCCESS - Close modal and show success IMMEDIATELY
      setAddModalOpen(false);
      setIsProcessing(false);
      
      // Show prominent success toast
      toast({ title: 'Trade Executed', description: `Added $${amount.toFixed(2)} to your position!` });
      
      // Refresh balance and positions in background
      setTimeout(() => {
        refetchBalance();
        queryClient.invalidateQueries({ queryKey: ['positions'] });
        queryClient.invalidateQueries({ queryKey: ['trades'] });
      }, 2000);
      
    } catch (error: any) {
      console.error('[Activity] Catch block error:', error);
      toast({ title: 'Error', description: error.message || 'Failed to add to position', variant: 'destructive' });
      setIsProcessing(false);
    }
  };

  const handleClosePosition = async (overrideShares?: number) => {
    if (!selectedPosition) return;
    
    setIsProcessing(true);
    try {
      const shares = overrideShares || parseFloat(selectedPosition.shares);
      const costBasis = selectedPosition.wagerAmount / 100; // Convert cents to dollars
      const side = selectedPosition.direction.toLowerCase() as 'yes' | 'no';
      
      console.log('[Activity] Starting close position (sell):', selectedPosition.marketId, side, shares);
      
      // Execute on-chain sell via Pond/DFlow
      const result = await sellPosition(
        selectedPosition.marketId,
        side,
        shares,
        embeddedWallet?.address
      );
      
      console.log('[Activity] Sell result:', result);
      
      if (!result.success) {
        const errorMsg = result.error || 'Sell failed';
        console.error('[Activity] Sell error:', errorMsg);
        
        // Check if this is a partial fill situation where we can sell available tokens
        if (errorMsg.includes('only have') && errorMsg.includes('tokens available')) {
          // Extract the available amount from the error message
          const match = errorMsg.match(/only have ([\d.]+) tokens/);
          if (match) {
            const availableTokens = parseFloat(match[1]);
            // Silently retry with the available amount - no confusing notification
            setIsProcessing(false);
            return handleClosePosition(availableTokens);
          }
        }
        
        toast({ title: 'Sell Failed', description: errorMsg, variant: 'destructive' });
        setCloseModalOpen(false);
        setIsProcessing(false);
        return;
      }
      
      // Calculate PnL based on USDC received
      const usdcReceived = result.expectedUSDC || 0;
      const pnl = usdcReceived - costBasis;
      const pnlPercent = costBasis > 0 ? ((pnl / costBasis) * 100) : 0;
      
      console.log('[Activity] Position sold! USDC received:', usdcReceived, 'PnL:', pnl, 'PnL%:', pnlPercent);
      
      // Update the database
      const token = await getAccessToken();
      const res = await fetch(`/api/trades/${selectedPosition.id}/close`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          pnl: pnl.toFixed(2),
          payout: usdcReceived,
        }),
      });

      if (!res.ok) {
        console.error('[Activity] Failed to update database after sell');
      }

      // SUCCESS - Close modal and show success
      setCloseModalOpen(false);
      setIsProcessing(false);
      
      // Format: "Sold for $X.XX (+Y%)" - always positive since sale succeeded
      const pnlSign = pnl >= 0 ? '+' : '';
      toast({ 
        title: `Sold for $${usdcReceived.toFixed(2)} (${pnlSign}${pnlPercent.toFixed(0)}%)`, 
        description: 'Position closed successfully',
        variant: 'default'
      });
      
      // Refresh balance and positions in background
      setTimeout(() => {
        refetchBalance();
        queryClient.invalidateQueries({ queryKey: ['positions'] });
        queryClient.invalidateQueries({ queryKey: ['trades'] });
      }, 2000);
      
    } catch (error: any) {
      console.error('[Activity] Close position error:', error);
      toast({ title: 'Error', description: error.message || 'Failed to close position', variant: 'destructive' });
      setIsProcessing(false);
    }
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
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>Add to Position</DialogTitle>
            <DialogDescription>
              Add more to your {selectedPosition?.direction} position on "{selectedPosition?.marketTitle}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Amount ($)</label>
              <Input
                type="number"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                placeholder="5"
                min="0.50"
                step="0.10"
                className="bg-zinc-800 border-zinc-700"
                data-testid="input-add-amount"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setAddModalOpen(false)}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-[#1ED78B] hover:bg-[#19B878]"
                onClick={handleAddPosition}
                disabled={isProcessing}
                data-testid="button-confirm-add"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Add ${addAmount}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={closeModalOpen} onOpenChange={setCloseModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>Sell Position</DialogTitle>
            <DialogDescription>
              Sell your {selectedPosition?.direction} position on "{selectedPosition?.marketTitle}" and receive USDC back to your wallet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {selectedPosition && (
              <div className="bg-zinc-800 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Shares to Sell</span>
                  <span>{parseFloat(selectedPosition.shares).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Entry Price</span>
                  <span>{(parseFloat(selectedPosition.price) * 100).toFixed(0)}¢</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cost Basis</span>
                  <span>${(selectedPosition.wagerAmount / 100).toFixed(2)}</span>
                </div>
                <div className="border-t border-zinc-700 pt-2 flex justify-between text-sm font-bold">
                  <span>Est. Value (at entry price)</span>
                  <span>${(parseFloat(selectedPosition.shares) * parseFloat(selectedPosition.price)).toFixed(2)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Actual USDC received will depend on current market price and slippage.
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setCloseModalOpen(false)}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-rose-500 hover:bg-rose-600"
                onClick={() => handleClosePosition()}
                disabled={isProcessing}
                data-testid="button-confirm-sell"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Sell Position
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="min-h-screen bg-background px-6 pb-24 pt-28 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-display font-bold">Activity</h1>
          <div className="text-right">
             <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Portfolio Value</div>
             <div className="text-xl font-mono font-bold text-[#1ED78B]">${totalValue.toFixed(2)}</div>
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
                     const costBasis = position.wagerAmount / 100; // Convert cents to dollars
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
                             <div className={`w-12 h-12 rounded-xl ${isYes ? 'bg-[#1ED78B]/10 text-[#1ED78B]' : 'bg-rose-500/10 text-rose-500'} flex items-center justify-center`}>
                                {pnl >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                             </div>
                             <div className="flex-1">
                                <h3 className="font-bold text-sm leading-tight">{position.marketTitle}</h3>
                                <div className="flex gap-2 mt-1">
                                  <Badge variant="secondary" className={`${isYes ? 'bg-[#1ED78B]/20 text-[#1ED78B]' : 'bg-rose-500/20 text-rose-500'} hover:bg-opacity-20 text-[10px] h-5`}>
                                    {position.direction}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">{shares.toFixed(0)} shares @ {(price * 100).toFixed(0)}¢</span>
                                </div>
                             </div>
                             <div className="text-right">
                                <div className={`font-mono font-bold ${pnl >= 0 ? 'text-[#1ED78B]' : 'text-red-400'}`}>
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
                                   <Button 
                                     className="flex-1 h-9 bg-[#1ED78B]/10 hover:bg-[#1ED78B]/20 text-[#1ED78B] border border-[#1ED78B]/20" 
                                     variant="outline" 
                                     size="sm" 
                                     data-testid={`button-add-${position.id}`}
                                     onClick={(e) => handleAddClick(e, position)}
                                   >
                                     <Plus size={16} className="mr-2" /> Add
                                   </Button>
                                   <Button 
                                     className="flex-1 h-9 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20" 
                                     variant="outline" 
                                     size="sm" 
                                     data-testid={`button-sell-${position.id}`}
                                     onClick={(e) => handleCloseClick(e, position)}
                                   >
                                     <X size={16} className="mr-2" /> Sell
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
                           <span className={`font-mono text-sm ${pnl >= 0 ? 'text-[#1ED78B]' : 'text-red-400'}`}>
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
