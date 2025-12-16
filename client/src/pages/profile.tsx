import { useState } from 'react';
import { Layout } from '@/components/layout';
import { useSettings } from '@/hooks/use-settings';
import { useTheme } from 'next-themes';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Wallet, LogOut, Shield, CreditCard, ArrowDown, ArrowUp, TrendingUp, Link, Sun, Moon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';

export default function Profile() {
  const { settings, updateWager, connectWallet, disconnectWallet } = useSettings();
  const [unifiedWager, setUnifiedWager] = useState(true);
  const { theme, setTheme } = useTheme();

  const handleUnifiedChange = (val: number[]) => {
    updateWager('yes', val[0]);
    updateWager('no', val[0]);
  };

  return (
    <Layout>
      <div className="min-h-screen bg-background px-6 pb-24 pt-28 overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-display font-bold">Profile</h1>
          <div className="flex items-center gap-2">
            <Label htmlFor="dark-mode" className="text-sm font-medium">Dark Mode</Label>
            <Switch 
              id="dark-mode"
              checked={theme === 'dark'}
              onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
            />
          </div>
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
              {settings.connected ? (
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

            {settings.connected && (
               <div className="text-right pl-2 shrink-0">
                 <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mb-0.5">Balance</div>
                 <div className="text-lg sm:text-xl font-display font-bold text-white">
                   $12,450
                 </div>
                 <div className="text-xs font-mono text-emerald-400 flex items-center justify-end gap-1">
                   <TrendingUp size={12} /> +2.4%
                 </div>
               </div>
            )}
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

        {/* Wallet Section */}
        <div className="space-y-6 mt-8">
           {settings.connected ? (
             <Button variant="destructive" className="w-full" onClick={disconnectWallet}>
               <LogOut className="mr-2" size={18} /> Disconnect Wallet
             </Button>
           ) : (
             <Button className="w-full bg-white text-black hover:bg-white/90" onClick={connectWallet}>
               <Wallet className="mr-2" size={18} /> Connect Wallet
             </Button>
           )}
        </div>
      </div>
    </Layout>
  );
}
