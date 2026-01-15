import { useState, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Info, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getEventMarkets, getMarketHistory, getBalancedPercentages, type Market, type PriceHistory } from '@/lib/api';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface DiscoveryOverlayProps {
  market: Market;
  onClose: () => void;
  onSelectMarket: (market: Market, direction: 'yes' | 'no') => void;
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
    price: Math.round(point.yesPrice * 100),
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

const MarketOptionCard = memo(function MarketOptionCard({ 
  market, 
  isSelected, 
  selectedDirection,
  onSelect 
}: { 
  market: Market; 
  isSelected: boolean;
  selectedDirection: 'YES' | 'NO' | null;
  onSelect: (marketId: string, direction: 'YES' | 'NO') => void;
}) {
  const { yesPercent, noPercent } = getBalancedPercentages(market.yesPrice, market.noPrice);
  
  return (
    <div 
      className={`flex items-center p-3 border-b border-white/10 last:border-b-0 ${
        isSelected ? 'bg-white/10' : ''
      }`}
    >
      <div className="flex-1 min-w-0 mr-2">
        <div className="text-sm font-medium truncate">{market.yesLabel || market.subtitle || market.title}</div>
      </div>
      <div className="text-base font-bold text-white w-12 text-center shrink-0">
        {yesPercent}%
      </div>
      <div className="flex gap-1.5 ml-2 shrink-0">
        <button
          data-testid={`overlay-bet-yes-${market.id}`}
          onClick={() => onSelect(market.id, 'YES')}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all min-w-[60px] ${
            isSelected && selectedDirection === 'YES'
              ? 'bg-[#1ED78B] text-white ring-2 ring-[#1ED78B]'
              : 'bg-[#1ED78B]/20 text-[#1ED78B] hover:bg-[#1ED78B]/30'
          }`}
        >
          Yes {yesPercent}¢
        </button>
        <button
          data-testid={`overlay-bet-no-${market.id}`}
          onClick={() => onSelect(market.id, 'NO')}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all min-w-[60px] ${
            isSelected && selectedDirection === 'NO'
              ? 'bg-rose-500 text-white ring-2 ring-rose-400'
              : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
          }`}
        >
          No {noPercent}¢
        </button>
      </div>
    </div>
  );
});

export function DiscoveryOverlay({ market, onClose, onSelectMarket }: DiscoveryOverlayProps) {
  const [selectedMarketId, setSelectedMarketId] = useState<string>(market.id);
  const [selectedDirection, setSelectedDirection] = useState<'YES' | 'NO'>('YES');
  const [showAllOptions, setShowAllOptions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
  
  const filteredMarkets = useMemo(() => {
    if (!searchQuery.trim()) return displayMarkets;
    const query = searchQuery.toLowerCase();
    return displayMarkets.filter(m => 
      m.title.toLowerCase().includes(query) ||
      m.yesLabel?.toLowerCase().includes(query) ||
      m.subtitle?.toLowerCase().includes(query)
    );
  }, [displayMarkets, searchQuery]);
  
  const visibleMarkets = showAllOptions ? filteredMarkets : filteredMarkets.slice(0, 6);
  const hasMoreOptions = filteredMarkets.length > 6;

  const selectedMarket = displayMarkets.find(m => m.id === selectedMarketId) || market;

  const handleSelectOption = (marketId: string, direction: 'YES' | 'NO') => {
    setSelectedMarketId(marketId);
    setSelectedDirection(direction);
  };

  const handleTrade = () => {
    const targetMarket = displayMarkets.find(m => m.id === selectedMarketId) || market;
    onSelectMarket(targetMarket, selectedDirection.toLowerCase() as 'yes' | 'no');
    onClose();
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
        onClick={onClose}
      />
      
      <motion.div
        initial={{ opacity: 0, y: "100%" }}
        animate={{ opacity: 1, y: "5%" }}
        exit={{ opacity: 0, y: "100%" }}
        transition={{ type: "spring", damping: 35, stiffness: 500 }}
        className="fixed inset-x-0 bottom-0 z-50 h-[92%] bg-gradient-to-b from-zinc-900 to-black rounded-t-3xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-full flex flex-col">
          {/* Close button */}
          <button
            data-testid="button-close-discovery-overlay"
            onClick={onClose}
            className="absolute top-4 left-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
          >
            <X size={20} />
          </button>

          {/* Header with hint */}
          <div className="absolute top-4 right-4 z-10 text-xs text-white/50 bg-black/30 px-2 py-1 rounded-full">
            More options
          </div>

          {/* Price Chart */}
          <div className="h-44 bg-zinc-900 shrink-0">
            {isLoadingHistory ? (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <PriceChart data={historyData?.history || []} currentPrice={market.yesPrice} />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 pb-24">
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
              </div>
              
              <h2 className="text-xl font-bold mb-3">{market.title}</h2>
              
              {market.subtitle && (
                <p className="text-sm text-muted-foreground mb-4">{market.subtitle}</p>
              )}

              {/* Search bar for multiple options */}
              {hasMultipleOptions && displayMarkets.length > 4 && (
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                  <Input
                    type="text"
                    placeholder="Search options..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 bg-white/5 border-white/10 rounded-full h-9 text-sm"
                  />
                </div>
              )}

              {/* Market options list */}
              <div className="bg-white/5 rounded-xl overflow-hidden mb-4">
                {isLoadingMarkets ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {visibleMarkets.map((m) => (
                      <MarketOptionCard
                        key={m.id}
                        market={m}
                        isSelected={selectedMarketId === m.id}
                        selectedDirection={selectedMarketId === m.id ? selectedDirection : null}
                        onSelect={handleSelectOption}
                      />
                    ))}
                    
                    {hasMoreOptions && (
                      <button
                        onClick={() => setShowAllOptions(!showAllOptions)}
                        className="w-full py-3 text-sm text-primary hover:bg-white/5 transition-colors flex items-center justify-center gap-1"
                      >
                        {showAllOptions ? (
                          <>Show Less <ChevronUp size={16} /></>
                        ) : (
                          <>Show {filteredMarkets.length - 6} More <ChevronDown size={16} /></>
                        )}
                      </button>
                    )}
                    
                    {filteredMarkets.length === 0 && searchQuery && (
                      <div className="py-6 text-center text-muted-foreground text-sm">
                        No options match "{searchQuery}"
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Resolution info */}
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-white/5 rounded-lg p-3">
                <Info size={14} className="mt-0.5 shrink-0" />
                <p>Tap Yes or No to select your position, then confirm below to place your trade.</p>
              </div>
            </div>
          </div>

          {/* Fixed trade button at bottom */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black to-transparent">
            <Button
              data-testid="button-confirm-discovery-trade"
              onClick={handleTrade}
              className={`w-full py-6 text-lg font-bold rounded-xl ${
                selectedDirection === 'YES' 
                  ? 'bg-[#1ED78B] hover:bg-[#1ED78B]/90 text-white' 
                  : 'bg-rose-500 hover:bg-rose-500/90 text-white'
              }`}
            >
              Trade {selectedDirection} on {selectedMarket.yesLabel || 'this market'}
            </Button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
