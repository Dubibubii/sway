import { useState, useEffect, useRef } from 'react';
import { Layout } from '@/components/layout';
import { useSettings } from '@/hooks/use-settings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Wallet, LogOut, Settings as SettingsIcon, Shield, CreditCard, ArrowDown, ArrowUp, TrendingUp, Link, Copy, Check, RefreshCw, X, Loader2, BarChart3, Fuel, DollarSign, PieChart } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { usePrivySafe, PRIVY_ENABLED } from '@/hooks/use-privy-safe';
import { useSolanaBalance } from '@/hooks/use-solana-balance';
import { useAutoSwap } from '@/hooks/use-auto-swap';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { WithdrawModal } from '@/components/withdraw-modal';
import { usePageView } from '@/hooks/use-analytics';
import { useQuery } from '@tanstack/react-query';

const DEV_WALLET = '9DZEWwT47BKZnutbyJ4L5T8uEaVkwbQY8SeL3ehHHXGY';

function ProfileContent() {
  usePageView('profile');
  
  const { settings, updateWager, connectWallet, disconnectWallet } = useSettings();
  const { login, logout, authenticated, user, getAccessToken, ready, embeddedWallet, externalWalletAddress, createWallet, fundWallet, exportWallet } = usePrivySafe();
  const { toast } = useToast();
  const [unifiedWager, setUnifiedWager] = useState(true);
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [depositCopied, setDepositCopied] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  
  // Prioritize external wallet when connected (e.g., Phantom) so signing works
  // Only use embedded wallet when no external wallet is connected
  const activeWalletAddress = externalWalletAddress || embeddedWallet?.address || user?.wallet?.address || null;
  const isUsingExternalWallet = !!externalWalletAddress;
  
  // Legacy reference for display purposes
  const walletAddress = activeWalletAddress;
  
  // Track the ACTIVE wallet balance for display (external or embedded)
  const { solBalance, usdcBalance, solPrice, totalPortfolioValue, isLoading: balanceLoading, refetch: refetchBalance } = useSolanaBalance(activeWalletAddress);
  
  // Also track EMBEDDED wallet balance separately for auto-swap detection
  // This is needed because deposits always go to embedded wallet, even when using external wallet
  const { solBalance: embeddedSolBalance, refetch: refetchEmbeddedBalance } = useSolanaBalance(embeddedWallet?.address || null);
  
  const { checkAndAutoSwap, resetPreviousBalance, isSwapping } = useAutoSwap();
  
  // Fetch user's positions to calculate portfolio value
  const { data: positionsData } = useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      const token = await getAccessToken();
      const res = await fetch('/api/positions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return { positions: [] };
      return res.json() as Promise<{ positions: Array<{ shares: string; price: string }> }>;
    },
    enabled: authenticated,
  });
  
  // Calculate positions value from active positions
  const positionsValue = (positionsData?.positions || []).reduce((acc, pos) => {
    const shares = parseFloat(pos.shares) || 0;
    const price = parseFloat(pos.price) || 0;
    return acc + (shares * price);
  }, 0);
  
  // Total portfolio = USDC available + positions value
  const totalBalance = usdcBalance + positionsValue;
  
  // Ref to track last processed balance and prevent duplicate auto-swap calls
  const lastProcessedBalanceRef = useRef<number>(0);

  // Auto-swap: triggered by EMBEDDED wallet balance changes (where deposits go)
  useEffect(() => {
    // Auto-swap for embedded wallet deposits - always enabled when embedded wallet exists
    // Only run if balance actually changed to prevent infinite loops
    if (embeddedWallet?.address && embeddedSolBalance > 0 && embeddedSolBalance !== lastProcessedBalanceRef.current) {
      lastProcessedBalanceRef.current = embeddedSolBalance;
      console.log('[Profile] Checking auto-swap for embedded wallet, SOL balance:', embeddedSolBalance);
      checkAndAutoSwap(
        embeddedSolBalance, 
        embeddedWallet.address,
        undefined, // No onStart notification - silent operation
        (result) => {
          if (result.success) {
            toast({ title: "Deposit Complete!", description: `Received ~$${result.usdcReceived?.toFixed(2) || '0'} USDC` });
            // Delay refetch to prevent immediate re-trigger
            setTimeout(() => {
              refetchBalance();
              refetchEmbeddedBalance();
            }, 1000);
          }
          // Don't show error toasts for auto-swap failures - only show success
        }
      );
    }
  }, [embeddedSolBalance, embeddedWallet?.address]);

  // Note: Removed resetPreviousBalance on wallet connect - it was preventing 
  // first deposit detection by setting previous = current before the check ran
  
  const calculateBetsLeft = (wagerAmount: number) => {
    if (usdcBalance <= 0 || wagerAmount <= 0) return 0;
    return Math.floor(usdcBalance / wagerAmount);
  };

  const copyToClipboard = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  const handleDeposit = async (address: string) => {
    console.log('handleDeposit called with address:', address);
    try {
      await fundWallet(address);
    } catch (error) {
      console.error('Privy fundWallet error:', error);
      setDepositAddress(address);
      setDepositDialogOpen(true);
    }
  };
  
  const copyDepositAddress = async () => {
    if (depositAddress) {
      try {
        await navigator.clipboard.writeText(depositAddress);
        setDepositCopied(true);
        setTimeout(() => setDepositCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  useEffect(() => {
    if (!PRIVY_ENABLED) return;
    const syncPrivyUser = async () => {
      if (ready && authenticated && user && !settings.connected) {
        const walletAddress = user.wallet?.address || user.email?.address || 'Unknown';
        const token = await getAccessToken();
        await connectWallet(user.id, walletAddress, token || undefined);
      }
    };
    syncPrivyUser();
  }, [ready, authenticated, user]);

  const handleUnifiedChange = (val: number[]) => {
    updateWager('yes', val[0]);
    updateWager('no', val[0]);
  };

  return (
    <Layout>
      <div className="min-h-screen bg-background px-6 pb-24 pt-28 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-display font-bold">Profile</h1>
          <Button variant="ghost" size="icon">
            <SettingsIcon size={24} />
          </Button>
        </div>

        {/* Balance Hero Section */}
        {(authenticated && (embeddedWallet || user?.wallet)) || settings.connected ? (
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-xs text-zinc-400 font-bold uppercase tracking-widest">Available Balance</span>
              <button 
                onClick={refetchBalance} 
                className={`p-1 hover:bg-white/10 rounded transition-colors ${balanceLoading ? 'animate-spin' : ''}`}
                disabled={balanceLoading}
              >
                <RefreshCw size={12} className="text-zinc-500" />
              </button>
            </div>
            <div className="text-5xl sm:text-6xl font-display font-bold text-white mb-4" data-testid="text-wallet-balance">
              ${usdcBalance.toFixed(2)}
            </div>
            
            <div className="flex items-center justify-center gap-4 sm:gap-6 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <PieChart size={12} className="text-blue-400" />
                <span className="text-zinc-500">In Positions</span>
                <span className="text-blue-400 font-medium">${positionsValue.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Fuel size={12} className="text-orange-400" />
                <span className="text-zinc-500">Gas Fees</span>
                <span className="text-orange-400 font-medium">{solBalance.toFixed(4)} SOL</span>
              </div>
            </div>
            
            {isSwapping && (
              <div className="mt-3 text-xs px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-full inline-flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" /> Converting SOL to USDC...
              </div>
            )}
            {activeWalletAddress && solBalance > 0.01 && !isSwapping && (
              <div className="mt-3">
                <Button
                  size="sm"
                  variant={isUsingExternalWallet ? "default" : "outline"}
                  onClick={() => {
                    console.log('[ForceConvert] Button clicked, SOL balance:', solBalance, 'wallet:', activeWalletAddress);
                    checkAndAutoSwap(
                      solBalance,
                      activeWalletAddress,
                      () => toast({ title: "Converting SOL to USDC...", description: `Swapping ${(solBalance - 0.008).toFixed(4)} SOL` }),
                      (result) => {
                        if (result.success) {
                          toast({ title: "Conversion Complete!", description: `Received ~$${result.usdcReceived?.toFixed(2) || '0'} USDC` });
                          refetchBalance();
                        } else {
                          toast({ title: "Conversion Failed", description: result.error || "Check console for details", variant: "destructive" });
                        }
                      },
                      true
                    );
                  }}
                  className={`h-8 px-4 text-xs gap-1.5 ${
                    isUsingExternalWallet 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white border-0 animate-pulse' 
                      : 'border-blue-500/30 hover:bg-blue-500/10 text-blue-400'
                  }`}
                  data-testid="button-force-convert"
                >
                  <RefreshCw size={14} /> Convert SOL → USDC
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {/* User Card - Centered */}
        <Card className="glass-panel border-0 mb-6">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col items-center text-center">
              <Avatar className="w-16 h-16 sm:w-20 sm:h-20 border-2 border-primary/20 mb-3">
                <AvatarImage src="https://github.com/shadcn.png" />
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
              <h2 className="text-lg sm:text-xl font-bold mb-2">Crypto Trader</h2>
              
              {authenticated && embeddedWallet ? (
                <div className="space-y-3">
                  <div className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold uppercase inline-block">SWAY Wallet</div>
                  <button 
                    onClick={() => copyToClipboard(embeddedWallet.address)}
                    className="flex items-center justify-center gap-2 text-primary text-sm font-mono hover:opacity-80 transition-opacity cursor-pointer group" 
                    data-testid="text-embedded-wallet-address"
                  >
                    <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                    {embeddedWallet.address.slice(0, 4)}...{embeddedWallet.address.slice(-4)}
                    {copiedAddress ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} className="opacity-50 group-hover:opacity-100" />}
                  </button>
                  <div className="flex justify-center gap-3 pt-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleDeposit(embeddedWallet.address)}
                      className="h-9 px-4 text-sm gap-2 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-400 text-emerald-500" 
                      data-testid="button-deposit"
                    >
                      <ArrowDown size={16} /> Deposit
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => setWithdrawModalOpen(true)}
                      className="h-9 px-4 text-sm gap-2 border-orange-500/30 hover:bg-orange-500/10 hover:text-orange-400 text-orange-400" 
                      data-testid="button-withdraw"
                    >
                      <ArrowUp size={16} /> Withdraw
                    </Button>
                  </div>
                </div>
              ) : authenticated && user?.wallet ? (
                <div className="space-y-3">
                  <div className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-semibold uppercase inline-block">External Wallet</div>
                  <button 
                    onClick={() => copyToClipboard(user.wallet!.address)}
                    className="flex items-center justify-center gap-2 text-primary text-sm font-mono hover:opacity-80 transition-opacity cursor-pointer group" 
                    data-testid="text-external-wallet-address"
                  >
                    <div className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                    {user.wallet.address.slice(0, 4)}...{user.wallet.address.slice(-4)}
                    {copiedAddress ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} className="opacity-50 group-hover:opacity-100" />}
                  </button>
                  <div className="flex justify-center gap-3 pt-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleDeposit(user.wallet!.address)}
                      className="h-9 px-4 text-sm gap-2 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-400 text-emerald-500" 
                      data-testid="button-deposit"
                    >
                      <ArrowDown size={16} /> Deposit
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => setWithdrawModalOpen(true)}
                      className="h-9 px-4 text-sm gap-2 border-orange-500/30 hover:bg-orange-500/10 hover:text-orange-400 text-orange-400" 
                      data-testid="button-withdraw"
                    >
                      <ArrowUp size={16} /> Withdraw
                    </Button>
                  </div>
                </div>
              ) : authenticated && !embeddedWallet ? (
                <div className="space-y-3">
                  <div className="text-muted-foreground text-sm">Signed in with {user?.email?.address ? 'email' : 'social login'}</div>
                  <Button 
                    size="sm" 
                    onClick={async () => {
                      setIsCreatingWallet(true);
                      try {
                        await createWallet();
                      } finally {
                        setIsCreatingWallet(false);
                      }
                    }}
                    disabled={isCreatingWallet}
                    className="h-9 px-4 text-sm gap-2 bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600"
                    data-testid="button-create-wallet"
                  >
                    <Wallet size={16} /> {isCreatingWallet ? 'Creating...' : 'Create SWAY Wallet'}
                  </Button>
                </div>
              ) : settings.connected ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2 text-primary text-sm font-mono">
                    <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                    {settings.walletAddress?.slice(0, 4)}...{settings.walletAddress?.slice(-4)}
                  </div>
                  <div className="flex justify-center gap-3 pt-2">
                    <Button size="sm" variant="outline" className="h-9 px-4 text-sm gap-2 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-400 text-emerald-500">
                      <ArrowDown size={16} /> Deposit
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 px-4 text-sm gap-2 border-orange-500/30 hover:bg-orange-500/10 hover:text-orange-400 text-orange-400">
                      <ArrowUp size={16} /> Withdraw
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">Wallet not connected</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Trading Settings */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-muted-foreground uppercase tracking-wider text-xs ml-1">Trading Preferences</h3>
            <div className="flex items-center gap-2">
              <Label htmlFor="unified-wager" className="text-xs text-muted-foreground">Use same amount for both</Label>
              <Switch 
                id="unified-wager" 
                checked={unifiedWager} 
                onCheckedChange={setUnifiedWager}
              />
            </div>
          </div>
          
          {unifiedWager ? (
            <Card className="glass-panel border-0">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Default Wager</span>
                  <div className="text-right">
                    <span className="text-white font-mono text-xl block">${settings.yesWager}</span>
                    {(authenticated || settings.connected) && (
                      <span className="text-[10px] text-muted-foreground font-normal tracking-wide uppercase">
                        {calculateBetsLeft(settings.yesWager)} bets left
                      </span>
                    )}
                  </div>
                </CardTitle>
                <CardDescription>Single wager amount for all trades</CardDescription>
              </CardHeader>
              <CardContent>
                <Slider 
                  value={[settings.yesWager]} 
                  onValueChange={handleUnifiedChange} 
                  max={100} 
                  step={1}
                  className="py-4"
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="glass-panel border-0">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Swipe Right (YES)</span>
                    <div className="text-right">
                      <span className="text-primary font-mono text-xl block">${settings.yesWager}</span>
                      {(authenticated || settings.connected) && (
                        <span className="text-[10px] text-muted-foreground font-normal tracking-wide uppercase">
                          {calculateBetsLeft(settings.yesWager)} bets left
                        </span>
                      )}
                    </div>
                  </CardTitle>
                  <CardDescription>Default wager amount for YES trades</CardDescription>
                </CardHeader>
                <CardContent>
                  <Slider 
                    value={[settings.yesWager]} 
                    onValueChange={(val) => updateWager('yes', val[0])} 
                    max={100} 
                    step={1}
                    className="py-4"
                  />
                </CardContent>
              </Card>

              <Card className="glass-panel border-0">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Swipe Left (NO)</span>
                    <div className="text-right">
                      <span className="text-destructive font-mono text-xl block">${settings.noWager}</span>
                      {(authenticated || settings.connected) && (
                        <span className="text-[10px] text-muted-foreground font-normal tracking-wide uppercase">
                          {calculateBetsLeft(settings.noWager)} bets left
                        </span>
                      )}
                    </div>
                  </CardTitle>
                  <CardDescription>Default wager amount for NO trades</CardDescription>
                </CardHeader>
                <CardContent>
                  <Slider 
                    value={[settings.noWager]} 
                    onValueChange={(val) => updateWager('no', val[0])} 
                    max={100} 
                    step={1}
                    className="py-4" 
                  />
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Developer Dashboard Link - only visible to DEV_WALLET */}
        {activeWalletAddress === DEV_WALLET && (
          <div className="mt-8">
            <Button 
              data-testid="button-developer-dashboard"
              className="w-full bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30"
              variant="outline"
              onClick={() => window.location.href = '/developer'}
            >
              <BarChart3 className="mr-2" size={18} /> Developer Analytics
            </Button>
          </div>
        )}

        {/* Wallet Section */}
        <div className="space-y-6 mt-8">
           {authenticated || settings.connected ? (
             <Button variant="destructive" className="w-full" onClick={async () => {
               await logout();
               disconnectWallet();
             }}>
               <LogOut className="mr-2" size={18} /> Disconnect Wallet
             </Button>
           ) : (
             <Button className="w-full bg-white text-black hover:bg-white/90" onClick={async () => {
               await login();
             }}>
               <Wallet className="mr-2" size={18} /> Connect Wallet
             </Button>
           )}
        </div>
      </div>
      
      <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <ArrowDown className="text-emerald-400" size={20} />
              Deposit SOL
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Send SOL from your Phantom or other Solana wallet to this address
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700">
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Your SWAY Wallet Address</div>
              <div className="font-mono text-sm text-white break-all mb-3">
                {depositAddress}
              </div>
              <Button 
                onClick={copyDepositAddress}
                className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30"
                variant="outline"
              >
                {depositCopied ? (
                  <>
                    <Check size={16} className="mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={16} className="mr-2" />
                    Copy Address
                  </>
                )}
              </Button>
            </div>
            
            <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-500/20">
              <p className="text-xs text-blue-300">
                <strong>Tip:</strong> Open Phantom, tap Send, paste this address, and send your desired amount of SOL.
              </p>
            </div>
            
            <Button 
              variant="outline" 
              onClick={() => {
                setDepositDialogOpen(false);
                refetchBalance();
              }}
              className="w-full"
            >
              Done - Refresh Balance
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      <WithdrawModal
        open={withdrawModalOpen}
        onOpenChange={setWithdrawModalOpen}
        solBalance={solBalance}
        usdcBalance={usdcBalance}
        walletAddress={walletAddress}
        externalWalletAddress={externalWalletAddress}
        onSuccess={refetchBalance}
      />
      
    </Layout>
  );
}

export default function Profile() {
  return <ProfileContent />;
}
