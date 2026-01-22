import { Layout } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, ArrowDown, ChevronRight, Shield } from 'lucide-react';

export default function DocsPage() {
  return (
    <Layout>
      <div className="min-h-screen bg-background pb-24">
        <div className="max-w-lg mx-auto px-4 pt-20 pb-6">
          <div className="flex items-center gap-3 mb-6">
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-400 hover:text-white -ml-2"
              onClick={() => window.location.href = '/profile'}
              data-testid="button-back-from-docs"
            >
              <ArrowLeft size={18} className="mr-1" />
              Back
            </Button>
            <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              SWAY Docs
            </h1>
          </div>

          <div className="text-center mb-8">
            <p className="text-zinc-500 mt-2 text-sm">
              Everything you need to know about prediction markets
            </p>
          </div>

          <div className="space-y-6">
            <Card className="bg-zinc-900/80 border-zinc-800/80 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-lg">
                  Swipe to Trade
                </CardTitle>
              </CardHeader>
              <CardContent className="text-zinc-400 text-sm space-y-3">
                <p>
                  Trading prediction markets has never been easier. Just swipe!
                </p>
                <div className="space-y-2 pl-1">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                      <ArrowRight size={16} className="text-emerald-400" />
                    </div>
                    <span><span className="text-emerald-400 font-medium">Swipe Right</span> — Bet YES on the outcome</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center">
                      <ArrowLeft size={16} className="text-rose-400" />
                    </div>
                    <span><span className="text-rose-400 font-medium">Swipe Left</span> — Bet NO on the outcome</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-700/50 flex items-center justify-center">
                      <ArrowDown size={16} className="text-zinc-400" />
                    </div>
                    <span><span className="text-zinc-300 font-medium">Swipe Down</span> — Skip this market</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/80 border-zinc-800/80 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-lg">
                  How Markets Work
                </CardTitle>
              </CardHeader>
              <CardContent className="text-zinc-400 text-sm space-y-3">
                <p>
                  Prediction markets let you trade on real-world events. Each market has a question with a YES or NO outcome.
                </p>
                <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50">
                  <div className="text-zinc-300 font-medium mb-2">Example:</div>
                  <div className="text-zinc-400 italic mb-3">"Will Bitcoin reach $150K in 2026?"</div>
                  <div className="flex gap-4">
                    <div className="flex-1 text-center">
                      <div className="text-emerald-400 font-bold text-lg">65¢</div>
                      <div className="text-xs text-zinc-500">YES price</div>
                    </div>
                    <div className="flex-1 text-center">
                      <div className="text-rose-400 font-bold text-lg">35¢</div>
                      <div className="text-xs text-zinc-500">NO price</div>
                    </div>
                  </div>
                </div>
                <p>
                  Prices reflect the market's prediction. A YES at 65¢ means the market thinks there's a 65% chance it happens.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/80 border-zinc-800/80 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-lg">
                  Payouts
                </CardTitle>
              </CardHeader>
              <CardContent className="text-zinc-400 text-sm space-y-3">
                <p>
                  When a market resolves, winning shares pay out <span className="text-white font-medium">$1.00 each</span>. Losing shares are worth $0.
                </p>
                <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50 space-y-2">
                  <div className="flex justify-between items-center">
                    <span>Buy YES at 40¢</span>
                    <ChevronRight size={14} className="text-zinc-600" />
                    <span className="text-emerald-400">Win = +60¢ profit</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Buy NO at 25¢</span>
                    <ChevronRight size={14} className="text-zinc-600" />
                    <span className="text-emerald-400">Win = +75¢ profit</span>
                  </div>
                </div>
                <p className="text-zinc-500 text-xs">
                  The lower the price you buy at, the higher your potential profit!
                </p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/80 border-zinc-800/80 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-lg">
                  Your Wallet
                </CardTitle>
              </CardHeader>
              <CardContent className="text-zinc-400 text-sm space-y-3">
                <p>
                  SWAY uses Solana for fast, low-cost transactions. Your wallet holds:
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 bg-zinc-800/30 rounded-lg p-3">
                    <div className="w-8 h-8 rounded-full bg-[#9945FF]/20 flex items-center justify-center">
                      <span className="text-[#9945FF] font-bold text-xs">SOL</span>
                    </div>
                    <div>
                      <div className="text-zinc-300 font-medium">SOL (Gas)</div>
                      <div className="text-xs text-zinc-500">Pays transaction fees (~0.02 SOL needed)</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-zinc-800/30 rounded-lg p-3">
                    <div className="w-8 h-8 rounded-full bg-[#2775CA]/20 flex items-center justify-center">
                      <span className="text-[#2775CA] font-bold text-xs">$</span>
                    </div>
                    <div>
                      <div className="text-zinc-300 font-medium">USDC (Trading)</div>
                      <div className="text-xs text-zinc-500">Used to buy and sell market shares</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/80 border-zinc-800/80 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-lg">
                  Depositing Funds
                </CardTitle>
              </CardHeader>
              <CardContent className="text-zinc-400 text-sm space-y-3">
                <p>
                  Send SOL or USDC to your SWAY wallet address. The app will:
                </p>
                <div className="space-y-2 pl-1">
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center mt-0.5 shrink-0">
                      <span className="text-emerald-400 text-xs">1</span>
                    </div>
                    <span>Keep 0.02 SOL for gas fees</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center mt-0.5 shrink-0">
                      <span className="text-emerald-400 text-xs">2</span>
                    </div>
                    <span>Convert remaining SOL to USDC automatically</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center mt-0.5 shrink-0">
                      <span className="text-emerald-400 text-xs">3</span>
                    </div>
                    <span>USDC is ready to trade!</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/80 border-zinc-800/80 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-lg">
                  AI Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="text-zinc-400 text-sm space-y-3">
                <p>
                  Tap the mascot icon on any market card to get AI-powered analysis including:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-zinc-800/30 rounded-lg p-2 text-center">
                    <div className="text-zinc-300 text-xs">Market Context</div>
                  </div>
                  <div className="bg-zinc-800/30 rounded-lg p-2 text-center">
                    <div className="text-zinc-300 text-xs">Key Factors</div>
                  </div>
                  <div className="bg-zinc-800/30 rounded-lg p-2 text-center">
                    <div className="text-zinc-300 text-xs">Risk Analysis</div>
                  </div>
                  <div className="bg-zinc-800/30 rounded-lg p-2 text-center">
                    <div className="text-zinc-300 text-xs">Trade Ideas</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/80 border-zinc-800/80 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-lg">
                  Discovery Tab
                </CardTitle>
              </CardHeader>
              <CardContent className="text-zinc-400 text-sm space-y-3">
                <p>
                  Browse all 500+ markets in a list view. Filter by category:
                </p>
                <div className="flex flex-wrap gap-2">
                  {['Politics', 'Crypto', 'Sports', 'Tech', 'Entertainment', 'Economics', 'AI', 'Weather'].map((cat) => (
                    <span key={cat} className="px-2 py-1 bg-zinc-800/50 rounded-full text-xs text-zinc-300 border border-zinc-700/50">
                      {cat}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/80 border-zinc-800/80 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-lg">
                  Leaderboard
                </CardTitle>
              </CardHeader>
              <CardContent className="text-zinc-400 text-sm space-y-3">
                <p>
                  Compete with other traders! The leaderboard ranks traders by:
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between bg-zinc-800/30 rounded-lg p-3">
                    <span className="text-zinc-300">Total Profit</span>
                    <span className="text-emerald-400 font-medium">+$XXX</span>
                  </div>
                  <div className="flex items-center justify-between bg-zinc-800/30 rounded-lg p-3">
                    <span className="text-zinc-300">Win Rate</span>
                    <span className="text-emerald-400 font-medium">XX%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/80 border-zinc-800/80 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-lg">
                  Market Resolution
                </CardTitle>
              </CardHeader>
              <CardContent className="text-zinc-400 text-sm space-y-3">
                <p>
                  Markets resolve when the outcome is known. After resolution:
                </p>
                <div className="space-y-2 pl-1">
                  <div className="flex items-start gap-2">
                    <Shield size={14} className="text-emerald-400 mt-1 shrink-0" />
                    <span>Winning shares pay $1.00 each automatically</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Shield size={14} className="text-emerald-400 mt-1 shrink-0" />
                    <span>Funds are added to your USDC balance</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Shield size={14} className="text-emerald-400 mt-1 shrink-0" />
                    <span>Withdraw anytime to your wallet</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="text-center pt-4 pb-8">
              <div className="text-4xl font-black tracking-tighter bg-gradient-to-r from-emerald-400 via-[#1ED78B] to-emerald-500 bg-clip-text text-transparent">
                SWAY
              </div>
              <p className="text-zinc-600 text-xs mt-1">
                Powered by Kalshi & DFlow on Solana
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
