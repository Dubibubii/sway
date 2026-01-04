import { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, Copy, Check, RefreshCw, ArrowRight, Fuel } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSolanaBalance } from '@/hooks/use-solana-balance';
import { usePrivySafe } from '@/hooks/use-privy-safe';

interface GasDepositPromptProps {
  onComplete: () => void;
}

const REQUIRED_SOL = 0.01;

export function GasDepositPrompt({ onComplete }: GasDepositPromptProps) {
  const { embeddedWallet, fundWallet } = usePrivySafe();
  const walletAddress = embeddedWallet?.address || '';
  const { solBalance, isLoading, refetch } = useSolanaBalance(walletAddress);
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const hasEnoughSol = solBalance >= REQUIRED_SOL;
  const progress = Math.min((solBalance / REQUIRED_SOL) * 100, 100);

  const handleCopyAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleFundWallet = () => {
    if (walletAddress) {
      fundWallet(walletAddress);
    }
  };

  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-sm bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden"
      >
        <div className="p-8 flex flex-col items-center text-center">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-6 shadow-lg">
            <Fuel size={48} className="text-white" />
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-3">Fund Your Wallet</h2>
          <p className="text-zinc-400 text-base leading-relaxed mb-6">
            To place trades, you'll need a small amount of SOL for transaction fees. 
            This is <span className="text-white font-medium">fully withdrawable</span> at any time.
          </p>

          <div className="w-full bg-zinc-800/50 rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-400 text-sm">Your Wallet</span>
              <div className="flex items-center gap-2">
                <Wallet size={14} className="text-zinc-500" />
              </div>
            </div>
            <div className="flex items-center justify-between bg-zinc-800 rounded-xl p-3">
              <span className="text-white font-mono text-sm" data-testid="text-wallet-address">
                {formatAddress(walletAddress)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyAddress}
                className="h-8 w-8 p-0 text-zinc-400 hover:text-white hover:bg-zinc-700"
                data-testid="button-copy-address"
              >
                {copied ? <Check size={16} className="text-[#1ED78B]" /> : <Copy size={16} />}
              </Button>
            </div>
          </div>

          <div className="w-full bg-zinc-800/50 rounded-2xl p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-400 text-sm">SOL Balance</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing || isLoading}
                className="h-6 px-2 text-xs text-zinc-400 hover:text-white"
                data-testid="button-check-balance"
              >
                <RefreshCw size={12} className={`mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
            
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-bold text-white" data-testid="text-sol-balance">
                {isLoading ? '...' : solBalance.toFixed(4)}
              </span>
              <span className="text-zinc-500">SOL</span>
            </div>

            <div className="w-full bg-zinc-700 rounded-full h-2 mb-2">
              <motion.div 
                className={`h-2 rounded-full ${hasEnoughSol ? 'bg-[#1ED78B]' : 'bg-amber-500'}`}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
            
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Required: {REQUIRED_SOL} SOL</span>
              <span className={hasEnoughSol ? 'text-[#1ED78B]' : 'text-amber-500'}>
                {hasEnoughSol ? 'Ready!' : `${(REQUIRED_SOL - solBalance).toFixed(4)} SOL needed`}
              </span>
            </div>
          </div>

          <p className="text-zinc-500 text-xs mb-4">
            Send SOL to your wallet address above, or use the button below to fund with a card.
          </p>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-3">
          {!hasEnoughSol && (
            <Button 
              onClick={handleFundWallet}
              variant="outline"
              className="w-full border-zinc-700 text-white hover:bg-zinc-800 py-6 text-lg"
              data-testid="button-fund-wallet"
            >
              <Wallet className="mr-2" size={20} />
              Fund with Card
            </Button>
          )}
          
          <Button 
            onClick={onComplete}
            disabled={!hasEnoughSol}
            className={`w-full py-6 text-lg font-semibold transition-all ${
              hasEnoughSol 
                ? 'bg-gradient-to-r from-[#1ED78B] to-emerald-500 hover:from-[#19B878] hover:to-emerald-600 text-white' 
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
            data-testid="button-continue-gas-deposit"
          >
            {hasEnoughSol ? (
              <>
                Continue
                <ArrowRight className="ml-2" size={20} />
              </>
            ) : (
              'Deposit SOL to Continue'
            )}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
