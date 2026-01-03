import { useEffect, useState } from 'react';
import { PRIVY_ENABLED } from '@/hooks/use-privy-safe';

export function DevPanel() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Only show in dev mode
    if (import.meta.env.DEV) {
      setShow(true);
    }
  }, []);

  if (!show || import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-gray-900 text-white text-xs p-3 rounded-lg shadow-lg border border-gray-700 max-w-sm z-50">
      <div className="font-bold mb-2">🔧 Dev Mode</div>
      <div className="space-y-1">
        <div>
          <span className="text-gray-400">Privy:</span>{' '}
          <span className={PRIVY_ENABLED ? 'text-green-400' : 'text-yellow-400'}>
            {PRIVY_ENABLED ? 'Enabled' : 'Demo Mode'}
          </span>
        </div>
        {!PRIVY_ENABLED && (
          <div className="text-yellow-400 text-xs mt-2">
            ⚠️ Add VITE_PRIVY_APP_ID to .env for full wallet features
          </div>
        )}
        <div>
          <span className="text-gray-400">Helius API:</span>{' '}
          <span className={import.meta.env.VITE_HELIUS_API_KEY ? 'text-green-400' : 'text-red-400'}>
            {import.meta.env.VITE_HELIUS_API_KEY ? 'Set' : 'Missing'}
          </span>
        </div>
      </div>
    </div>
  );
}
