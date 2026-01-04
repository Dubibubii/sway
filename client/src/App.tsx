import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SettingsProvider, useSettings } from "@/hooks/use-settings";
import { usePrivySafe } from "@/hooks/use-privy-safe";
import { OnboardingTour } from "@/components/onboarding-tour";
import { GasDepositPrompt } from "@/components/gas-deposit-prompt";
import { useState, useEffect } from "react";
import Home from "@/pages/home";
import Profile from "@/pages/profile";
import Activity from "@/pages/activity";
import Discovery from "@/pages/discovery";
import Developer from "@/pages/developer";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/discovery" component={Discovery} />
      <Route path="/profile" component={Profile} />
      <Route path="/activity" component={Activity} />
      <Route path="/developer" component={Developer} />
      <Route component={NotFound} />
    </Switch>
  );
}

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { authenticated } = usePrivySafe();
  const { settings, completeOnboarding, completeGasDeposit } = useSettings();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showGasDeposit, setShowGasDeposit] = useState(false);

  useEffect(() => {
    if (authenticated && !settings.onboardingCompleted) {
      const timer = setTimeout(() => {
        setShowOnboarding(true);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setShowOnboarding(false);
    }
  }, [authenticated, settings.onboardingCompleted]);

  useEffect(() => {
    if (authenticated && settings.onboardingCompleted && !settings.gasDepositComplete) {
      setShowGasDeposit(true);
    } else {
      setShowGasDeposit(false);
    }
  }, [authenticated, settings.onboardingCompleted, settings.gasDepositComplete]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    completeOnboarding();
    if (!settings.gasDepositComplete) {
      setShowGasDeposit(true);
    }
  };

  const handleGasDepositComplete = () => {
    setShowGasDeposit(false);
    completeGasDeposit();
  };

  return (
    <>
      {children}
      {showOnboarding && <OnboardingTour onComplete={handleOnboardingComplete} />}
      {showGasDeposit && <GasDepositPrompt onComplete={handleGasDepositComplete} />}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <TooltipProvider>
          <Toaster />
          <OnboardingGate>
            <Router />
          </OnboardingGate>
        </TooltipProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
}

export default App;
