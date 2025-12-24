import { useState, useMemo } from "react";
import { Layout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, TrendingUp, X, ChevronDown, ChevronUp, Info, ExternalLink, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getMarkets, getEventMarkets, searchMarkets, getMarketHistory, type Market, type PriceHistory } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { usePageView, useMarketView, useBetPlaced } from "@/hooks/use-analytics";
import { useDebounce } from "@/hooks/use-debounce";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

const CATEGORIES = ["All", "Crypto", "AI", "Politics", "Sports", "Economics", "Tech", "Weather", "General"];

export default function Discovery() {
  usePageView('discovery');
  const trackMarketView = useMarketView();
  const trackBet = useBetPlaced();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: marketsData, isLoading } = useQuery<{ markets: Market[] }>({
    queryKey: ['/api/markets'],
    queryFn: () => getMarkets(),
  });

  const { data: searchData, isLoading: isSearching } = useQuery<{ markets: Market[] }>({
    queryKey: ['/api/markets/search', debouncedSearch],
    queryFn: () => searchMarkets(debouncedSearch),
    enabled: debouncedSearch.length >= 2,
  });

  const markets = marketsData?.markets || [];
  const searchResults = searchData?.markets || [];
  
  const isActiveSearch = debouncedSearch.length >= 2;

  const filteredMarkets = useMemo(() => {
    const sourceMarkets = isActiveSearch ? searchResults : markets;
    
    return sourceMarkets.filter((market) => {
      if (isActiveSearch) {
        let matchesCategory = selectedCategory === "All" || 
          market.category.toLowerCase() === selectedCategory.toLowerCase();
        
        if (!matchesCategory && selectedCategory === "Crypto") {
          const cryptoKeywords = ['bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol', 'crypto', 'xrp', 'dogecoin', 'doge'];
          const title = market.title.toLowerCase();
          matchesCategory = cryptoKeywords.some(kw => title.includes(kw));
        }
        
        if (!matchesCategory && selectedCategory === "AI") {
          const aiKeywords = ['ai', 'artificial intelligence', 'openai', 'gpt', 'chatgpt', 'anthropic', 'claude', 'agi', 'machine learning'];
          const title = market.title.toLowerCase();
          matchesCategory = aiKeywords.some(kw => title.includes(kw));
        }
        
        return matchesCategory;
      }
      
      let matchesCategory = selectedCategory === "All" || 
        market.category.toLowerCase() === selectedCategory.toLowerCase();

      if (!matchesCategory && selectedCategory === "Crypto") {
        const cryptoKeywords = ['bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol', 'crypto', 'xrp', 'dogecoin', 'doge'];
        const title = market.title.toLowerCase();
        matchesCategory = cryptoKeywords.some(kw => title.includes(kw));
      }

      if (!matchesCategory && selectedCategory === "AI") {
        const aiKeywords = ['ai', 'artificial intelligence', 'openai', 'gpt', 'chatgpt', 'anthropic', 'claude', 'agi', 'machine learning'];
        const title = market.title.toLowerCase();
        matchesCategory = aiKeywords.some(kw => title.includes(kw));
      }

      return matchesCategory;
    });
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

        <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide mb-4">
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
            <div className="grid grid-cols-2 gap-3">
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
          />
        )}
      </AnimatePresence>
    </Layout>
  );
}

function MarketCard({ market, onClick }: { market: Market; onClick: () => void }) {
  const yesPercent = Math.round(market.yesPrice * 100);
  const noPercent = Math.round(market.noPrice * 100);

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
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/70">
            {market.category}
          </span>
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
          <div className="flex-1 bg-emerald-500/20 rounded-md px-2 py-1 text-center">
            <span className="text-xs font-bold text-emerald-400">{yesPercent}%</span>
            <span className="text-[10px] text-emerald-400/70 ml-1">Yes</span>
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

function PriceChart({ data }: { data: PriceHistory[] }) {
  if (data.length < 2) {
    return null;
  }
  
  const chartData = data.map((d) => ({
    time: new Date(d.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    price: Math.round(d.price * 100),
  }));

  const minPrice = Math.max(0, Math.min(...chartData.map(d => d.price)) - 5);
  const maxPrice = Math.min(100, Math.max(...chartData.map(d => d.price)) + 5);

  return (
    <div className="w-full h-full px-4 pt-12">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
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
            type="monotone" 
            dataKey="price" 
            stroke="#10b981" 
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#10b981' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PriceDisplay({ yesPrice }: { yesPrice: number }) {
  const yesPercent = Math.round(yesPrice * 100);
  const noPercent = 100 - yesPercent;
  
  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-6 pt-12">
      <div className="text-center mb-4">
        <div className="text-4xl font-bold text-emerald-400">{yesPercent}%</div>
        <div className="text-sm text-muted-foreground">Current Yes Price</div>
      </div>
      <div className="w-full max-w-sm h-3 bg-white/10 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
          style={{ width: `${yesPercent}%` }}
        />
      </div>
      <div className="flex justify-between w-full max-w-sm mt-2 text-xs text-muted-foreground">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function MarketDetailModal({ market, onClose }: { market: Market; onClose: () => void }) {
  const [selectedMarketId, setSelectedMarketId] = useState<string>(market.id);
  const [betDirection, setBetDirection] = useState<'YES' | 'NO'>('YES');
  const [betAmount, setBetAmount] = useState(5);
  const [isCustomAmount, setIsCustomAmount] = useState(false);
  const [customAmountText, setCustomAmountText] = useState('');
  const [showResolutionInfo, setShowResolutionInfo] = useState(false);
  const [showAllOptions, setShowAllOptions] = useState(false);

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
  const yesPercent = Math.round(selectedMarket.yesPrice * 100);
  const noPercent = Math.round(selectedMarket.noPrice * 100);
  const price = betDirection === 'YES' ? selectedMarket.yesPrice : selectedMarket.noPrice;
  const estimatedShares = betAmount / price;
  const potentialPayout = estimatedShares * 1;
  const potentialProfit = potentialPayout - betAmount;
  const returnMultiple = (potentialPayout / betAmount).toFixed(2);

  const amountOptions = [1, 5, 10, 25, 50, 100];

  const handleSelectOption = (marketId: string, direction: 'YES' | 'NO') => {
    setSelectedMarketId(marketId);
    setBetDirection(direction);
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

          <div className="h-48 bg-zinc-900 flex items-center justify-center">
            {isLoadingHistory ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            ) : historyData?.history && historyData.history.length >= 2 ? (
              <PriceChart data={historyData.history} />
            ) : (
              <PriceDisplay yesPrice={market.yesPrice} />
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="relative pt-4">
              <span className="inline-block text-xs px-2 py-1 rounded-full bg-white/10 text-white/70 mb-2">
                {market.category}
              </span>
              
              <h2 className="text-xl font-bold mb-2">{market.title}</h2>
              
              {market.subtitle && (
                <p className="text-sm text-muted-foreground mb-4">{market.subtitle}</p>
              )}

              <div className="bg-white/5 rounded-xl overflow-hidden mb-4">
                {visibleMarkets.map((m, idx) => {
                  const mYesPercent = Math.round(m.yesPrice * 100);
                  const mNoPercent = Math.round(m.noPrice * 100);
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
                              ? 'bg-emerald-500 text-white ring-2 ring-emerald-400'
                              : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
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
                    <span className="text-muted-foreground">Shares ({(price * 100).toFixed(0)}¢ each)</span>
                    <span>{estimatedShares.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">If you win</span>
                    <span className={betDirection === 'YES' ? 'text-emerald-400' : 'text-rose-400'}>
                      ${potentialPayout.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-white/10">
                    <span>Profit</span>
                    <span className={betDirection === 'YES' ? 'text-emerald-400' : 'text-rose-400'}>
                      +${potentialProfit.toFixed(2)} ({returnMultiple}x)
                    </span>
                  </div>
                </div>

                <Button 
                  data-testid="button-place-bet"
                  className={`w-full py-6 text-lg font-semibold rounded-xl ${
                    betDirection === 'YES' 
                      ? 'bg-emerald-500 hover:bg-emerald-600' 
                      : 'bg-rose-500 hover:bg-rose-600'
                  }`}
                >
                  Bet ${betAmount} on {betDirection}
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
                        {market.eventTicker && (
                          <a 
                            href={`https://kalshi.com/markets/${market.eventTicker}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            View on Kalshi <ExternalLink size={12} />
                          </a>
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
