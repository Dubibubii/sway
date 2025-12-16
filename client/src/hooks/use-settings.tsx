import { useState, useEffect, createContext, useContext, ReactNode } from 'react';

interface Settings {
  yesWager: number;
  noWager: number;
  connected: boolean;
  walletAddress: string | null;
  privyId: string | null;
  accessToken: string | null;
  userId: string | null;
}

const DEFAULT_SETTINGS: Settings = {
  yesWager: 5,
  noWager: 5,
  connected: false,
  walletAddress: null,
  privyId: null,
  accessToken: null,
  userId: null,
};

interface SettingsContextType {
  settings: Settings;
  updateWager: (type: 'yes' | 'no', amount: number) => void;
  connectWallet: (privyId: string, walletAddress: string, accessToken?: string) => Promise<void>;
  disconnectWallet: () => void;
  setAuthState: React.Dispatch<React.SetStateAction<{
    connected: boolean;
    walletAddress: string | null;
    privyId: string | null;
    accessToken: string | null;
    userId: string | null;
  }>>;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [wagers, setWagers] = useState<{yesWager: number, noWager: number}>(() => {
    try {
      const stored = localStorage.getItem('pulse_settings');
      const parsed = stored ? JSON.parse(stored) : DEFAULT_SETTINGS;
      return {
        yesWager: parsed.yesWager || DEFAULT_SETTINGS.yesWager,
        noWager: parsed.noWager || DEFAULT_SETTINGS.noWager
      };
    } catch {
      return { yesWager: DEFAULT_SETTINGS.yesWager, noWager: DEFAULT_SETTINGS.noWager };
    }
  });

  const [authState, setAuthState] = useState<{
    connected: boolean;
    walletAddress: string | null;
    privyId: string | null;
    accessToken: string | null;
    userId: string | null;
  }>({
    connected: false,
    walletAddress: null,
    privyId: null,
    accessToken: null,
    userId: null,
  });

  useEffect(() => {
    try {
      const settingsToStore = {
        ...wagers,
        ...authState
      };
      localStorage.setItem('pulse_settings', JSON.stringify(settingsToStore));
    } catch {}
  }, [wagers, authState]);

  const updateWager = (type: 'yes' | 'no', amount: number) => {
    setWagers(prev => ({ ...prev, [`${type}Wager`]: amount }));
  };

  const connectWallet = async (privyId: string, walletAddress: string, accessToken?: string) => {
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
          'x-privy-user-id': privyId,
        },
        body: JSON.stringify({ privyId, walletAddress }),
      });
      const userData = await response.json();
      setAuthState({
        connected: true,
        walletAddress,
        privyId,
        accessToken: accessToken || null,
        userId: userData.user?.id || userData.id || null,
      });
    } catch (error) {
      console.error('Failed to sync user:', error);
      setAuthState({
        connected: true,
        walletAddress,
        privyId,
        accessToken: accessToken || null,
        userId: null,
      });
    }
  };

  const disconnectWallet = () => {
    setAuthState({
      connected: false,
      walletAddress: null,
      privyId: null,
      accessToken: null,
      userId: null,
    });
  };

  const settings: Settings = {
    ...wagers,
    ...authState
  };

  return (
    <SettingsContext.Provider value={{
      settings,
      updateWager,
      connectWallet,
      disconnectWallet,
      setAuthState
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
