import { useState, useEffect, createContext, useContext, ReactNode } from 'react';

interface Settings {
  yesWager: number;
  noWager: number;
  connected: boolean;
  walletAddress: string | null;
  privyId: string | null;
  accessToken: string | null;
  userId: string | null;
  interests: string[];
  onboardingCompleted: boolean;
  gasDepositComplete: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  yesWager: 5,
  noWager: 5,
  connected: false,
  walletAddress: null,
  privyId: null,
  accessToken: null,
  userId: null,
  interests: [],
  onboardingCompleted: false,
  gasDepositComplete: false,
};

interface SettingsContextType {
  settings: Settings;
  updateWager: (type: 'yes' | 'no', amount: number) => void;
  updateInterests: (interests: string[]) => void;
  connectWallet: (privyId: string, walletAddress: string, accessToken?: string) => Promise<void>;
  disconnectWallet: () => void;
  completeOnboarding: () => void;
  completeGasDeposit: () => void;
  setAuthState: React.Dispatch<React.SetStateAction<{
    connected: boolean;
    walletAddress: string | null;
    privyId: string | null;
    accessToken: string | null;
    userId: string | null;
    interests: string[];
    onboardingCompleted: boolean;
    gasDepositComplete: boolean;
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
    interests: string[];
    onboardingCompleted: boolean;
    gasDepositComplete: boolean;
  }>(() => {
    try {
      const stored = localStorage.getItem('pulse_settings');
      const parsed = stored ? JSON.parse(stored) : {};
      return {
        connected: parsed.connected || false,
        walletAddress: parsed.walletAddress || null,
        privyId: parsed.privyId || null,
        accessToken: parsed.accessToken || null,
        userId: parsed.userId || null,
        interests: Array.isArray(parsed.interests) ? parsed.interests : [],
        onboardingCompleted: parsed.onboardingCompleted || false,
        gasDepositComplete: parsed.gasDepositComplete || false,
      };
    } catch {
      return {
        connected: false,
        walletAddress: null,
        privyId: null,
        accessToken: null,
        userId: null,
        interests: [],
        onboardingCompleted: false,
        gasDepositComplete: false,
      };
    }
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
      const serverInterests = userData.user?.interests || [];
      
      setAuthState(prev => {
        const localInterests = prev.interests;
        const mergedInterests = localInterests.length > 0 ? localInterests : serverInterests;
        
        if (localInterests.length > 0 && serverInterests.length === 0) {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-privy-user-id': privyId,
          };
          if (accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`;
          }
          fetch('/api/users/settings', {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ interests: localInterests }),
          }).catch(err => console.error('Failed to sync interests:', err));
        }
        
        return {
          connected: true,
          walletAddress,
          privyId,
          accessToken: accessToken || null,
          userId: userData.user?.id || userData.id || null,
          interests: mergedInterests,
          onboardingCompleted: prev.onboardingCompleted,
          gasDepositComplete: prev.gasDepositComplete,
        };
      });
    } catch (error) {
      console.error('Failed to sync user:', error);
      setAuthState(prev => ({
        connected: true,
        walletAddress,
        privyId,
        accessToken: accessToken || null,
        userId: null,
        interests: prev.interests,
        onboardingCompleted: prev.onboardingCompleted,
        gasDepositComplete: prev.gasDepositComplete,
      }));
    }
  };

  const updateInterests = async (interests: string[]) => {
    setAuthState(prev => ({ ...prev, interests }));
    if (authState.privyId) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-privy-user-id': authState.privyId,
        };
        if (authState.accessToken) {
          headers['Authorization'] = `Bearer ${authState.accessToken}`;
        }
        const response = await fetch('/api/users/settings', {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ interests }),
        });
        const data = await response.json();
        if (data.user?.interests) {
          setAuthState(prev => ({ ...prev, interests: data.user.interests }));
        }
      } catch (error) {
        console.error('Failed to save interests:', error);
      }
    }
  };

  const disconnectWallet = () => {
    setAuthState(prev => ({
      connected: false,
      walletAddress: null,
      privyId: null,
      accessToken: null,
      userId: null,
      interests: prev.interests,
      onboardingCompleted: prev.onboardingCompleted,
      gasDepositComplete: prev.gasDepositComplete,
    }));
  };

  const completeOnboarding = () => {
    setAuthState(prev => ({ ...prev, onboardingCompleted: true }));
  };

  const completeGasDeposit = () => {
    setAuthState(prev => ({ ...prev, gasDepositComplete: true }));
  };

  const settings: Settings = {
    ...wagers,
    ...authState
  };

  return (
    <SettingsContext.Provider value={{
      settings,
      updateWager,
      updateInterests,
      connectWallet,
      disconnectWallet,
      completeOnboarding,
      completeGasDeposit,
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
