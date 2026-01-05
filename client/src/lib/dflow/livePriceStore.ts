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

export function useLivePrice(_ticker: string | undefined): PriceMessage | null {
  return null;
}

export function useConnectionStatus(): ConnectionStatus {
  return 'closed';
}

export function useLivePrices(_tickers: string[]): Record<string, PriceMessage> {
  return {};
}

export function useWebSocketSubscription(_tickers: string[], _enabled = true) {
}

export function connectWebSocket() {
}

export function disconnectWebSocket() {
}
