import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowUp, Loader2, AlertCircle, Wallet, ChevronDown, Edit2 } from 'lucide-react';
import { useWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import { buildWithdrawalTransaction, validateSolanaAddress, MIN_SOL_RESERVE } from '@/utils/withdraw';
import { useToast } from '@/hooks/use-toast';

interface WithdrawModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  solBalance: number;
  usdcBalance: number;
  walletAddress: string | null;
  onSuccess: () => void;
}

export function WithdrawModal({ open, onOpenChange, solBalance, usdcBalance, walletAddress, onSuccess }: WithdrawModalProps) {
  const { wallets } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { toast } = useToast();
  
  const [token, setToken] = useState<'SOL' | 'USDC'>('USDC');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);

  const externalWallets = useMemo(() => {
    return wallets.filter((w: any) => 
      w.walletClientType !== 'privy' && 
      (w.chainType === 'solana' || w.type === 'solana')
    );
  }, [wallets]);

  const privyWallet = useMemo(() => {
    return wallets.find((w: any) => w.walletClientType === 'privy');
  }, [wallets]);

  useEffect(() => {
    if (open && externalWallets.length > 0 && !recipient) {
      setRecipient(externalWallets[0].address);
      setShowManualEntry(false);
    }
  }, [open, externalWallets]);

  const availableBalance = token === 'SOL' 
    ? Math.max(0, solBalance - MIN_SOL_RESERVE) 
    : usdcBalance;

  const isValidAddress = recipient.length > 0 ? validateSolanaAddress(recipient) : true;
  const numAmount = parseFloat(amount) || 0;
  const isValidAmount = numAmount > 0 && numAmount <= availableBalance;
  const canSubmit = isValidAddress && isValidAmount && recipient.length > 0 && !isWithdrawing;

  const handleMaxClick = () => {
    setAmount(availableBalance.toFixed(token === 'SOL' ? 6 : 2));
  };

  const handleSelectWallet = (address: string) => {
    setRecipient(address);
    setShowManualEntry(false);
  };

  const handleWithdraw = async () => {
    if (!canSubmit) return;

    setIsWithdrawing(true);
    setError(null);

    try {
      const solanaWallet = wallets.find((w: any) => w.walletClientType === 'privy' || w.type === 'solana' || w.chainType === 'solana');
      
      const fromAddress = walletAddress || solanaWallet?.address;
      if (!fromAddress) {
        throw new Error('No Solana wallet connected');
      }

      const result = await buildWithdrawalTransaction(
        token,
        numAmount,
        fromAddress,
        recipient
      );

      if (!result.success || !result.transaction) {
        throw new Error(result.error || 'Failed to build transaction');
      }

      const walletForSigning = privyWallet || solanaWallet || wallets[0];
      if (!walletForSigning) {
        throw new Error('No wallet available for signing');
      }

      const txResult = await signAndSendTransaction({
        transaction: result.transaction.serialize(),
        wallet: walletForSigning,
      });

      const signature = (txResult as any)?.hash || (txResult as any)?.signature || 'unknown';

      toast({
        title: "Withdrawal Successful",
        description: `Sent ${numAmount} ${token} to ${recipient.slice(0, 4)}...${recipient.slice(-4)}`,
      });

      setRecipient('');
      setAmount('');
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      let errorMessage = err.message || 'Withdrawal failed';
      
      if (errorMessage.includes('insufficient funds') || errorMessage.includes('0x1')) {
        errorMessage = 'Insufficient balance for this transaction. Make sure you have enough SOL for fees.';
      } else if (errorMessage.includes('blockhash')) {
        errorMessage = 'Network congestion. Please try again.';
      }
      
      setError(errorMessage);
      toast({
        title: "Withdrawal Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsWithdrawing(false);
    }
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <ArrowUp className="text-orange-400" size={20} />
            Withdraw Funds
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Send SOL or USDC to your external wallet
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 pt-4">
          <div className="flex gap-2">
            <button
              onClick={() => setToken('USDC')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                token === 'USDC' 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'
              }`}
              data-testid="button-token-usdc"
            >
              USDC
            </button>
            <button
              onClick={() => setToken('SOL')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                token === 'SOL' 
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' 
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'
              }`}
              data-testid="button-token-sol"
            >
              SOL
            </button>
          </div>

          <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
            <div className="flex justify-between items-center">
              <span className="text-xs text-zinc-500 uppercase">Available Balance</span>
              <span className="text-sm font-mono text-white">
                {token === 'SOL' 
                  ? `${availableBalance.toFixed(6)} SOL`
                  : `$${availableBalance.toFixed(2)} USDC`
                }
              </span>
            </div>
            {token === 'SOL' && (
              <div className="text-[10px] text-zinc-500 mt-1">
                {MIN_SOL_RESERVE} SOL reserved for transaction fees
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-sm text-zinc-400">Withdraw To</Label>
              {!showManualEntry && (
                <button
                  onClick={() => setShowManualEntry(true)}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  data-testid="button-enter-custom"
                >
                  <Edit2 size={10} />
                  Enter custom
                </button>
              )}
            </div>
            
            {showManualEntry ? (
              <div className="space-y-2">
                <Input
                  id="recipient"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="Enter Solana wallet address"
                  className={`bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 ${
                    recipient.length > 0 && !isValidAddress ? 'border-red-500' : ''
                  }`}
                  data-testid="input-recipient"
                />
                {externalWallets.length > 0 && (
                  <button
                    onClick={() => {
                      setRecipient(externalWallets[0].address);
                      setShowManualEntry(false);
                    }}
                    className="text-xs text-zinc-500 hover:text-zinc-400"
                  >
                    Use connected wallet instead
                  </button>
                )}
              </div>
            ) : externalWallets.length > 0 ? (
              <div className="space-y-2">
                {externalWallets.map((wallet: any) => (
                  <button
                    key={wallet.address}
                    onClick={() => handleSelectWallet(wallet.address)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      recipient === wallet.address
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700'
                    }`}
                    data-testid={`button-wallet-${wallet.address.slice(0, 8)}`}
                  >
                    <Wallet size={18} className={recipient === wallet.address ? 'text-emerald-400' : 'text-zinc-400'} />
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium">
                        {wallet.walletClientType === 'phantom' ? 'Phantom' : 
                         wallet.walletClientType === 'solflare' ? 'Solflare' :
                         wallet.walletClientType === 'backpack' ? 'Backpack' :
                         'External Wallet'}
                      </div>
                      <div className="text-xs text-zinc-500 font-mono">
                        {formatAddress(wallet.address)}
                      </div>
                    </div>
                    {recipient === wallet.address && (
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  id="recipient"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="Enter Solana wallet address"
                  className={`bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 ${
                    recipient.length > 0 && !isValidAddress ? 'border-red-500' : ''
                  }`}
                  data-testid="input-recipient"
                />
                <p className="text-[10px] text-zinc-500">
                  Connect an external wallet (Phantom, Solflare) to auto-select it
                </p>
              </div>
            )}
            
            {recipient.length > 0 && !isValidAddress && (
              <div className="flex items-center gap-1 text-red-400 text-xs">
                <AlertCircle size={12} />
                Invalid Solana address
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="amount" className="text-sm text-zinc-400">Amount</Label>
              <button
                onClick={handleMaxClick}
                className="text-xs text-blue-400 hover:text-blue-300"
                data-testid="button-max"
              >
                MAX
              </button>
            </div>
            <Input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Enter ${token} amount`}
              className={`bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 ${
                numAmount > 0 && !isValidAmount ? 'border-red-500' : ''
              }`}
              data-testid="input-amount"
            />
            {numAmount > availableBalance && (
              <div className="flex items-center gap-1 text-red-400 text-xs">
                <AlertCircle size={12} />
                Insufficient balance
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <Button 
            onClick={handleWithdraw}
            disabled={!canSubmit}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50"
            data-testid="button-confirm-withdraw"
          >
            {isWithdrawing ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Withdrawing...
              </>
            ) : (
              <>
                <ArrowUp size={16} className="mr-2" />
                Withdraw {numAmount > 0 ? `${numAmount} ${token}` : token}
              </>
            )}
          </Button>

          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
