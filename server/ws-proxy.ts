import { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';

const DFLOW_WS_URL = 'wss://b.prediction-markets-api.dflow.net/api/v1/ws';
const DFLOW_API_KEY = process.env.DFLOW_API_KEY || '';

interface PriceUpdate {
  channel: string;
  type: string;
  market_ticker: string;
  yes_bid: string;
  yes_ask: string;
  no_bid: string;
  no_ask: string;
}

let dflowWs: WebSocket | null = null;
let wss: WebSocketServer | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY = 2000;

const priceCache: Map<string, PriceUpdate> = new Map();

function connectToDFlow() {
  if (!DFLOW_API_KEY) {
    console.log('[WS-Proxy] No DFLOW_API_KEY, live prices disabled');
    return;
  }

  if (dflowWs && (dflowWs.readyState === WebSocket.OPEN || dflowWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  console.log('[WS-Proxy] Connecting to DFlow WebSocket...');

  try {
    dflowWs = new WebSocket(DFLOW_WS_URL, {
      headers: { 'x-api-key': DFLOW_API_KEY }
    });

    dflowWs.on('open', () => {
      console.log('[WS-Proxy] Connected to DFlow WebSocket');
      reconnectAttempts = 0;
      
      dflowWs?.send(JSON.stringify({ type: 'subscribe', channel: 'prices', all: true }));
      console.log('[WS-Proxy] Subscribed to all prices');
    });

    dflowWs.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as PriceUpdate;
        
        if (message.channel === 'prices' && message.market_ticker) {
          priceCache.set(message.market_ticker, message);
          
          broadcastToClients({
            type: 'price',
            ticker: message.market_ticker,
            yesBid: parseFloat(message.yes_bid) || null,
            yesAsk: parseFloat(message.yes_ask) || null,
            noBid: parseFloat(message.no_bid) || null,
            noAsk: parseFloat(message.no_ask) || null,
            timestamp: Date.now()
          });
        }
      } catch (err) {
      }
    });

    dflowWs.on('error', (error) => {
      console.error('[WS-Proxy] DFlow WebSocket error:', error.message);
    });

    dflowWs.on('close', (code, reason) => {
      console.log('[WS-Proxy] DFlow WebSocket closed:', code, reason?.toString());
      dflowWs = null;
      scheduleReconnect();
    });
  } catch (error) {
    console.error('[WS-Proxy] Failed to connect to DFlow:', error);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimeout) return;
  
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log('[WS-Proxy] Max reconnect attempts reached');
    return;
  }

  const delay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts) + Math.random() * 1000;
  console.log(`[WS-Proxy] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
  
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    reconnectAttempts++;
    connectToDFlow();
  }, delay);
}

function broadcastToClients(message: object) {
  if (!wss) return;
  
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

export function setupWebSocketProxy(server: HttpServer) {
  wss = new WebSocketServer({ server, path: '/ws/prices' });

  wss.on('connection', (ws) => {
    console.log('[WS-Proxy] Client connected, total clients:', wss?.clients.size);
    
    ws.send(JSON.stringify({ 
      type: 'connected', 
      cachedPrices: priceCache.size,
      dflowConnected: dflowWs?.readyState === WebSocket.OPEN
    }));

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'get_prices' && Array.isArray(message.tickers)) {
          const prices: Record<string, object> = {};
          for (const ticker of message.tickers) {
            const cached = priceCache.get(ticker);
            if (cached) {
              prices[ticker] = {
                yesBid: parseFloat(cached.yes_bid) || null,
                yesAsk: parseFloat(cached.yes_ask) || null,
                noBid: parseFloat(cached.no_bid) || null,
                noAsk: parseFloat(cached.no_ask) || null,
              };
            }
          }
          ws.send(JSON.stringify({ type: 'prices', prices }));
        }
      } catch (err) {
      }
    });

    ws.on('close', () => {
      console.log('[WS-Proxy] Client disconnected, remaining:', wss?.clients.size);
    });
  });

  wss.on('error', (error) => {
    console.error('[WS-Proxy] WebSocket server error:', error);
  });

  console.log('[WS-Proxy] WebSocket server listening on /ws/prices');
  
  connectToDFlow();
}

export function getConnectionStatus(): { dflowConnected: boolean; clientCount: number; cachedPrices: number } {
  return {
    dflowConnected: dflowWs?.readyState === WebSocket.OPEN,
    clientCount: wss?.clients.size || 0,
    cachedPrices: priceCache.size
  };
}

export function getCachedPrice(ticker: string): PriceUpdate | undefined {
  return priceCache.get(ticker);
}
