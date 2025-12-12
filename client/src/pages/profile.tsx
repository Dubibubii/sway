import { Layout } from '@/components/layout';
import { useSettings } from '@/hooks/use-settings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Wallet, LogOut, Settings as SettingsIcon, Shield, CreditCard } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';

export default function Profile() {
  const { settings, updateWager, connectWallet, disconnectWallet } = useSettings();

  return (
    <Layout>
      <div className="min-h-screen bg-background p-6 pb-24 overflow-y-auto">
        <div className="flex items-center justify-between mb-8 mt-4">
          <h1 className="text-3xl font-display font-bold">Profile</h1>
          <Button variant="ghost" size="icon">
            <SettingsIcon size={24} />
          </Button>
        </div>

        {/* User Card */}
        <Card className="glass-panel border-0 mb-6">
          <CardContent className="pt-6 flex items-center gap-4">
            <Avatar className="w-16 h-16 border-2 border-primary/20">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-bold">Crypto Trader</h2>
              {settings.connected ? (
                 <div className="flex items-center gap-2 text-primary text-sm font-mono mt-1">
                   <div className="w-2 h-2 rounded-full bg-primary" />
                   {settings.walletAddress}
                 </div>
              ) : (
                <div className="text-muted-foreground text-sm mt-1">Wallet not connected</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Trading Settings */}
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-muted-foreground uppercase tracking-wider text-xs ml-1">Trading Preferences</h3>
          
          <Card className="glass-panel border-0">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Swipe Right (YES)</span>
                <span className="text-primary font-mono text-xl">${settings.yesWager}</span>
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
                <span className="text-destructive font-mono text-xl">${settings.noWager}</span>
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
        </div>

        {/* Wallet Section */}
        <div className="space-y-6 mt-8">
           <h3 className="text-lg font-semibold text-muted-foreground uppercase tracking-wider text-xs ml-1">Wallet & Security</h3>
           
           <Card className="bg-card/30 border-white/5">
             <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <div className="p-2 rounded-full bg-blue-500/10 text-blue-400">
                        <CreditCard size={20} />
                     </div>
                     <span className="font-medium">Auto-Topup</span>
                   </div>
                   <Switch />
                </div>
                <Separator className="bg-white/5" />
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <div className="p-2 rounded-full bg-green-500/10 text-green-400">
                        <Shield size={20} />
                     </div>
                     <span className="font-medium">Biometric Confirm</span>
                   </div>
                   <Switch defaultChecked />
                </div>
             </CardContent>
           </Card>

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
