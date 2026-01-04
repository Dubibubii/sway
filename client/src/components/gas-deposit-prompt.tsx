import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSolanaBalance } from '@/hooks/use-solana-balance';
import { usePrivySafe } from '@/hooks/use-privy-safe';
import mascotSmiley from '@/assets/mascot-smiley.png';
import mascotWink from '@/assets/mascot-wink.png';

interface GasDepositPromptProps {
  onComplete: () => void;
}

const REQUIRED_SOL = 0.02;

export function GasDepositPrompt({ onComplete }: GasDepositPromptProps) {
  const { embeddedWallet, fundWallet } = usePrivySafe();
  const walletAddress = embeddedWallet?.address || '';
  const { solBalance, refetch } = useSolanaBalance(walletAddress);
  const [copied, setCopied] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [displayBalance, setDisplayBalance] = useState<number | null>(null);

  useEffect(() => {
    if (solBalance !== undefined) {
      setDisplayBalance(solBalance);
    }
  }, [solBalance]);

  const hasEnoughSol = solBalance >= REQUIRED_SOL;

  useEffect(() => {
    if (hasEnoughSol && !showSuccess) {
      const timer = setTimeout(() => setShowSuccess(true), 500);
      return () => clearTimeout(timer);
    }
  }, [hasEnoughSol, showSuccess]);

  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 5000);
    return () => clearInterval(interval);
  }, [refetch]);

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
      className="fixed inset-0 z-50 bg-black flex items-center justify-center p-6"
    >
      <AnimatePresence mode="wait">
        {!showSuccess ? (
          <motion.div 
            key="deposit"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-sm flex flex-col items-center"
          >
            <img 
              src={mascotSmiley} 
              alt="SWAY mascot" 
              className="w-24 h-24 mb-4 object-contain"
            />
            
            <h1 className="text-3xl font-bold text-white mb-3">Fuel Your Trades</h1>
            
            <p className="text-zinc-400 text-center text-base leading-relaxed mb-6">
              Deposit SOL to start swiping. A tiny portion (0.02 SOL) is reserved for your gas fees and remains yours to withdraw anytime
            </p>

            <div className="w-full bg-zinc-900 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-500 text-sm">Your Wallet</span>
                <button 
                  onClick={handleCopyAddress}
                  className="text-zinc-500 hover:text-white transition-colors p-1"
                  data-testid="button-copy-address-small"
                >
                  {copied ? <Check size={14} className="text-[#1ED78B]" /> : <Copy size={14} />}
                </button>
              </div>
              <div className="flex items-center justify-between bg-zinc-800 rounded-lg px-4 py-3">
                <span className="text-white font-mono text-base" data-testid="text-wallet-address">
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

            <div className="w-full flex justify-center mb-6">
              <div className="bg-zinc-900 rounded-full px-5 py-2.5 border border-zinc-800">
                <span className="text-zinc-400 text-sm">Current Balance: </span>
                <span className="text-white font-mono font-medium" data-testid="text-sol-balance">
                  {displayBalance !== null ? displayBalance.toFixed(2) : '0.00'}
                </span>
              </div>
            </div>

            <Button 
              onClick={handleFundWallet}
              className="w-full py-6 text-xl font-bold rounded-xl bg-[#1ED78B] hover:bg-[#19B878] text-black uppercase tracking-wide"
              data-testid="button-deposit"
            >
              Deposit
            </Button>

            <p className="text-zinc-500 text-sm text-center mt-4">
              Hint: 0.02 SOL from your total deposit will be used for gas fees
            </p>
          </motion.div>
        ) : (
          <motion.div 
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            className="w-full max-w-sm flex flex-col items-center text-center"
          >
            <h1 className="text-3xl font-bold text-white mb-8">You're all set!</h1>
            
            <div className="relative mb-12">
              <img 
                src={mascotWink} 
                alt="SWAY mascot winking" 
                className="w-44 h-44 object-contain"
              />
              <div className="absolute inset-0 pointer-events-none">
                {[...Array(12)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ 
                      opacity: [0, 1, 0],
                      scale: [0, 1, 0.5],
                      x: Math.cos(i * 30 * Math.PI / 180) * (60 + Math.random() * 40),
                      y: Math.sin(i * 30 * Math.PI / 180) * (60 + Math.random() * 40) - 20,
                    }}
                    transition={{ 
                      duration: 1.5,
                      delay: i * 0.1,
                      repeat: Infinity,
                      repeatDelay: 2
                    }}
                    className="absolute top-1/2 left-1/2 w-3 h-3"
                    style={{
                      backgroundColor: ['#1ED78B', '#F59E0B', '#3B82F6', '#EF4444', '#8B5CF6'][i % 5],
                      transform: `rotate(${i * 30}deg)`,
                    }}
                  />
                ))}
              </div>
            </div>

            <Button 
              onClick={onComplete}
              className="w-full py-6 text-lg font-bold rounded-xl bg-[#1ED78B] hover:bg-[#19B878] text-black"
              data-testid="button-start-swiping"
            >
              Start Swiping!
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
