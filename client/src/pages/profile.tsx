import { useState, useEffect, useCallback } from 'react';
import { Layout } from '@/components/layout';
import { useSettings } from '@/hooks/use-settings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Wallet, LogOut, Settings as SettingsIcon, Shield, CreditCard, ArrowDown, ArrowUp, TrendingUp, Link, Copy, Check, RefreshCw, QrCode, ExternalLink } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { usePrivySafe, PRIVY_ENABLED } from '@/hooks/use-privy-safe';

// Solana mainnet RPC endpoint
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

// Fetch SOL balance from Solana RPC
async function fetchSolBalance(address: string): Promise<number> {
  try {
    const response = await fetch(SOLANA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [address],
      }),
    });
    const data = await response.json();
    if (data.result?.value !== undefined) {
      // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
      return data.result.value / 1_000_000_000;
    }
    return 0;
  } catch (error) {
    console.error('Error fetching SOL balance:', error);
    return 0;
  }
}

function ProfileContent() {
  const { settings, updateWager, updateInterests, connectWallet, disconnectWallet } = useSettings();
  const { login, logout, authenticated, user, getAccessToken, ready, embeddedWallet, createWallet, fundWallet, exportWallet } = usePrivySafe();
  const [unifiedWager, setUnifiedWager] = useState(true);
  const [selectedInterests, setSelectedInterests] = useState<string[]>(settings.interests.length > 0 ? settings.interests : ["Crypto", "Tech"]);
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [solBalance, setSolBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  // Fetch wallet balance
  const refreshBalance = useCallback(async () => {
    const walletAddress = embeddedWallet?.address || user?.wallet?.address;
    if (!walletAddress) return;
    
    setIsLoadingBalance(true);
    try {
      const balance = await fetchSolBalance(walletAddress);
      setSolBalance(balance);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [embeddedWallet?.address, user?.wallet?.address]);

  // Auto-refresh balance when wallet changes
  useEffect(() => {
    if (authenticated && (embeddedWallet || user?.wallet)) {
      refreshBalance();
      // Refresh every 10 seconds
      const interval = setInterval(refreshBalance, 10000);
      return () => clearInterval(interval);
    }
  }, [authenticated, embeddedWallet, user?.wallet, refreshBalance]);

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
    await fundWallet(address);
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

  useEffect(() => {
    if (settings.interests.length > 0) {
      setSelectedInterests(settings.interests);
    }
  }, [settings.interests]);

  const INTERESTS = [
    "Crypto", "Politics", "Sports", "Economics", 
    "Tech", "AI", "Weather", "General"
  ];

  const toggleInterest = (interest: string) => {
    const newInterests = selectedInterests.includes(interest) 
      ? selectedInterests.filter(i => i !== interest)
      : [...selectedInterests, interest];
    setSelectedInterests(newInterests);
    updateInterests(newInterests);
  };

  const handleUnifiedChange = (val: number[]) => {
    updateWager('yes', val[0]);
    updateWager('no', val[0]);
  };

  return (
    <Layout>
      <div className="min-h-screen bg-background px-6 pb-24 pt-28 overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-display font-bold">Profile</h1>
          <Button variant="ghost" size="icon">
            <SettingsIcon size={24} />
          </Button>
        </div>

        {/* User Card */}
        <Card className="glass-panel border-0 mb-6">
          <CardContent className="p-4 sm:p-6 flex items-center gap-3 sm:gap-4">
            <Avatar className="w-12 h-12 sm:w-16 sm:h-16 border-2 border-primary/20">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl font-bold truncate">Crypto Trader</h2>
              {authenticated && embeddedWallet ? (
                 <div className="space-y-2 sm:space-y-3">
                   <div className="flex items-center gap-2 text-xs sm:text-sm mt-1">
                     <div className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold uppercase">Pulse Wallet</div>
                   </div>
                   <button 
                     onClick={() => copyToClipboard(embeddedWallet.address)}
                     className="flex items-center gap-2 text-primary text-xs sm:text-sm font-mono truncate hover:opacity-80 transition-opacity cursor-pointer group" 
                     data-testid="text-embedded-wallet-address"
                   >
                     <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                     {embeddedWallet.address.slice(0, 4)}...{embeddedWallet.address.slice(-4)}
                     {copiedAddress ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="opacity-50 group-hover:opacity-100" />}
                   </button>
                   <div className="flex gap-2">
                     <Button 
                       size="sm" 
                       variant="outline" 
                       onClick={() => handleDeposit(embeddedWallet.address)}
                       className="h-7 px-2 sm:px-3 text-[10px] sm:text-xs gap-1.5 border-emerald-500/20 hover:bg-emerald-500/10 hover:text-emerald-400 text-emerald-500" 
                       data-testid="button-deposit"
                     >
                       <ArrowDown size={12} /> Deposit
                     </Button>
                     <Button 
                       size="sm" 
                       variant="outline" 
                       onClick={exportWallet}
                       className="h-7 px-2 sm:px-3 text-[10px] sm:text-xs gap-1.5 border-white/10 hover:bg-white/5" 
                       data-testid="button-withdraw"
                     >
                       <ArrowUp size={12} /> Withdraw
                     </Button>
                   </div>
                 </div>
              ) : authenticated && user?.wallet ? (
                 <div className="space-y-2 sm:space-y-3">
                   <div className="flex items-center gap-2 text-xs sm:text-sm mt-1">
                     <div className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[10px] font-semibold uppercase">External Wallet</div>
                   </div>
                   <button 
                     onClick={() => copyToClipboard(user.wallet!.address)}
                     className="flex items-center gap-2 text-primary text-xs sm:text-sm font-mono truncate hover:opacity-80 transition-opacity cursor-pointer group" 
                     data-testid="text-external-wallet-address"
                   >
                     <div className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                     {user.wallet.address.slice(0, 4)}...{user.wallet.address.slice(-4)}
                     {copiedAddress ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="opacity-50 group-hover:opacity-100" />}
                   </button>
                   <div className="flex gap-2">
                     <Button 
                       size="sm" 
                       variant="outline" 
                       onClick={() => handleDeposit(user.wallet!.address)}
                       className="h-7 px-2 sm:px-3 text-[10px] sm:text-xs gap-1.5 border-emerald-500/20 hover:bg-emerald-500/10 hover:text-emerald-400 text-emerald-500" 
                       data-testid="button-deposit"
                     >
                       <ArrowDown size={12} /> Deposit
                     </Button>
                     <Button 
                       size="sm" 
                       variant="outline" 
                       onClick={exportWallet}
                       className="h-7 px-2 sm:px-3 text-[10px] sm:text-xs gap-1.5 border-white/10 hover:bg-white/5" 
                       data-testid="button-withdraw"
                     >
                       <ArrowUp size={12} /> Withdraw
                     </Button>
                   </div>
                 </div>
              ) : authenticated && !embeddedWallet ? (
                <div className="space-y-2 sm:space-y-3 mt-2">
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
                    className="h-8 px-3 text-xs gap-1.5 bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600"
                    data-testid="button-create-wallet"
                  >
                    <Wallet size={14} /> {isCreatingWallet ? 'Creating...' : 'Create Pulse Wallet'}
                  </Button>
                </div>
              ) : settings.connected ? (
                 <div className="space-y-2 sm:space-y-3">
                   <div className="flex items-center gap-2 text-primary text-xs sm:text-sm font-mono mt-1 truncate">
                     <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                     {settings.walletAddress}
                   </div>
                   <div className="flex gap-2">
                     <Button size="sm" variant="outline" className="h-7 px-2 sm:px-3 text-[10px] sm:text-xs gap-1.5 border-emerald-500/20 hover:bg-emerald-500/10 hover:text-emerald-400 text-emerald-500">
                       <ArrowDown size={12} /> Deposit
                     </Button>
                     <Button size="sm" variant="outline" className="h-7 px-2 sm:px-3 text-[10px] sm:text-xs gap-1.5 border-white/10 hover:bg-white/5">
                       <ArrowUp size={12} /> Withdraw
                     </Button>
                   </div>
                 </div>
              ) : (
                <div className="text-muted-foreground text-sm mt-1">Wallet not connected</div>
              )}
            </div>

            {(authenticated && (embeddedWallet || user?.wallet)) || settings.connected ? (
               <div className="text-right pl-2 shrink-0">
                 <div className="flex items-center gap-1 justify-end mb-0.5">
                   <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Balance</div>
                   <button 
                     onClick={refreshBalance} 
                     disabled={isLoadingBalance}
                     className="p-0.5 hover:bg-white/10 rounded transition-colors"
                     data-testid="button-refresh-balance"
                   >
                     <RefreshCw size={10} className={`text-zinc-500 ${isLoadingBalance ? 'animate-spin' : ''}`} />
                   </button>
                 </div>
                 <div className="text-lg sm:text-xl font-display font-bold text-white" data-testid="text-wallet-balance">
                   ${(solBalance * 200).toFixed(2)}
                 </div>
                 <div className="text-xs font-mono text-zinc-500 flex items-center justify-end gap-1">
                   {solBalance.toFixed(4)} SOL
                 </div>
               </div>
            ) : null}
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
                    {settings.connected && (
                      <span className="text-[10px] text-muted-foreground font-normal tracking-wide uppercase">
                        {Math.floor(12450 / settings.yesWager)} bets left
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
                      {settings.connected && (
                        <span className="text-[10px] text-muted-foreground font-normal tracking-wide uppercase">
                          {Math.floor(12450 / settings.yesWager)} bets left
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
                      {settings.connected && (
                        <span className="text-[10px] text-muted-foreground font-normal tracking-wide uppercase">
                          {Math.floor(12450 / settings.noWager)} bets left
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

        {/* Interests Section */}
        <div className="space-y-6 mt-8">
          <h3 className="text-lg font-semibold text-muted-foreground uppercase tracking-wider text-xs ml-1">Interests</h3>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((interest) => (
              <div
                key={interest}
                onClick={() => toggleInterest(interest)}
                className={`
                  px-4 py-2 rounded-full text-sm font-medium cursor-pointer transition-all duration-200 border select-none
                  ${selectedInterests.includes(interest) 
                    ? 'bg-primary/20 border-primary text-primary shadow-[0_0_10px_rgba(16,185,129,0.2)]' 
                    : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10 hover:text-white'
                  }
                `}
              >
                {interest}
              </div>
            ))}
          </div>
        </div>

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

      {/* Deposit Dialog */}
      <Dialog open={showDepositDialog} onOpenChange={setShowDepositDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center">Deposit SOL</DialogTitle>
            <DialogDescription className="text-center text-zinc-400">
              Send SOL to your Pulse wallet on Solana Devnet
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="text-center">
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Your Wallet Address</div>
              <div className="bg-zinc-800 rounded-lg p-4">
                <code className="text-xs sm:text-sm text-emerald-400 break-all font-mono">
                  {embeddedWallet?.address || user?.wallet?.address || ''}
                </code>
              </div>
            </div>
            
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2"
              onClick={() => copyDepositAddress(embeddedWallet?.address || user?.wallet?.address || '')}
            >
              {depositAddressCopied ? <Check size={16} /> : <Copy size={16} />}
              {depositAddressCopied ? 'Copied!' : 'Copy Address'}
            </Button>

            <div className="text-center text-xs text-zinc-500 pt-2">
              <p className="mb-2">For testing on Devnet:</p>
              <a 
                href="https://faucet.solana.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center justify-center gap-1"
              >
                Get free SOL from faucet <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

export default function Profile() {
  return <ProfileContent />;
}
