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
  completeOnboarding: () => Promise<void>;
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
      const serverOnboardingCompleted = userData.user?.onboardingCompleted || false;
      
      setAuthState(prev => {
        // Check if this is a different user
        const isDifferentUser = prev.privyId !== null && prev.privyId !== privyId;
        
        const localInterests = prev.interests;
        const mergedInterests = localInterests.length > 0 && !isDifferentUser ? localInterests : serverInterests;
        
        if (localInterests.length > 0 && serverInterests.length === 0 && !isDifferentUser) {
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
          // Use server's onboarding status - persisted per wallet in database
          onboardingCompleted: serverOnboardingCompleted,
          // Gas deposit is checked live from balance, not stored in DB
          gasDepositComplete: isDifferentUser ? false : prev.gasDepositComplete,
        };
      });
    } catch (error) {
      console.error('Failed to sync user:', error);
      setAuthState(prev => {
        // Check if this is a different user
        const isDifferentUser = prev.privyId !== null && prev.privyId !== privyId;
        
        return {
          connected: true,
          walletAddress,
          privyId,
          accessToken: accessToken || null,
          userId: null,
          interests: isDifferentUser ? [] : prev.interests,
          // Keep local onboarding state if server fails
          onboardingCompleted: isDifferentUser ? false : prev.onboardingCompleted,
          gasDepositComplete: isDifferentUser ? false : prev.gasDepositComplete,
        };
      });
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
    // Reset local session state but NOT onboarding - that's persisted server-side
    // When user reconnects, their onboarding status will be fetched from the database
    setAuthState({
      connected: false,
      walletAddress: null,
      privyId: null,
      accessToken: null,
      userId: null,
      interests: [],
      onboardingCompleted: false, // Will be restored from server on reconnect
      gasDepositComplete: false,
    });
  };

  const completeOnboarding = async () => {
    // Update local state immediately for responsive UI
    setAuthState(prev => ({ ...prev, onboardingCompleted: true }));
    
    // Persist to server so it's remembered across sessions
    if (authState.privyId) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-privy-user-id': authState.privyId,
        };
        if (authState.accessToken) {
          headers['Authorization'] = `Bearer ${authState.accessToken}`;
        }
        await fetch('/api/users/onboarding/complete', {
          method: 'POST',
          headers,
        });
      } catch (error) {
        console.error('Failed to persist onboarding completion:', error);
      }
    }
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
