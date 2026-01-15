import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SettingsProvider, useSettings } from "@/hooks/use-settings";
import { usePrivySafe } from "@/hooks/use-privy-safe";
import { GeoRestrictionCheck } from "@/components/geo-restriction-check";
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
  const { settings, completeGeoCheck, completeOnboarding, completeGasDeposit } = useSettings();
  const [showGeoCheck, setShowGeoCheck] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showGasDeposit, setShowGasDeposit] = useState(false);

  // Show geo check first for new users (before onboarding)
  useEffect(() => {
    if (authenticated && !settings.geoCheckCompleted) {
      setShowGeoCheck(true);
    } else {
      setShowGeoCheck(false);
    }
  }, [authenticated, settings.geoCheckCompleted]);

  useEffect(() => {
    if (authenticated && settings.geoCheckCompleted && !settings.onboardingCompleted) {
      const timer = setTimeout(() => {
        setShowOnboarding(true);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setShowOnboarding(false);
    }
  }, [authenticated, settings.geoCheckCompleted, settings.onboardingCompleted]);

  useEffect(() => {
    if (authenticated && settings.geoCheckCompleted && settings.onboardingCompleted && !settings.gasDepositComplete) {
      setShowGasDeposit(true);
    } else {
      setShowGasDeposit(false);
    }
  }, [authenticated, settings.geoCheckCompleted, settings.onboardingCompleted, settings.gasDepositComplete]);

  const handleGeoCheckComplete = () => {
    setShowGeoCheck(false);
    completeGeoCheck();
  };

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
      {showGeoCheck && <GeoRestrictionCheck onConfirm={handleGeoCheckComplete} />}
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
