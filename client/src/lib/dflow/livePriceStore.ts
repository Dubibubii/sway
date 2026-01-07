import { useState, useEffect, useRef, useCallback } from 'react';

export type PriceMessage = {
  ticker: string;
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;
  yesPrice: number;
  noPrice: number;
  timestamp: number;
};

type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error' | 'reconnecting';

const priceStore: Map<string, PriceMessage> = new Map();
const listeners: Set<() => void> = new Set();
let ws: WebSocket | null = null;
let connectionStatus: ConnectionStatus = 'closed';
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 2000;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let statusListeners: Set<(status: ConnectionStatus) => void> = new Set();

function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/prices`;
}

function notifyListeners() {
  listeners.forEach(listener => listener());
}

function updateStatus(status: ConnectionStatus) {
  connectionStatus = status;
  statusListeners.forEach(listener => listener(status));
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  updateStatus('connecting');

  try {
    ws = new WebSocket(getWsUrl());

    ws.onopen = () => {
      console.log('[LivePrices] Connected to price stream');
      updateStatus('open');
      reconnectAttempts = 0;
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'price' && message.ticker) {
          const priceMsg: PriceMessage = {
            ticker: message.ticker,
            yesBid: message.yesBid,
            yesAsk: message.yesAsk,
            noBid: message.noBid,
            noAsk: message.noAsk,
            yesPrice: message.yesAsk ?? message.yesBid ?? 0,
            noPrice: message.noAsk ?? message.noBid ?? 0,
            timestamp: message.timestamp || Date.now(),
          };
          priceStore.set(message.ticker, priceMsg);
          notifyListeners();
        } else if (message.type === 'prices' && message.prices) {
          for (const [ticker, price] of Object.entries(message.prices as Record<string, any>)) {
            const priceMsg: PriceMessage = {
              ticker,
              yesBid: price.yesBid,
              yesAsk: price.yesAsk,
              noBid: price.noBid,
              noAsk: price.noAsk,
              yesPrice: price.yesAsk ?? price.yesBid ?? 0,
              noPrice: price.noAsk ?? price.noBid ?? 0,
              timestamp: Date.now(),
            };
            priceStore.set(ticker, priceMsg);
          }
          notifyListeners();
        } else if (message.type === 'connected') {
          console.log('[LivePrices] Server connected, cached prices:', message.cachedPrices, 'DFlow connected:', message.dflowConnected);
        }
      } catch (err) {
      }
    };

    ws.onerror = () => {
      updateStatus('error');
    };

    ws.onclose = () => {
      updateStatus('closed');
      ws = null;
      scheduleReconnect();
    };
  } catch (error) {
    console.error('[LivePrices] Connection error:', error);
    updateStatus('error');
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimeout) return;
  
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log('[LivePrices] Max reconnect attempts reached');
    return;
  }

  updateStatus('reconnecting');
  
  const delay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts) + Math.random() * 1000;
  
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    reconnectAttempts++;
    connect();
  }, delay);
}

function disconnect() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  updateStatus('closed');
}

function requestPrices(tickers: string[]) {
  if (ws && ws.readyState === WebSocket.OPEN && tickers.length > 0) {
    ws.send(JSON.stringify({ type: 'get_prices', tickers }));
  }
}

export function useLivePrice(ticker: string | undefined): PriceMessage | null {
  const [price, setPrice] = useState<PriceMessage | null>(() => 
    ticker ? priceStore.get(ticker) || null : null
  );

  useEffect(() => {
    if (!ticker) return;

    const update = () => {
      const cached = priceStore.get(ticker);
      setPrice(cached || null);
    };

    listeners.add(update);
    
    if (connectionStatus !== 'open' && connectionStatus !== 'connecting') {
      connect();
    }

    return () => {
      listeners.delete(update);
    };
  }, [ticker]);

  return price;
}

export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(connectionStatus);

  useEffect(() => {
    setStatus(connectionStatus);
    statusListeners.add(setStatus);
    return () => {
      statusListeners.delete(setStatus);
    };
  }, []);

  return status;
}

export function useLivePrices(tickers: string[]): Record<string, PriceMessage> {
  const [prices, setPrices] = useState<Record<string, PriceMessage>>(() => {
    const initial: Record<string, PriceMessage> = {};
    for (const ticker of tickers) {
      const cached = priceStore.get(ticker);
      if (cached) initial[ticker] = cached;
    }
    return initial;
  });
  
  const tickerSetRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    tickerSetRef.current = new Set(tickers);

    const update = () => {
      const updated: Record<string, PriceMessage> = {};
      Array.from(tickerSetRef.current).forEach(ticker => {
        const cached = priceStore.get(ticker);
        if (cached) updated[ticker] = cached;
      });
      setPrices(updated);
    };

    listeners.add(update);
    
    if (connectionStatus !== 'open' && connectionStatus !== 'connecting') {
      connect();
    }
    
    if (tickers.length > 0) {
      requestPrices(tickers);
    }

    return () => {
      listeners.delete(update);
    };
  }, [tickers.join(',')]);

  return prices;
}

export function useWebSocketSubscription(tickers: string[], enabled = true) {
  useEffect(() => {
    if (!enabled || tickers.length === 0) return;

    if (connectionStatus !== 'open' && connectionStatus !== 'connecting') {
      connect();
    }
    
    requestPrices(tickers);
  }, [tickers.join(','), enabled]);
}

export function connectWebSocket() {
  connect();
}

export function disconnectWebSocket() {
  disconnect();
}

export function getSpreadPercent(yesBid: number | null, yesAsk: number | null): number | null {
  if (yesBid === null || yesAsk === null || yesAsk === 0) return null;
  return ((yesAsk - yesBid) / yesAsk) * 100;
}
