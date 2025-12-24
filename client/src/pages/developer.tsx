import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { usePrivySafe } from "@/hooks/use-privy-safe";
import { usePageView } from "@/hooks/use-analytics";
import { Users, Activity, TrendingUp, DollarSign, BarChart3, Eye, Lock } from "lucide-react";

const DEV_WALLET = '9DZEWwT47BKZnutbyJ4L5T8uEaVkwbQY8SeL3ehHHXGY';

interface AnalyticsSummary {
  totalUsers: number;
  activeUsers24h: number;
  activeUsers7d: number;
  totalBets: number;
  totalVolume: number;
  avgBetSize: number;
  pageUsage: { page: string; count: number; percentage: number }[];
  popularMarkets: { marketId: string; marketTitle: string; views: number; bets: number }[];
}

async function fetchAnalytics(walletAddress: string): Promise<AnalyticsSummary> {
  const response = await fetch('/api/analytics/summary', {
    headers: {
      'x-wallet-address': walletAddress,
    },
  });
  if (!response.ok) {
    throw new Error('Access denied');
  }
  return response.json();
}

export default function Developer() {
  usePageView('developer');
  
  const { externalWalletAddress, embeddedWallet, user } = usePrivySafe();
  const activeWalletAddress = externalWalletAddress || embeddedWallet?.address || user?.wallet?.address || null;
  
  const hasAccess = activeWalletAddress === DEV_WALLET;

  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics', activeWalletAddress],
    queryFn: () => fetchAnalytics(activeWalletAddress!),
    enabled: hasAccess,
  });

  if (!hasAccess) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-full pt-20 pb-4 px-4">
          <div className="bg-white/5 rounded-full p-6 mb-4">
            <Lock size={48} className="text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground text-center max-w-xs">
            This dashboard is only accessible to the developer wallet.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col h-full pt-20 pb-4 px-4 overflow-y-auto">
        <h1 className="text-2xl font-bold mb-6">Developer Analytics</h1>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center text-rose-400 py-8">
            Failed to load analytics
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <StatCard
                icon={<Users size={20} />}
                label="Total Users"
                value={data.totalUsers}
                color="blue"
              />
              <StatCard
                icon={<Activity size={20} />}
                label="Active (24h)"
                value={data.activeUsers24h}
                color="green"
              />
              <StatCard
                icon={<TrendingUp size={20} />}
                label="Active (7d)"
                value={data.activeUsers7d}
                color="purple"
              />
              <StatCard
                icon={<BarChart3 size={20} />}
                label="Total Bets"
                value={data.totalBets}
                color="orange"
              />
              <StatCard
                icon={<DollarSign size={20} />}
                label="Total Volume"
                value={`$${data.totalVolume.toLocaleString()}`}
                color="emerald"
              />
              <StatCard
                icon={<DollarSign size={20} />}
                label="Avg Bet Size"
                value={`$${data.avgBetSize.toFixed(2)}`}
                color="cyan"
              />
            </div>

            <Card className="bg-white/5 border-white/10 mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Page Usage</CardTitle>
              </CardHeader>
              <CardContent>
                {data.pageUsage.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No page views yet</p>
                ) : (
                  <div className="space-y-3">
                    {data.pageUsage.map((page) => (
                      <div key={page.page}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="capitalize">{page.page}</span>
                          <span className="text-muted-foreground">{page.count} ({page.percentage}%)</span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${page.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 mb-20">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Eye size={16} />
                  Popular Markets
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.popularMarkets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No market views yet</p>
                ) : (
                  <div className="space-y-3">
                    {data.popularMarkets.map((market, idx) => (
                      <div 
                        key={market.marketId}
                        className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0"
                      >
                        <div className="text-lg font-bold text-muted-foreground w-6">
                          #{idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{market.marketTitle}</div>
                          <div className="text-xs text-muted-foreground flex gap-3 mt-1">
                            <span>{market.views} views</span>
                            <span>{market.bets} bets</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </Layout>
  );
}

function StatCard({ 
  icon, 
  label, 
  value, 
  color 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string | number; 
  color: 'blue' | 'green' | 'purple' | 'orange' | 'emerald' | 'cyan';
}) {
  const colorClasses = {
    blue: 'bg-blue-500/20 text-blue-400',
    green: 'bg-green-500/20 text-green-400',
    purple: 'bg-purple-500/20 text-purple-400',
    orange: 'bg-orange-500/20 text-orange-400',
    emerald: 'bg-emerald-500/20 text-emerald-400',
    cyan: 'bg-cyan-500/20 text-cyan-400',
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className={`inline-flex p-2 rounded-lg mb-2 ${colorClasses[color]}`}>
        {icon}
      </div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
