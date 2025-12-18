import * as crypto from 'crypto';

const KALSHI_API_URL = 'https://api.elections.kalshi.com/trade-api/v2';
const KALSHI_DEMO_URL = 'https://demo-api.kalshi.co/trade-api/v2';

interface KalshiCredentials {
  apiKeyId: string;
  privateKey: string;
  useDemo?: boolean;
}

interface KalshiOrder {
  ticker: string;
  action: 'buy' | 'sell';
  side: 'yes' | 'no';
  count: number;
  type: 'limit' | 'market';
  yesPrice?: number;
  noPrice?: number;
  clientOrderId?: string;
}

interface KalshiOrderResponse {
  order: {
    order_id: string;
    client_order_id: string;
    ticker: string;
    action: string;
    side: string;
    count: number;
    yes_price?: number;
    no_price?: number;
    status: string;
    created_time: string;
    remaining_count: number;
    queue_position?: number;
  };
}

interface KalshiBalance {
  balance: number;
  available_balance: number;
}

function createSignature(privateKeyPem: string, timestamp: string, method: string, path: string): string {
  const message = timestamp + method.toUpperCase() + path;
  
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(message);
  sign.end();
  
  const signature = sign.sign(privateKeyPem, 'base64');
  return signature;
}

function getHeaders(credentials: KalshiCredentials, method: string, path: string): Record<string, string> {
  const timestamp = Date.now().toString();
  const signature = createSignature(credentials.privateKey, timestamp, method, path);
  
  return {
    'KALSHI-ACCESS-KEY': credentials.apiKeyId,
    'KALSHI-ACCESS-SIGNATURE': signature,
    'KALSHI-ACCESS-TIMESTAMP': timestamp,
    'Content-Type': 'application/json',
  };
}

function getBaseUrl(useDemo?: boolean): string {
  return useDemo ? KALSHI_DEMO_URL : KALSHI_API_URL;
}

export async function getKalshiBalance(credentials: KalshiCredentials): Promise<KalshiBalance> {
  const path = '/portfolio/balance';
  const baseUrl = getBaseUrl(credentials.useDemo);
  const headers = getHeaders(credentials, 'GET', path);
  
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Kalshi API error: ${response.status} - ${error}`);
  }
  
  return response.json();
}

export async function placeKalshiOrder(
  credentials: KalshiCredentials,
  order: KalshiOrder
): Promise<KalshiOrderResponse> {
  const path = '/portfolio/orders';
  const baseUrl = getBaseUrl(credentials.useDemo);
  const headers = getHeaders(credentials, 'POST', path);
  
  const orderData = {
    ticker: order.ticker,
    action: order.action,
    side: order.side,
    count: order.count,
    type: order.type,
    ...(order.yesPrice && { yes_price: order.yesPrice }),
    ...(order.noPrice && { no_price: order.noPrice }),
    client_order_id: order.clientOrderId || crypto.randomUUID(),
  };
  
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(orderData),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Kalshi order failed: ${response.status} - ${error}`);
  }
  
  return response.json();
}

export async function cancelKalshiOrder(
  credentials: KalshiCredentials,
  orderId: string
): Promise<void> {
  const path = `/portfolio/orders/${orderId}`;
  const baseUrl = getBaseUrl(credentials.useDemo);
  const headers = getHeaders(credentials, 'DELETE', path);
  
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'DELETE',
    headers,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cancel order failed: ${response.status} - ${error}`);
  }
}

export async function getKalshiPositions(credentials: KalshiCredentials): Promise<any> {
  const path = '/portfolio/positions';
  const baseUrl = getBaseUrl(credentials.useDemo);
  const headers = getHeaders(credentials, 'GET', path);
  
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Get positions failed: ${response.status} - ${error}`);
  }
  
  return response.json();
}

export async function getKalshiOrders(credentials: KalshiCredentials): Promise<any> {
  const path = '/portfolio/orders';
  const baseUrl = getBaseUrl(credentials.useDemo);
  const headers = getHeaders(credentials, 'GET', path);
  
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Get orders failed: ${response.status} - ${error}`);
  }
  
  return response.json();
}

export async function verifyKalshiCredentials(credentials: KalshiCredentials): Promise<boolean> {
  try {
    await getKalshiBalance(credentials);
    return true;
  } catch (error) {
    console.error('Kalshi credential verification failed:', error);
    return false;
  }
}
