import { useState, useMemo } from "react";
import { Layout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getMarkets, type Market } from "@/lib/api";

const CATEGORIES = ["All", "Crypto", "AI", "Politics", "Sports", "Economics", "Tech", "Weather", "General"];

export default function Discovery() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

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
                <MarketCard key={market.id} market={market} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function MarketCard({ market }: { market: Market }) {
  const yesPercent = Math.round(market.yesPrice * 100);
  const noPercent = Math.round(market.noPrice * 100);

  return (
    <div 
      data-testid={`card-market-${market.id}`}
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
