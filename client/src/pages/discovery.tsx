import { useState, useMemo } from "react";
import { Layout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, TrendingUp, X, ChevronDown, ChevronUp, Info, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getMarkets, type Market } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

const CATEGORIES = ["All", "Crypto", "AI", "Politics", "Sports", "Economics", "Tech", "Weather", "General"];

export default function Discovery() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);

  const { data: marketsData, isLoading } = useQuery<{ markets: Market[] }>({
    queryKey: ['/api/markets'],
    queryFn: () => getMarkets(),
  });

  const markets = marketsData?.markets || [];

  const filteredMarkets = useMemo(() => {
    return markets.filter((market) => {
      const matchesSearch = searchQuery === "" || 
        market.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        market.subtitle?.toLowerCase().includes(searchQuery.toLowerCase());
      
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

      return matchesSearch && matchesCategory;
    });
  }, [markets, searchQuery, selectedCategory]);

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
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="aspect-[4/5] rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : filteredMarkets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Search size={48} className="mb-4 opacity-50" />
              <p className="text-center">No markets found</p>
              <p className="text-sm text-center opacity-75">Try a different search or category</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredMarkets.map((market) => (
                <MarketCard 
                  key={market.id} 
                  market={market} 
                  onClick={() => setSelectedMarket(market)}
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

function MarketDetailModal({ market, onClose }: { market: Market; onClose: () => void }) {
  const [betDirection, setBetDirection] = useState<'YES' | 'NO'>('YES');
  const [betAmount, setBetAmount] = useState(5);
  const [showResolutionInfo, setShowResolutionInfo] = useState(false);
  
  const yesPercent = Math.round(market.yesPrice * 100);
  const noPercent = Math.round(market.noPrice * 100);
  const price = betDirection === 'YES' ? market.yesPrice : market.noPrice;
  const estimatedShares = betAmount / price;
  const potentialPayout = estimatedShares * 1;
  const potentialProfit = potentialPayout - betAmount;
  const returnMultiple = (potentialPayout / betAmount).toFixed(2);

  const amountOptions = [1, 5, 10, 25, 50, 100];

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

          {market.imageUrl && (
            <div 
              className="absolute top-0 left-0 right-0 h-48 bg-cover bg-center opacity-40"
              style={{ backgroundImage: `url(${market.imageUrl})` }}
            />
          )}
          <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-transparent via-zinc-900/80 to-zinc-900" />

          <div className="flex-1 overflow-y-auto pt-16 px-4 pb-4">
            <div className="relative">
              <span className="inline-block text-xs px-2 py-1 rounded-full bg-white/10 text-white/70 mb-2">
                {market.category}
              </span>
              
              <h2 className="text-xl font-bold mb-2">{market.title}</h2>
              
              {market.subtitle && (
                <p className="text-sm text-muted-foreground mb-4">{market.subtitle}</p>
              )}

              <div className="flex gap-3 mb-6">
                <div className="flex-1 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-400">{yesPercent}%</div>
                  <div className="text-xs text-emerald-400/70">{market.yesLabel || 'Yes'}</div>
                </div>
                <div className="flex-1 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-rose-400">{noPercent}%</div>
                  <div className="text-xs text-rose-400/70">{market.noLabel || 'No'}</div>
                </div>
              </div>

              <div className="bg-white/5 rounded-xl p-4 mb-4">
                <h3 className="text-sm font-medium mb-3">Place Your Bet</h3>
                
                <div className="flex gap-2 mb-4">
                  <button
                    data-testid="button-bet-yes"
                    onClick={() => setBetDirection('YES')}
                    className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                      betDirection === 'YES'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                    }`}
                  >
                    Yes @ {yesPercent}¢
                  </button>
                  <button
                    data-testid="button-bet-no"
                    onClick={() => setBetDirection('NO')}
                    className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                      betDirection === 'NO'
                        ? 'bg-rose-500 text-white'
                        : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                    }`}
                  >
                    No @ {noPercent}¢
                  </button>
                </div>

                <div className="mb-4">
                  <label className="text-xs text-muted-foreground mb-2 block">Amount (USDC)</label>
                  <div className="flex gap-2 flex-wrap">
                    {amountOptions.map((amount) => (
                      <button
                        key={amount}
                        data-testid={`button-amount-${amount}`}
                        onClick={() => setBetAmount(amount)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          betAmount === amount
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-white/10 hover:bg-white/20'
                        }`}
                      >
                        ${amount}
                      </button>
                    ))}
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

              <div className="bg-white/5 rounded-xl p-4 mb-4">
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
