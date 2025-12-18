import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout';
import { useSettings } from '@/hooks/use-settings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Wallet, LogOut, Settings as SettingsIcon, Shield, CreditCard, ArrowDown, ArrowUp, TrendingUp, Link, Copy, Check, RefreshCw, X, ArrowRightLeft, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { usePrivySafe, PRIVY_ENABLED } from '@/hooks/use-privy-safe';
import { useSolanaBalance } from '@/hooks/use-solana-balance';
import { useAutoSwap } from '@/hooks/use-auto-swap';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { WithdrawModal } from '@/components/withdraw-modal';

function ProfileContent() {
  const { settings, updateWager, connectWallet, disconnectWallet } = useSettings();
  const { login, logout, authenticated, user, getAccessToken, ready, embeddedWallet, createWallet, fundWallet, exportWallet } = usePrivySafe();
  const { toast } = useToast();
  const [unifiedWager, setUnifiedWager] = useState(true);
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [depositCopied, setDepositCopied] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const walletAddress = embeddedWallet?.address || user?.wallet?.address || null;
  const { solBalance, usdcBalance, solPrice, totalPortfolioValue, isLoading: balanceLoading, refetch: refetchBalance } = useSolanaBalance(walletAddress);
  const { performAutoSwap, getSwapPreview, isSwapping, MIN_GAS_SOL } = useAutoSwap();
  
  const swapPreview = getSwapPreview(solBalance);
  
  const handleConvertToUsdc = async () => {
    const result = await performAutoSwap(solBalance);
    if (result.success) {
      toast({
        title: "Conversion Successful",
        description: `Swapped ${swapPreview.swapAmount.toFixed(4)} SOL for ~$${result.usdcReceived?.toFixed(2) || '0'} USDC`,
      });
      setConvertDialogOpen(false);
      refetchBalance();
    } else {
      toast({
        title: "Conversion Failed",
        description: result.error,
        variant: "destructive",
      });
    }
  };
  
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
                       onClick={() => setWithdrawModalOpen(true)}
                       className="h-7 px-2 sm:px-3 text-[10px] sm:text-xs gap-1.5 border-orange-500/20 hover:bg-orange-500/10 hover:text-orange-400 text-orange-400" 
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
                       onClick={() => setWithdrawModalOpen(true)}
                       className="h-7 px-2 sm:px-3 text-[10px] sm:text-xs gap-1.5 border-orange-500/20 hover:bg-orange-500/10 hover:text-orange-400 text-orange-400" 
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
                     <Button size="sm" variant="outline" className="h-7 px-2 sm:px-3 text-[10px] sm:text-xs gap-1.5 border-orange-500/20 hover:bg-orange-500/10 hover:text-orange-400 text-orange-400">
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
                 <div className="flex items-center justify-end gap-1 mb-0.5">
                   <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Portfolio</div>
                   <button 
                     onClick={refetchBalance} 
                     className={`p-0.5 hover:bg-white/10 rounded transition-colors ${balanceLoading ? 'animate-spin' : ''}`}
                     disabled={balanceLoading}
                   >
                     <RefreshCw size={10} className="text-zinc-500" />
                   </button>
                 </div>
                 <div className="text-lg sm:text-xl font-display font-bold text-white" data-testid="text-wallet-balance">
                   ${totalPortfolioValue.toFixed(2)}
                 </div>
                 <div className="text-[10px] font-mono text-zinc-500 flex flex-col items-end gap-0.5">
                   <span className="text-emerald-400">${usdcBalance.toFixed(2)} USDC</span>
                   <span>{solBalance.toFixed(4)} SOL</span>
                 </div>
                 {swapPreview.canSwap && (
                   <button 
                     onClick={() => setConvertDialogOpen(true)}
                     className="mt-2 text-[10px] px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded flex items-center gap-1 ml-auto"
                     data-testid="button-convert-usdc"
                   >
                     <ArrowRightLeft size={10} /> Convert to USDC
                   </button>
                 )}
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
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Your Pulse Wallet Address</div>
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
      
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <ArrowRightLeft className="text-blue-400" size={20} />
              Convert SOL to USDC
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Convert your SOL balance to USDC for betting. A small amount will be kept for gas fees.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700">
              <div className="flex justify-between items-center mb-3">
                <span className="text-zinc-400 text-sm">Converting</span>
                <span className="text-white font-mono">{swapPreview.swapAmount.toFixed(4)} SOL</span>
              </div>
              <div className="flex justify-between items-center mb-3">
                <span className="text-zinc-400 text-sm">Gas Reserve</span>
                <span className="text-zinc-500 font-mono">{MIN_GAS_SOL} SOL</span>
              </div>
              <div className="flex justify-between items-center mb-3">
                <span className="text-zinc-400 text-sm">Est. USDC Out</span>
                <span className="text-emerald-400 font-mono">~${(swapPreview.swapAmount * solPrice).toFixed(2)}</span>
              </div>
              <div className="h-px bg-zinc-700 my-3" />
              <div className="text-[10px] text-zinc-500">
                Powered by Jupiter aggregator. 0.5% max slippage.
              </div>
            </div>
            
            <Button 
              onClick={handleConvertToUsdc}
              disabled={isSwapping || !swapPreview.canSwap}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white"
              data-testid="button-confirm-convert"
            >
              {isSwapping ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Converting...
                </>
              ) : (
                <>
                  <ArrowRightLeft size={16} className="mr-2" />
                  Convert to USDC
                </>
              )}
            </Button>
            
            <Button 
              variant="outline" 
              onClick={() => setConvertDialogOpen(false)}
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      <WithdrawModal
        open={withdrawModalOpen}
        onOpenChange={setWithdrawModalOpen}
        solBalance={solBalance}
        usdcBalance={usdcBalance}
        onSuccess={refetchBalance}
      />
      
    </Layout>
  );
}

export default function Profile() {
  return <ProfileContent />;
}
