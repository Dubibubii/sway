import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';

interface Settings {
  yesWager: number;
  noWager: number;
  connected: boolean;
  walletAddress: string | null;
}

const DEFAULT_SETTINGS: Settings = {
  yesWager: 5,
  noWager: 5,
  connected: false,
  walletAddress: null,
};

export function useSettings() {
  const { login, logout, user, authenticated, ready } = usePrivy();

  const [wagers, setWagers] = useState<{yesWager: number, noWager: number}>(() => {
    const stored = localStorage.getItem('pulse_settings');
    const parsed = stored ? JSON.parse(stored) : DEFAULT_SETTINGS;
    return {
      yesWager: parsed.yesWager || DEFAULT_SETTINGS.yesWager,
      noWager: parsed.noWager || DEFAULT_SETTINGS.noWager
    };
  });

  useEffect(() => {
    const settingsToStore = {
      ...wagers,
      connected: authenticated,
      walletAddress: user?.wallet?.address || null
    };
    localStorage.setItem('pulse_settings', JSON.stringify(settingsToStore));
  }, [wagers, authenticated, user]);

  const updateWager = (type: 'yes' | 'no', amount: number) => {
    setWagers(prev => ({ ...prev, [`${type}Wager`]: amount }));
  };

  const connectWallet = () => {
    login();
  };

  const disconnectWallet = () => {
    logout();
  };

  const settings: Settings = {
    ...wagers,
    connected: authenticated,
    walletAddress: user?.wallet?.address || null
  };

  return {
    settings,
    updateWager,
    connectWallet,
    disconnectWallet
  };
}
