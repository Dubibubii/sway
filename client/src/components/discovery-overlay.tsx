import { useState, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Info, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getEventMarkets, getMarketHistory, getBalancedPercentages, type Market, type PriceHistory } from '@/lib/api';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Button } from '@/components/ui/button';
import { AIMascot } from '@/components/ai-mascot';
import { useDebounce } from '@/hooks/use-debounce';

interface DiscoveryOverlayProps {
  market: Market;
  onClose: () => void;
  onSelectMarket: (market: Market, direction: 'yes' | 'no', amount?: number) => void;
  isTrading?: boolean;
  userWalletAddress?: string;
}

function PriceChart({ data, currentPrice }: { data: PriceHistory[]; currentPrice: number }) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
        No price history available
      </div>
    );
  }

  const chartData = data.map(point => ({
    time: new Date(point.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    price: Math.round(point.price * 100),
    fullDate: new Date(point.timestamp).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }));

  const prices = chartData.map(d => d.price);
  const minPrice = Math.max(0, Math.min(...prices) - 5);
  const maxPrice = Math.min(100, Math.max(...prices) + 5);
  
  const priceChange = chartData.length > 1 ? chartData[chartData.length - 1].price - chartData[0].price : 0;
  const lineColor = priceChange >= 0 ? '#1ED78B' : '#ef4444';

  return (
    <div className="w-full h-full">
      <div className="flex items-center gap-2 px-4 pt-3 pb-1">
        <span className="text-2xl font-bold">{Math.round(currentPrice * 100)}%</span>
        <span className={`text-sm ${priceChange >= 0 ? 'text-[#1ED78B]' : 'text-red-500'}`}>
          {priceChange >= 0 ? '+' : ''}{priceChange}%
        </span>
      </div>
      <ResponsiveContainer width="100%" height="80%">
        <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <XAxis 
            dataKey="time" 
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#666', fontSize: 10 }}
            interval="preserveStartEnd"
          />
          <YAxis 
            domain={[minPrice, maxPrice]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#666', fontSize: 10 }}
            tickFormatter={(v) => `${v}%`}
            orientation="right"
            width={35}
          />
          <Tooltip
            contentStyle={{ 
              backgroundColor: '#1a1a1a', 
              border: '1px solid #333',
              borderRadius: '8px',
              padding: '8px 12px'
            }}
            labelStyle={{ color: '#999', fontSize: 12 }}
            formatter={(value: number) => [`${value}%`, 'Yes Price']}
          />
          <Line 
            type="stepAfter"
            dataKey="price" 
            stroke={lineColor}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: lineColor }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DiscoveryOverlay({ market, onClose, onSelectMarket, isTrading = false, userWalletAddress }: DiscoveryOverlayProps) {
  const [selectedMarketId, setSelectedMarketId] = useState<string>(market.id);
  const [betDirection, setBetDirection] = useState<'YES' | 'NO'>('YES');
  const [betAmount, setBetAmount] = useState(1);
  const [isCustomAmount, setIsCustomAmount] = useState(false);
  const [customAmountText, setCustomAmountText] = useState('');
  const [showResolutionInfo, setShowResolutionInfo] = useState(false);
  const [showAllOptions, setShowAllOptions] = useState(false);
  const [showNewMarketWarning, setShowNewMarketWarning] = useState(false);
  
  const debouncedBetAmount = useDebounce(betAmount, 500);

  const { data: eventMarketsData, isLoading: isLoadingMarkets } = useQuery({
    queryKey: ['/api/events', market.eventTicker, 'markets'],
    queryFn: () => market.eventTicker ? getEventMarkets(market.eventTicker) : Promise.resolve({ markets: [] }),
    enabled: !!market.eventTicker,
  });

  const { data: historyData, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['/api/markets', market.id, 'history'],
    queryFn: () => getMarketHistory(market.id),
  });

  const eventMarkets = eventMarketsData?.markets || [];
  const hasMultipleOptions = eventMarkets.length > 1;
  const displayMarkets = hasMultipleOptions ? eventMarkets : [market];
  const visibleMarkets = showAllOptions ? displayMarkets : displayMarkets.slice(0, 5);
  const hasMoreOptions = displayMarkets.length > 5;

  const selectedMarket = displayMarkets.find(m => m.id === selectedMarketId) || market;
  const { yesPercent, noPercent } = getBalancedPercentages(selectedMarket.yesPrice, selectedMarket.noPrice);
  const price = betDirection === 'YES' ? selectedMarket.yesPrice : selectedMarket.noPrice;
  
  const { data: quoteData, isLoading: isLoadingQuote } = useQuery({
    queryKey: ['/api/pond/quote', selectedMarket.id, betDirection.toLowerCase(), debouncedBetAmount, userWalletAddress],
    queryFn: async () => {
      if (debouncedBetAmount < 0.10 || !userWalletAddress) return null;
      const response = await fetch('/api/pond/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          marketId: selectedMarket.id,
          side: betDirection.toLowerCase(),
          amountUSDC: debouncedBetAmount,
          userPublicKey: userWalletAddress,
          channel: 'overlay',
        }),
      });
      if (!response.ok) return null;
      return response.json();
    },
    enabled: debouncedBetAmount >= 0.10 && !!userWalletAddress,
    staleTime: 10000,
    retry: false,
  });
  
  const costBreakdown = quoteData?.costBreakdown;
  const hasAccurateQuote = !!costBreakdown?.expectedShares && costBreakdown.expectedShares > 0;
  
  const estimatedShares = hasAccurateQuote 
    ? costBreakdown.expectedShares 
    : (betAmount * 0.95 / price);
  const actualCostUSDC = hasAccurateQuote 
    ? costBreakdown.inputUSDC 
    : betAmount;
  const potentialPayout = estimatedShares * 1;
  const potentialProfit = potentialPayout - actualCostUSDC;
  const returnMultiple = actualCostUSDC > 0 ? (potentialPayout / actualCostUSDC).toFixed(2) : '0.00';

  const amountOptions = [1, 5, 10, 25, 50, 100];

  const handleSelectOption = (marketId: string, direction: 'YES' | 'NO') => {
    setSelectedMarketId(marketId);
    setBetDirection(direction);
  };

  const handleTrade = () => {
    const targetMarket = displayMarkets.find(m => m.id === selectedMarketId) || market;
    
    // Show warning for uninitialized markets before proceeding
    if (targetMarket.isInitialized === false && !showNewMarketWarning) {
      setShowNewMarketWarning(true);
      return;
    }
    
    console.log('[DiscoveryOverlay] Trade initiated:', { 
      marketId: targetMarket.id, 
      direction: betDirection, 
      betAmount, 
      yesPrice: targetMarket.yesPrice, 
      noPrice: targetMarket.noPrice,
      userWallet: userWalletAddress?.slice(0, 8) + '...',
      isInitialized: targetMarket.isInitialized
    });
    onSelectMarket(targetMarket, betDirection.toLowerCase() as 'yes' | 'no', betAmount);
    onClose();
  };
  
  const handleConfirmNewMarketTrade = () => {
    setShowNewMarketWarning(false);
    const targetMarket = displayMarkets.find(m => m.id === selectedMarketId) || market;
    console.log('[DiscoveryOverlay] New market trade confirmed:', { 
      marketId: targetMarket.id, 
      direction: betDirection, 
      betAmount
    });
    onSelectMarket(targetMarket, betDirection.toLowerCase() as 'yes' | 'no', betAmount);
    onClose();
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={onClose}
      />
      
      <motion.div
        initial={{ opacity: 0, y: "100%" }}
        animate={{ opacity: 1, y: "5%" }}
        exit={{ opacity: 0, y: "100%" }}
        transition={{ type: "spring", damping: 35, stiffness: 500 }}
        className="fixed inset-x-0 bottom-0 z-50 h-[90%] bg-gradient-to-b from-zinc-900 to-black rounded-t-3xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-full flex flex-col">
          <button
            data-testid="button-close-discovery-overlay"
            onClick={onClose}
            className="absolute top-4 left-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
          >
            <X size={20} />
          </button>
          
          <div className="absolute top-4 right-4 z-10" data-testid="ai-mascot-container-overlay">
            <AIMascot 
              marketTitle={market.title}
              category={market.category}
              yesPrice={market.yesPrice}
              noPrice={market.noPrice}
              alignRight={true}
            />
          </div>

          <div className="h-52 bg-zinc-900 shrink-0">
            {isLoadingHistory ? (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <PriceChart data={historyData?.history || []} currentPrice={market.yesPrice} />
            )}
          </div>
          
          {/* Volume indicator below chart */}
          <div className="px-4 py-1 bg-zinc-900/50">
            <span className="text-xs text-muted-foreground">
              Volume: ${market.volume?.toLocaleString() || 0}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="relative pt-4">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="inline-block text-xs px-2 py-1 rounded-full bg-white/10 text-white/70">
                  {market.category}
                </span>
                {hasMultipleOptions && (
                  <span className="inline-block text-xs px-2 py-1 rounded-full bg-primary/20 text-primary">
                    {displayMarkets.length} options
                  </span>
                )}
                {market.isInitialized === false && (
                  <span className="inline-block text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 flex items-center gap-1">
                    <Info size={10} />
                    New Market
                  </span>
                )}
              </div>
              
              <h2 className="text-xl font-bold mb-2">{market.title}</h2>
              
              {market.isInitialized === false && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-3">
                  <p className="text-xs text-amber-200">
                    This market is new and hasn't been traded yet. Your first trade will pay a small initialization fee (~$0.01) to set it up.
                  </p>
                </div>
              )}
              
              {market.subtitle && (
                <p className="text-sm text-muted-foreground mb-4">{market.subtitle}</p>
              )}

              <div className="bg-white/5 rounded-xl overflow-hidden mb-4">
                {isLoadingMarkets ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {visibleMarkets.map((m, idx) => {
                      const { yesPercent: mYesPercent, noPercent: mNoPercent } = getBalancedPercentages(m.yesPrice, m.noPrice);
                      const isSelected = selectedMarketId === m.id;
                      return (
                        <div 
                          key={m.id}
                          className={`flex items-center p-3 ${idx > 0 ? 'border-t border-white/10' : ''} ${
                            isSelected ? 'bg-white/10' : ''
                          }`}
                        >
                          <div className="flex-1 min-w-0 mr-2">
                            <div className="text-sm font-medium truncate">{m.yesLabel || m.subtitle || m.title}</div>
                          </div>
                          <div className="text-base font-bold text-white w-12 text-center shrink-0">
                            {mYesPercent}%
                          </div>
                          <div className="flex gap-1.5 ml-2 shrink-0">
                            <button
                              data-testid={`overlay-bet-yes-${m.id}`}
                              onClick={() => handleSelectOption(m.id, 'YES')}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all min-w-[60px] ${
                                isSelected && betDirection === 'YES'
                                  ? 'bg-[#1ED78B] text-white ring-2 ring-[#1ED78B]'
                                  : 'bg-[#1ED78B]/20 text-[#1ED78B] hover:bg-[#1ED78B]/30'
                              }`}
                            >
                              Yes {mYesPercent}¢
                            </button>
                            <button
                              data-testid={`overlay-bet-no-${m.id}`}
                              onClick={() => handleSelectOption(m.id, 'NO')}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all min-w-[60px] ${
                                isSelected && betDirection === 'NO'
                                  ? 'bg-rose-500 text-white ring-2 ring-rose-400'
                                  : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                              }`}
                            >
                              No {mNoPercent}¢
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    
                    {hasMoreOptions && (
                      <button
                        onClick={() => setShowAllOptions(!showAllOptions)}
                        className="w-full p-2 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:bg-white/5 border-t border-white/10"
                      >
                        {showAllOptions ? (
                          <>Show less <ChevronUp size={14} /></>
                        ) : (
                          <>Show {displayMarkets.length - 5} more options <ChevronDown size={14} /></>
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>

              <div className="bg-white/5 rounded-xl p-4 mb-4">
                <div className="mb-3 pb-2 border-b border-white/10">
                  <span className="text-xs text-muted-foreground">Selected: </span>
                  <span className="text-sm font-medium">
                    {selectedMarket.yesLabel || selectedMarket.subtitle || selectedMarket.title} - {betDirection}
                  </span>
                </div>
                
                <div className="mb-4">
                  <label className="text-xs text-muted-foreground mb-2 block">Amount (USDC)</label>
                  <div className="flex gap-2 flex-wrap items-center">
                    {amountOptions.map((amount) => (
                      <button
                        key={amount}
                        data-testid={`overlay-amount-${amount}`}
                        onClick={() => {
                          setBetAmount(amount);
                          setIsCustomAmount(false);
                          setCustomAmountText('');
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          betAmount === amount && !isCustomAmount
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-white/10 hover:bg-white/20'
                        }`}
                      >
                        ${amount}
                      </button>
                    ))}
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        data-testid="overlay-input-custom-amount"
                        value={customAmountText}
                        onChange={(e) => {
                          setCustomAmountText(e.target.value);
                          setIsCustomAmount(true);
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val > 0) {
                            setBetAmount(val);
                          }
                        }}
                        onFocus={() => setIsCustomAmount(true)}
                        placeholder="Custom"
                        className={`w-24 pl-7 pr-2 py-2 rounded-lg text-sm font-medium border focus:outline-none ${
                          isCustomAmount
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-white/10 border-white/20 focus:border-primary'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-black/30 rounded-lg p-3 mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Your cost</span>
                    <span>${betAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">
                      Shares ({(price * 100).toFixed(0)}¢ each)
                      {isLoadingQuote && <Loader2 className="w-3 h-3 ml-1 inline animate-spin" />}
                    </span>
                    <span className={hasAccurateQuote ? 'text-white font-medium' : 'text-zinc-400'}>
                      {hasAccurateQuote ? '' : '~'}{estimatedShares.toFixed(2)}
                    </span>
                  </div>
                  
                  {(() => {
                    const buyPrice = betDirection === 'YES' 
                      ? (selectedMarket.yesAsk ?? selectedMarket.yesPrice)
                      : (selectedMarket.noAsk ?? selectedMarket.noPrice);
                    const sellPrice = betDirection === 'YES'
                      ? (selectedMarket.yesBid ?? selectedMarket.yesPrice * 0.9)
                      : (selectedMarket.noBid ?? selectedMarket.noPrice * 0.9);
                    const spreadCents = Math.round((buyPrice - sellPrice) * 100);
                    const hasBidAsk = betDirection === 'YES' 
                      ? (selectedMarket.yesAsk !== undefined && selectedMarket.yesBid !== undefined)
                      : (selectedMarket.noAsk !== undefined && selectedMarket.noBid !== undefined);
                    
                    return hasBidAsk && spreadCents > 0 ? (
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground flex items-center gap-1">
                          Sell price now
                          <span className="text-amber-400/70 text-[10px]">({spreadCents}¢ spread)</span>
                        </span>
                        <span className="text-amber-400">{(sellPrice * 100).toFixed(0)}¢</span>
                      </div>
                    ) : null;
                  })()}
                  
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">If you win</span>
                    <span className={betDirection === 'YES' ? 'text-[#1ED78B]' : 'text-rose-400'}>
                      {hasAccurateQuote ? '' : '~'}${potentialPayout.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-white/10">
                    <span>Profit</span>
                    <span className={betDirection === 'YES' ? 'text-[#1ED78B]' : 'text-rose-400'}>
                      {hasAccurateQuote ? '' : '~'}${potentialProfit.toFixed(2)} ({returnMultiple}x)
                    </span>
                  </div>
                  {!hasAccurateQuote && !isLoadingQuote && userWalletAddress && betAmount >= 0.5 && (
                    <div className="text-[10px] text-amber-400/70 mt-1 text-center">
                      Estimates may vary. Final shares determined at execution.
                    </div>
                  )}
                </div>

                <Button 
                  data-testid="button-confirm-discovery-trade"
                  onClick={handleTrade}
                  disabled={isTrading}
                  className={`w-full py-6 text-lg font-semibold rounded-xl ${
                    betDirection === 'YES' 
                      ? 'bg-[#1ED78B] hover:bg-[#19B878]' 
                      : 'bg-rose-500 hover:bg-rose-600'
                  }`}
                >
                  {isTrading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Placing Trade...
                    </span>
                  ) : (
                    `Bet $${betAmount} on ${betDirection}`
                  )}
                </Button>
              </div>

              <div className="bg-white/5 rounded-xl p-4 mb-20">
                <button 
                  onClick={() => setShowResolutionInfo(!showResolutionInfo)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <Info size={16} className="text-muted-foreground" />
                    <span className="text-sm font-medium">Resolution Details</span>
                  </div>
                  {showResolutionInfo ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                
                <AnimatePresence>
                  {showResolutionInfo && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-3 mt-3 border-t border-white/10 text-sm text-muted-foreground space-y-2">
                        <p>This market will resolve based on official announcements and verifiable public information.</p>
                        <p>End date: {new Date((typeof market.endDate === 'string' ? parseInt(market.endDate, 10) : market.endDate) * 1000).toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}</p>
                        <p>Total volume: ${market.volume?.toLocaleString() || 0}</p>
                        <a 
                          href="https://kalshi.com/category/all"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          View on Kalshi <ExternalLink size={12} />
                        </a>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
      
      {/* New Market Warning Dialog */}
      <AnimatePresence>
        {showNewMarketWarning && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 z-[60]"
              onClick={() => setShowNewMarketWarning(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[60] bg-zinc-900 rounded-2xl p-6 border border-amber-500/30 max-w-md mx-auto"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Info className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="text-lg font-bold text-white">New Market</h3>
              </div>
              
              <div className="space-y-3 mb-6">
                <p className="text-sm text-white/80">
                  This is a new market. Here's what to expect:
                </p>
                <ul className="text-sm text-white/70 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400 mt-0.5">•</span>
                    <span>A small initialization fee (~$0.01) may be charged to set up the market on Solana</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400 mt-0.5">•</span>
                    <span>If the market isn't ready for trading yet, you'll need to try again later - you won't be charged</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400 mt-0.5">•</span>
                    <span>New markets are constantly being added - check back soon!</span>
                  </li>
                </ul>
              </div>
              
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowNewMarketWarning(false)}
                  className="flex-1 py-5"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmNewMarketTrade}
                  disabled={isTrading}
                  className="flex-1 py-5 bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                >
                  {isTrading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Trading...
                    </span>
                  ) : (
                    'Proceed Anyway'
                  )}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
