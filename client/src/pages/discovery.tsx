import { useState, useMemo } from "react";
import { Layout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, TrendingUp, X, ChevronDown, ChevronUp, Info, ExternalLink, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMarkets, getEventMarkets, searchMarkets, getMarketHistory, createTrade, getBalancedPercentages, type Market, type PriceHistory } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { usePageView, useMarketView, useBetPlaced } from "@/hooks/use-analytics";
import { useDebounce } from "@/hooks/use-debounce";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { usePondTrading } from "@/hooks/use-pond-trading";
import { useSolanaBalance } from "@/hooks/use-solana-balance";
import { usePrivySafe } from "@/hooks/use-privy-safe";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-settings";

const CATEGORIES = ["All", "Crypto", "AI", "Politics", "Sports", "Economics", "Tech", "Weather", "General"];

export default function Discovery() {
  usePageView('discovery');
  const trackMarketView = useMarketView();
  const trackBet = useBetPlaced();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { settings } = useSettings();
  const { authenticated, embeddedWallet } = usePrivySafe();
  const { usdcBalance, solBalance, refetch: refetchBalance } = useSolanaBalance(embeddedWallet?.address || null);
  const { placeTrade: placePondTrade, isTrading } = usePondTrading();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  
  const debouncedSearch = useDebounce(searchQuery, 300);
  
  // Handle trade execution from discovery modal
  const handleTrade = async (
    marketId: string, 
    side: 'yes' | 'no', 
    amount: number, 
    marketTitle: string, 
    marketCategory: string | undefined,
    price: number
  ) => {
    if (!authenticated || !settings.connected) {
      toast({ title: 'Not Connected', description: 'Please connect your wallet first', variant: 'destructive' });
      return;
    }
    
    // Check balance
    if (usdcBalance !== undefined && usdcBalance < amount) {
      toast({ title: 'Insufficient Balance', description: `You have $${usdcBalance.toFixed(2)} but need $${amount.toFixed(2)}`, variant: 'destructive' });
      return;
    }
    
    // Execute trade using 'discovery' channel - 0.75% fee
    const result = await placePondTrade(marketId, side, amount, usdcBalance, embeddedWallet?.address, 'discovery', solBalance);
    
    if (result.success) {
      // Record trade in database
      if (settings.privyId) {
        try {
          await createTrade(settings.privyId, {
            marketId,
            marketTitle,
            marketCategory: marketCategory || null,
            direction: side.toUpperCase() as 'YES' | 'NO',
            wagerAmount: amount,
            price,
            actualShares: result.actualShares,
            signature: result.signature,
            executionMode: result.executionMode,
          });
        } catch (err) {
          console.error('[Discovery] Failed to record trade:', err);
        }
      }
      
      // Track analytics
      trackBet(marketId, marketTitle, amount);
      
      // Refresh data
      setTimeout(() => {
        refetchBalance();
        queryClient.invalidateQueries({ queryKey: ['positions'] });
        queryClient.invalidateQueries({ queryKey: ['trades'] });
      }, 2000);
      
      // Show success and close modal
      toast({
        title: 'Trade Executed!',
        description: `Bet $${amount} on ${side.toUpperCase()} @ ${(price * 100).toFixed(0)}¢`,
      });
      setSelectedMarket(null);
    } else {
      // Handle errors
      if (result.error?.startsWith('INSUFFICIENT_GAS:')) {
        toast({ title: 'Need More SOL for Gas', description: 'You need at least 0.003 SOL for transaction fees. Deposit more SOL from your profile page.', variant: 'destructive' });
      } else if (result.error?.startsWith('BALANCE_LOADING:')) {
        toast({ title: 'Loading...', description: 'Please wait for your wallet balance to load, then try again.', variant: 'destructive' });
      } else {
        const errorMsg = result.error?.includes('zero_out_amount') 
          ? 'Trade amount too small. Please increase to at least $0.50'
          : (result.error || 'Trade failed');
        toast({ title: 'Trade Failed', description: errorMsg, variant: 'destructive' });
      }
    }
  };

  const { data: marketsData, isLoading } = useQuery<{ markets: Market[] }>({
    queryKey: ['/api/markets'],
    queryFn: () => getMarkets(),
    refetchInterval: 30000, // Refresh every 30 seconds for live price updates
  });

  const { data: searchData, isLoading: isSearching } = useQuery<{ markets: Market[] }>({
    queryKey: ['/api/markets/search', debouncedSearch],
    queryFn: () => searchMarkets(debouncedSearch),
    enabled: debouncedSearch.length >= 2,
  });

  const markets = marketsData?.markets || [];
  const searchResults = searchData?.markets || [];
  
  const isActiveSearch = debouncedSearch.length >= 2;

  // Helper function to check if title contains keyword as a whole word
  const containsWholeWord = (text: string, keyword: string): boolean => {
    // For single/short keywords, use word boundary matching
    // For multi-word phrases, use simple includes
    if (keyword.includes(' ')) {
      return text.includes(keyword);
    }
    // Use regex word boundary for single words
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(text);
  };

  // Filter markets based on selected category
  const filteredMarkets = useMemo(() => {
    const sourceMarkets = isActiveSearch ? searchResults : markets;
    
    // If "All" is selected, show everything
    if (selectedCategory === "All") {
      return sourceMarkets;
    }
    
    const result = sourceMarkets.filter((market) => {
      const marketCat = (market.category || '').toLowerCase().trim();
      const selectedCat = selectedCategory.toLowerCase().trim();
      
      // Direct category match (case-insensitive)
      if (marketCat === selectedCat) {
        return true;
      }
      
      const title = market.title.toLowerCase();
      
      // Additional keyword matching for Crypto (whole word matching)
      if (selectedCategory === "Crypto") {
        const cryptoKeywords = ['bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol', 'crypto', 'xrp', 'dogecoin', 'doge'];
        if (cryptoKeywords.some(kw => containsWholeWord(title, kw))) {
          return true;
        }
      }
      
      // Additional keyword matching for AI (whole word matching to avoid "chair", "maine", etc.)
      if (selectedCategory === "AI") {
        const aiKeywords = ['artificial intelligence', 'openai', 'gpt', 'chatgpt', 'anthropic', 'claude', 'agi', 'machine learning'];
        if (aiKeywords.some(kw => containsWholeWord(title, kw))) {
          return true;
        }
        // Special case: standalone "AI" as whole word only
        if (containsWholeWord(title, 'ai')) {
          return true;
        }
      }
      
      // Additional keyword matching for Tech (whole word matching)
      if (selectedCategory === "Tech") {
        const techKeywords = ['spacex', 'tesla', 'apple', 'google', 'microsoft', 'nvidia', 'ipo', 'startup', 'robotaxi'];
        if (techKeywords.some(kw => containsWholeWord(title, kw))) {
          return true;
        }
      }
      
      return false;
    });
    
    return result;
  }, [markets, searchResults, selectedCategory, isActiveSearch]);

  return (
    <Layout>
      <div className="flex flex-col h-full pt-20 pb-4 px-4">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input
            data-testid="input-search-markets"
            type="text"
            placeholder="Search markets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white/5 border-white/10 rounded-full"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide mb-2">
          {CATEGORIES.map((category) => (
            <Button
              key={category}
              data-testid={`filter-category-${category.toLowerCase()}`}
              variant={selectedCategory === category ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(category)}
              className={`rounded-full whitespace-nowrap text-xs ${
                selectedCategory === category 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
            >
              {category}
            </Button>
          ))}
        </div>
        {selectedCategory !== "All" && (
          <p className="text-xs text-muted-foreground mb-2">
            Showing {filteredMarkets.length} {selectedCategory} markets
          </p>
        )}

        <div className="flex-1 overflow-y-auto">
          {(isLoading || (isActiveSearch && isSearching)) ? (
            <div className="flex flex-col items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">
                {isActiveSearch ? `Searching all markets for "${debouncedSearch}"...` : 'Loading markets...'}
              </p>
            </div>
          ) : filteredMarkets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Search size={48} className="mb-4 opacity-50" />
              <p className="text-center">No markets found</p>
              <p className="text-sm text-center opacity-75">
                {isActiveSearch 
                  ? `No results for "${debouncedSearch}". Try different keywords.`
                  : 'Try a different search or category'}
              </p>
            </div>
          ) : (
            <div key={`grid-${selectedCategory}`} className="grid grid-cols-2 gap-3">
              {filteredMarkets.map((market) => (
                <MarketCard 
                  key={market.id} 
                  market={market} 
                  onClick={() => {
                    trackMarketView(market.id, market.title);
                    setSelectedMarket(market);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedMarket && (
          <MarketDetailModal 
            market={selectedMarket} 
            onClose={() => setSelectedMarket(null)}
            onTrade={handleTrade}
            isTrading={isTrading}
            userWalletAddress={embeddedWallet?.address}
          />
        )}
      </AnimatePresence>
    </Layout>
  );
}

function MarketCard({ market, onClick }: { market: Market; onClick: () => void }) {
  const { yesPercent, noPercent } = getBalancedPercentages(market.yesPrice, market.noPrice);
  const isNotInitialized = market.isInitialized === false;

  return (
    <div 
      data-testid={`card-market-${market.id}`}
      onClick={onClick}
      className="relative aspect-[4/5] rounded-xl overflow-hidden bg-gradient-to-br from-white/10 to-white/5 border border-white/10 hover:border-white/20 transition-all cursor-pointer group"
    >
      {market.imageUrl && (
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-30 group-hover:opacity-40 transition-opacity"
          style={{ backgroundImage: `url(${market.imageUrl})` }}
        />
      )}
      
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
      
      <div className="relative h-full flex flex-col justify-end p-3">
        <div className="flex items-center gap-1 mb-1 flex-wrap">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/70">
            {market.category}
          </span>
          {isNotInitialized && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 flex items-center gap-0.5">
              <Info size={8} />
              New
            </span>
          )}
          {(market.volume24h || 0) > 100 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary flex items-center gap-0.5">
              <TrendingUp size={8} />
              Hot
            </span>
          )}
        </div>
        
        <h3 className="text-sm font-medium leading-tight line-clamp-3 mb-2">
          {market.title}
        </h3>
        
        <div className="flex gap-1">
          <div className="flex-1 bg-[#1ED78B]/20 rounded-md px-2 py-1 text-center">
            <span className="text-xs font-bold text-[#1ED78B]">{yesPercent}%</span>
            <span className="text-[10px] text-[#1ED78B]/70 ml-1">Yes</span>
          </div>
          <div className="flex-1 bg-rose-500/20 rounded-md px-2 py-1 text-center">
            <span className="text-xs font-bold text-rose-400">{noPercent}%</span>
            <span className="text-[10px] text-rose-400/70 ml-1">No</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PriceChart({ data, currentPrice }: { data: PriceHistory[]; currentPrice?: number }) {
  // Calculate chart data - if we have history, use it. Otherwise create synthetic data for display
  const hasHistory = data.length >= 2;
  
  const chartData = hasHistory 
    ? data.map((d) => ({
        time: new Date(d.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        price: Math.round(d.price * 100),
      }))
    : currentPrice !== undefined 
      ? [
          { time: 'Earlier', price: Math.round(currentPrice * 100) },
          { time: 'Now', price: Math.round(currentPrice * 100) }
        ]
      : [];

  if (chartData.length === 0) return null;

  const prices = chartData.map(d => d.price);
  const minPrice = Math.max(0, Math.min(...prices) - 10);
  const maxPrice = Math.min(100, Math.max(...prices) + 10);
  
  // Calculate price change
  const currentPriceVal = chartData[chartData.length - 1].price;
  const firstPrice = chartData[0].price;
  const priceChange = currentPriceVal - firstPrice;
  const isUp = priceChange >= 0;
  const lineColor = hasHistory ? (isUp ? '#1ED78B' : '#ef4444') : '#1ED78B';

  return (
    <div className="w-full h-full flex flex-col px-4 pt-8">
      {/* Price header like Kalshi */}
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-3xl font-bold text-[#1ED78B]">{currentPriceVal}%</span>
        <span className="text-sm text-muted-foreground">chance</span>
        {hasHistory && priceChange !== 0 && (
          <span className={`text-sm font-medium ${isUp ? 'text-[#1ED78B]' : 'text-red-500'}`}>
            {isUp ? '▲' : '▼'} {Math.abs(priceChange).toFixed(1)}
          </span>
        )}
      </div>
      
      {/* Chart */}
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
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
    </div>
  );
}

interface MarketDetailModalProps {
  market: Market;
  onClose: () => void;
  onTrade: (marketId: string, side: 'yes' | 'no', amount: number, marketTitle: string, marketCategory: string | undefined, price: number) => Promise<void>;
  isTrading: boolean;
  userWalletAddress?: string; // For fetching accurate quotes
}

function MarketDetailModal({ market, onClose, onTrade, isTrading, userWalletAddress }: MarketDetailModalProps) {
  const [selectedMarketId, setSelectedMarketId] = useState<string>(market.id);
  const [betDirection, setBetDirection] = useState<'YES' | 'NO'>('YES');
  const [betAmount, setBetAmount] = useState(1);
  const [isCustomAmount, setIsCustomAmount] = useState(false);
  const [customAmountText, setCustomAmountText] = useState('');
  const [showResolutionInfo, setShowResolutionInfo] = useState(false);
  const [showAllOptions, setShowAllOptions] = useState(false);
  
  // Debounce bet amount for quote fetching
  const debouncedBetAmount = useDebounce(betAmount, 500);

  const { data: eventMarketsData } = useQuery({
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
  
  // Fetch accurate quote from DFlow API for precise share estimates
  // Requires valid wallet address to get real quote data
  const { data: quoteData, isLoading: isLoadingQuote, isError: isQuoteError } = useQuery({
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
          userPublicKey: userWalletAddress, // Use actual wallet for accurate quote
          channel: 'discovery',
        }),
      });
      if (!response.ok) return null;
      return response.json();
    },
    enabled: debouncedBetAmount >= 0.10 && !!userWalletAddress,
    staleTime: 10000, // Cache for 10 seconds
    retry: false, // Don't retry failed quotes
  });
  
  // Use API quote data if available for accurate numbers
  const costBreakdown = quoteData?.costBreakdown;
  const hasAccurateQuote = !!costBreakdown?.expectedShares && costBreakdown.expectedShares > 0;
  
  // Use actual quote data when available, otherwise show simple estimate with disclaimer
  const estimatedShares = hasAccurateQuote 
    ? costBreakdown.expectedShares 
    : (betAmount * 0.95 / price); // Conservative fallback
  const actualCostUSDC = hasAccurateQuote 
    ? costBreakdown.inputUSDC 
    : betAmount; // Use bet amount if no quote
  const potentialPayout = estimatedShares * 1; // Each share pays $1 if correct
  const potentialProfit = potentialPayout - actualCostUSDC; // Profit = payout - actual cost
  const returnMultiple = actualCostUSDC > 0 ? (potentialPayout / actualCostUSDC).toFixed(2) : '0.00';

  const amountOptions = [1, 5, 10, 25, 50, 100];

  const handleSelectOption = (marketId: string, direction: 'YES' | 'NO') => {
    setSelectedMarketId(marketId);
    setBetDirection(direction);
  };

  const handlePlaceBet = async () => {
    const side = betDirection.toLowerCase() as 'yes' | 'no';
    await onTrade(
      selectedMarket.id,
      side,
      betAmount,
      selectedMarket.title,
      selectedMarket.category,
      price
    );
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={onClose}
      />
      
      <motion.div
        initial={{ opacity: 0, y: "100%" }}
        animate={{ opacity: 1, y: "5%" }}
        exit={{ opacity: 0, y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-50 h-[90%] bg-gradient-to-b from-zinc-900 to-black rounded-t-3xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-full flex flex-col">
          <button
            data-testid="button-close-modal"
            onClick={onClose}
            className="absolute top-4 left-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
          >
            <X size={20} />
          </button>

          <div className="h-52 bg-zinc-900">
            {isLoadingHistory ? (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <PriceChart data={historyData?.history || []} currentPrice={market.yesPrice} />
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="relative pt-4">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="inline-block text-xs px-2 py-1 rounded-full bg-white/10 text-white/70">
                  {market.category}
                </span>
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
                          data-testid={`button-bet-yes-${m.id}`}
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
                          data-testid={`button-bet-no-${m.id}`}
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
                        data-testid={`button-amount-${amount}`}
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
                        data-testid="input-custom-amount"
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
                  data-testid="button-place-bet"
                  onClick={handlePlaceBet}
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
                        <p>End date: {new Date(market.endDate).toLocaleDateString('en-US', { 
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
                        {market.eventTicker && (
                          <p className="text-xs text-muted-foreground/70">Market ID: {market.eventTicker}</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}
