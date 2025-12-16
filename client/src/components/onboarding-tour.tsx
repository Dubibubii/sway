import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, ChevronsDown, ArrowRight, Sparkles, TrendingUp, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OnboardingTourProps {
  onComplete: () => void;
}

const steps = [
  {
    id: 'welcome',
    title: 'Welcome to Pulse!',
    description: 'Trade on real prediction markets by swiping. Let\'s show you how it works.',
    icon: Sparkles,
    iconColor: 'from-purple-500 to-pink-500',
  },
  {
    id: 'swipe-yes',
    title: 'Swipe Right = YES',
    description: 'Think something will happen? Swipe right or tap the green checkmark to bet YES.',
    icon: Check,
    iconColor: 'from-emerald-500 to-green-500',
    demo: 'right',
  },
  {
    id: 'swipe-no',
    title: 'Swipe Left = NO',
    description: 'Think it won\'t happen? Swipe left or tap the red X to bet NO.',
    icon: X,
    iconColor: 'from-rose-500 to-red-500',
    demo: 'left',
  },
  {
    id: 'swipe-skip',
    title: 'Swipe Down = Skip',
    description: 'Not sure? Swipe down or tap the blue arrows to skip and see the next market.',
    icon: ChevronsDown,
    iconColor: 'from-blue-500 to-cyan-500',
    demo: 'down',
  },
  {
    id: 'positions',
    title: 'Track Your Positions',
    description: 'View your active bets and past trades in the Portfolio tab at the bottom.',
    icon: TrendingUp,
    iconColor: 'from-amber-500 to-orange-500',
  },
  {
    id: 'settings',
    title: 'Customize Your Experience',
    description: 'Set your wager amounts and filter markets by your interests in Settings.',
    icon: Settings,
    iconColor: 'from-indigo-500 to-violet-500',
  },
];

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = steps[currentStep];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div 
        key={step.id}
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: -20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-sm bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden"
      >
        <div className="p-8 flex flex-col items-center text-center">
          <div className={`w-24 h-24 rounded-full bg-gradient-to-br ${step.iconColor} flex items-center justify-center mb-6 shadow-lg`}>
            <step.icon size={48} className="text-white" />
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-3">{step.title}</h2>
          <p className="text-zinc-400 text-base leading-relaxed">{step.description}</p>
          
          {step.demo && (
            <div className="mt-6 flex items-center gap-3">
              <motion.div
                animate={
                  step.demo === 'right' ? { x: [0, 30, 0] } :
                  step.demo === 'left' ? { x: [0, -30, 0] } :
                  { y: [0, 20, 0] }
                }
                transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                className={`w-16 h-20 rounded-xl border-2 ${
                  step.demo === 'right' ? 'border-emerald-500 bg-emerald-500/20' :
                  step.demo === 'left' ? 'border-rose-500 bg-rose-500/20' :
                  'border-blue-500 bg-blue-500/20'
                }`}
              />
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex flex-col gap-3">
          <div className="flex justify-center gap-2 mb-2">
            {steps.map((_, index) => (
              <div 
                key={index}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === currentStep ? 'w-6 bg-white' : 'w-1.5 bg-zinc-700'
                }`}
              />
            ))}
          </div>
          
          <Button 
            onClick={handleNext}
            className="w-full bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 text-white font-semibold py-6 text-lg"
            data-testid="button-onboarding-next"
          >
            {currentStep < steps.length - 1 ? (
              <>
                Next
                <ArrowRight className="ml-2" size={20} />
              </>
            ) : (
              <>
                Start Trading
                <Sparkles className="ml-2" size={20} />
              </>
            )}
          </Button>
          
          {currentStep < steps.length - 1 && (
            <Button 
              variant="ghost" 
              onClick={handleSkip}
              className="text-zinc-500 hover:text-zinc-300"
              data-testid="button-onboarding-skip"
            >
              Skip Tutorial
            </Button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
