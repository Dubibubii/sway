import { useState, useEffect } from 'react';

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
  const [settings, setSettings] = useState<Settings>(() => {
    const stored = localStorage.getItem('pulse_settings');
    return stored ? JSON.parse(stored) : DEFAULT_SETTINGS;
  });

  useEffect(() => {
    localStorage.setItem('pulse_settings', JSON.stringify(settings));
  }, [settings]);

  const updateWager = (type: 'yes' | 'no', amount: number) => {
    setSettings(prev => ({ ...prev, [`${type}Wager`]: amount }));
  };

  const connectWallet = () => {
    setSettings(prev => ({
      ...prev,
      connected: true,
      walletAddress: '0x71C...9A21'
    }));
  };

  const disconnectWallet = () => {
    setSettings(prev => ({
      ...prev,
      connected: false,
      walletAddress: null
    }));
  };

  return {
    settings,
    updateWager,
    connectWallet,
    disconnectWallet
  };
}
