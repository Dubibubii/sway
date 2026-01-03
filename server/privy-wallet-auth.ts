import crypto from 'crypto';
import canonicalize from 'canonicalize';
import { PrivyClient } from '@privy-io/server-auth';

const PRIVY_APP_ID = process.env.VITE_PRIVY_APP_ID || '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || '';
const PRIVY_AUTH_ID = process.env.Privy_Auth_ID || '';
const PRIVY_AUTH_KEY = process.env.Privy_Auth || '';

export interface WalletAuthConfig {
  appId: string;
  appSecret: string;
  authorizationKeyId: string;
  authorizationPrivateKey: string;
}

function getConfig(): WalletAuthConfig | null {
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET || !PRIVY_AUTH_ID || !PRIVY_AUTH_KEY) {
    console.warn('[Privy Wallet Auth] Missing configuration:', {
      hasAppId: !!PRIVY_APP_ID,
      hasAppSecret: !!PRIVY_APP_SECRET,
      hasAuthId: !!PRIVY_AUTH_ID,
      hasAuthKey: !!PRIVY_AUTH_KEY,
    });
    return null;
  }
  
  return {
    appId: PRIVY_APP_ID,
    appSecret: PRIVY_APP_SECRET,
    authorizationKeyId: PRIVY_AUTH_ID,
    authorizationPrivateKey: PRIVY_AUTH_KEY,
  };
}

function generateAuthorizationSignature(
  config: WalletAuthConfig,
  payload: {
    url: string;
    method: string;
    body: object;
    idempotencyKey?: string;
  }
): string {
  const signaturePayload = {
    version: 1,
    method: payload.method,
    url: payload.url,
    body: payload.body,
    headers: {
      'privy-app-id': config.appId,
      ...(payload.idempotencyKey ? { 'idempotency-key': payload.idempotencyKey } : {}),
    },
  };

  const serializedPayload = canonicalize(signaturePayload) as string;
  const payloadBuffer = Buffer.from(serializedPayload);

  const privateKeyString = config.authorizationPrivateKey.replace('wallet-auth:', '');
  const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${privateKeyString}\n-----END PRIVATE KEY-----`;

  const privateKey = crypto.createPrivateKey({
    key: privateKeyPem,
    format: 'pem',
  });

  const signature = crypto.sign('sha256', payloadBuffer, {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });

  return signature.toString('base64');
}

function getBasicAuthHeader(config: WalletAuthConfig): string {
  return Buffer.from(`${config.appId}:${config.appSecret}`).toString('base64');
}

export async function requestUserKey(userJwt: string): Promise<string | null> {
  const config = getConfig();
  if (!config) {
    console.error('[Privy Wallet Auth] Configuration not available');
    return null;
  }

  try {
    const url = 'https://api.privy.io/v1/wallets/authenticate';
    const body = { user_jwt: userJwt };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${getBasicAuthHeader(config)}`,
        'Content-Type': 'application/json',
        'privy-app-id': config.appId,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Privy Wallet Auth] Failed to get user key:', response.status, errorText);
      return null;
    }

    const data = await response.json() as { authorization_key?: string };
    return data.authorization_key || null;
  } catch (error) {
    console.error('[Privy Wallet Auth] Error requesting user key:', error);
    return null;
  }
}

export interface SolanaTransactionRequest {
  walletId: string;
  transaction: string;
  userJwt: string;
}

export async function signAndSendSolanaTransaction(
  request: SolanaTransactionRequest
): Promise<{ signature: string } | null> {
  const config = getConfig();
  if (!config) {
    console.error('[Privy Wallet Auth] Configuration not available');
    return null;
  }

  try {
    const userKey = await requestUserKey(request.userJwt);
    if (!userKey) {
      console.error('[Privy Wallet Auth] Failed to get user key');
      return null;
    }

    const url = `https://api.privy.io/v1/wallets/${request.walletId}/rpc`;
    const body = {
      method: 'signAndSendTransaction',
      params: {
        transaction: request.transaction,
      },
    };

    const idempotencyKey = crypto.randomUUID();
    const signature = generateAuthorizationSignature(config, {
      url,
      method: 'POST',
      body,
      idempotencyKey,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${getBasicAuthHeader(config)}`,
        'Content-Type': 'application/json',
        'privy-app-id': config.appId,
        'privy-authorization-signature': signature,
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Privy Wallet Auth] Transaction failed:', response.status, errorText);
      return null;
    }

    const data = await response.json() as { signature?: string; hash?: string };
    return { signature: data.signature || data.hash || '' };
  } catch (error) {
    console.error('[Privy Wallet Auth] Error sending transaction:', error);
    return null;
  }
}

export async function getWalletByAddress(address: string, userJwt: string): Promise<string | null> {
  const config = getConfig();
  if (!config) {
    return null;
  }

  try {
    const response = await fetch(`https://api.privy.io/v1/wallets?address=${address}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${getBasicAuthHeader(config)}`,
        'Content-Type': 'application/json',
        'privy-app-id': config.appId,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { data?: Array<{ id: string; address: string }> };
    const wallet = data.data?.find(w => w.address.toLowerCase() === address.toLowerCase());
    return wallet?.id || null;
  } catch (error) {
    console.error('[Privy Wallet Auth] Error getting wallet:', error);
    return null;
  }
}

export function isConfigured(): boolean {
  return getConfig() !== null;
}

console.log('[Privy Wallet Auth] Module loaded, configured:', isConfigured());
