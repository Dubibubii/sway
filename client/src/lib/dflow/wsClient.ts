type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error' | 'reconnecting';

export interface PriceMessage {
  ticker: string;
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;
  yesPrice: number;
  noPrice: number;
  timestamp: number;
}

interface WebSocketMessage {
  channel: 'prices' | 'trades' | 'orderbook';
  ticker?: string;
  data?: any;
  error?: string;
}

type PriceUpdateCallback = (ticker: string, price: PriceMessage) => void;
type StatusUpdateCallback = (status: ConnectionStatus) => void;

const DFLOW_WS_URL = 'wss://prediction-markets-api.dflow.net/api/v1/ws';
const MAX_RECONNECT_DELAY = 30000;
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_ATTEMPTS = 5;

class DFlowWebSocketClient {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'closed';
  private subscribedTickers: Set<string> = new Set();
  private pendingSubscriptions: Set<string> = new Set();
  private pendingUnsubscriptions: Set<string> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isAllMode = false;
  private priceCallbacks: Set<PriceUpdateCallback> = new Set();
  private statusCallbacks: Set<StatusUpdateCallback> = new Set();
  private lastErrorLog = 0;
  private flushTimeout: ReturnType<typeof setTimeout> | null = null;

  connect(): void {
    if (this.ws && (this.status === 'open' || this.status === 'connecting')) {
      return;
    }

    this.updateStatus('connecting');

    try {
      this.ws = new WebSocket(DFLOW_WS_URL);
      
      this.ws.onopen = () => {
        console.log('[DFlow WS] Connected');
        this.updateStatus('open');
        this.reconnectAttempts = 0;
        
        if (this.subscribedTickers.size > 0) {
          this.sendSubscribe(Array.from(this.subscribedTickers));
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('[DFlow WS] Error:', error);
        this.updateStatus('error');
      };

      this.ws.onclose = () => {
        console.log('[DFlow WS] Closed');
        this.updateStatus('closed');
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error('[DFlow WS] Failed to connect:', error);
      this.updateStatus('error');
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscribedTickers.clear();
    this.pendingSubscriptions.clear();
    this.pendingUnsubscriptions.clear();
    this.updateStatus('closed');
  }

  subscribePrices(tickers: string[]): void {
    if (tickers.length === 0) return;

    for (const ticker of tickers) {
      if (!this.subscribedTickers.has(ticker)) {
        this.pendingSubscriptions.add(ticker);
        this.pendingUnsubscriptions.delete(ticker);
      }
    }
    
    this.scheduleFlush();
  }

  unsubscribePrices(tickers: string[]): void {
    if (tickers.length === 0) return;

    for (const ticker of tickers) {
      if (this.subscribedTickers.has(ticker)) {
        this.pendingUnsubscriptions.add(ticker);
        this.pendingSubscriptions.delete(ticker);
      }
    }
    
    this.scheduleFlush();
  }

  updateSubscriptions(desiredTickers: string[]): void {
    const desiredSet = new Set(desiredTickers);
    
    const toSubscribe = desiredTickers.filter(t => !this.subscribedTickers.has(t));
    const toUnsubscribe = Array.from(this.subscribedTickers).filter(t => !desiredSet.has(t));
    
    if (toSubscribe.length > 0) {
      this.subscribePrices(toSubscribe);
    }
    if (toUnsubscribe.length > 0) {
      this.unsubscribePrices(toUnsubscribe);
    }
  }

  setPricesAllMode(enabled: boolean): void {
    if (this.isAllMode === enabled) return;
    this.isAllMode = enabled;

    if (this.status === 'open' && this.ws) {
      if (enabled) {
        this.send({ type: 'subscribe', channel: 'prices', all: true });
      } else {
        this.send({ type: 'unsubscribe', channel: 'prices', all: true });
        if (this.subscribedTickers.size > 0) {
          this.sendSubscribe(Array.from(this.subscribedTickers));
        }
      }
    }
  }

  onPriceUpdate(callback: PriceUpdateCallback): () => void {
    this.priceCallbacks.add(callback);
    return () => this.priceCallbacks.delete(callback);
  }

  onStatusChange(callback: StatusUpdateCallback): () => void {
    this.statusCallbacks.add(callback);
    callback(this.status);
    return () => this.statusCallbacks.delete(callback);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getSubscribedCount(): number {
    return this.subscribedTickers.size;
  }

  private scheduleFlush(): void {
    if (this.flushTimeout) return;
    
    this.flushTimeout = setTimeout(() => {
      this.flushTimeout = null;
      this.flushPendingChanges();
    }, 100);
  }

  private flushPendingChanges(): void {
    if (this.status !== 'open' || !this.ws) {
      return;
    }

    if (this.pendingUnsubscriptions.size > 0) {
      const tickers = Array.from(this.pendingUnsubscriptions);
      this.sendUnsubscribe(tickers);
      for (const t of tickers) {
        this.subscribedTickers.delete(t);
      }
      this.pendingUnsubscriptions.clear();
    }

    if (this.pendingSubscriptions.size > 0) {
      const tickers = Array.from(this.pendingSubscriptions);
      this.sendSubscribe(tickers);
      for (const t of tickers) {
        this.subscribedTickers.add(t);
      }
      this.pendingSubscriptions.clear();
    }
  }

  private sendSubscribe(tickers: string[]): void {
    if (tickers.length === 0) return;
    console.log(`[DFlow WS] Subscribing to ${tickers.length} tickers`);
    this.send({ type: 'subscribe', channel: 'prices', tickers });
  }

  private sendUnsubscribe(tickers: string[]): void {
    if (tickers.length === 0) return;
    console.log(`[DFlow WS] Unsubscribing from ${tickers.length} tickers`);
    this.send({ type: 'unsubscribe', channel: 'prices', tickers });
  }

  private send(message: object): void {
    if (this.ws && this.status === 'open') {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as WebSocketMessage;
      
      if (message.channel === 'prices' && message.ticker && message.data) {
        const ticker = message.ticker;
        const priceData = message.data;
        const priceMessage: PriceMessage = {
          ticker,
          yesBid: priceData.yesBid ?? null,
          yesAsk: priceData.yesAsk ?? null,
          noBid: priceData.noBid ?? null,
          noAsk: priceData.noAsk ?? null,
          yesPrice: priceData.yesAsk ?? priceData.yesBid ?? 0,
          noPrice: priceData.noAsk ?? priceData.noBid ?? 0,
          timestamp: Date.now(),
        };
        
        Array.from(this.priceCallbacks).forEach(callback => {
          callback(ticker, priceMessage);
        });
      }
    } catch (error) {
      const now = Date.now();
      if (now - this.lastErrorLog > 60000) {
        console.error('[DFlow WS] Parse error:', error);
        this.lastErrorLog = now;
      }
    }
  }

  private updateStatus(status: ConnectionStatus): void {
    this.status = status;
    Array.from(this.statusCallbacks).forEach(callback => {
      callback(status);
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;

    // Give up after MAX_RECONNECT_ATTEMPTS
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[DFlow WS] Max reconnect attempts reached, disabling live prices');
      this.updateStatus('closed');
      return;
    }

    this.updateStatus('reconnecting');
    
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts) + Math.random() * 1000,
      MAX_RECONNECT_DELAY
    );
    
    console.log(`[DFlow WS] Reconnecting in ${Math.round(delay / 1000)}s... (attempt ${this.reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  isAvailable(): boolean {
    return this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS;
  }
}

export const dflowWsClient = new DFlowWebSocketClient();
