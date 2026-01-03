let cachedRpcConfig: { rpcUrl: string; wssUrl: string; provider: string } | null = null;
let fetchPromise: Promise<typeof cachedRpcConfig> | null = null;

export async function getRpcConfig(): Promise<{ rpcUrl: string; wssUrl: string; provider: string }> {
  const buildTimeKey = import.meta.env.VITE_HELIUS_API_KEY;
  
  if (buildTimeKey) {
    return {
      rpcUrl: `https://mainnet.helius-rpc.com/?api-key=${buildTimeKey}`,
      wssUrl: `wss://mainnet.helius-rpc.com/?api-key=${buildTimeKey}`,
      provider: 'helius-buildtime'
    };
  }
  
  if (cachedRpcConfig) {
    return cachedRpcConfig;
  }
  
  if (fetchPromise) {
    const result = await fetchPromise;
    return result || getDefaultConfig();
  }
  
  fetchPromise = fetch('/api/config/rpc')
    .then(res => res.json())
    .then(config => {
      cachedRpcConfig = config;
      console.log('[RPC] Loaded config from server:', config.provider);
      return config;
    })
    .catch(err => {
      console.error('[RPC] Failed to fetch config:', err);
      cachedRpcConfig = getDefaultConfig();
      return cachedRpcConfig;
    });
  
  const result = await fetchPromise;
  return result || getDefaultConfig();
}

function getDefaultConfig() {
  return {
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    wssUrl: 'wss://api.mainnet-beta.solana.com',
    provider: 'public-fallback'
  };
}

export function getRpcUrl(): string {
  const buildTimeKey = import.meta.env.VITE_HELIUS_API_KEY;
  if (buildTimeKey) {
    return `https://mainnet.helius-rpc.com/?api-key=${buildTimeKey}`;
  }
  return cachedRpcConfig?.rpcUrl || 'https://api.mainnet-beta.solana.com';
}

export function getWssUrl(): string {
  const buildTimeKey = import.meta.env.VITE_HELIUS_API_KEY;
  if (buildTimeKey) {
    return `wss://mainnet.helius-rpc.com/?api-key=${buildTimeKey}`;
  }
  return cachedRpcConfig?.wssUrl || 'wss://api.mainnet-beta.solana.com';
}

export async function initRpcConfig(): Promise<void> {
  await getRpcConfig();
}
