import { useEffect, useRef } from 'react';

const API_BASE = '';

function getSessionId(): string {
  let sessionId = sessionStorage.getItem('pulse_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('pulse_session_id', sessionId);
  }
  return sessionId;
}

async function logEvent(event: {
  userId?: string;
  sessionId?: string;
  eventType: string;
  page?: string;
  marketId?: string;
  marketTitle?: string;
  wagerAmount?: string;
}) {
  try {
    await fetch(`${API_BASE}/api/analytics/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
  } catch {
  }
}

export function usePageView(page: string) {
  const logged = useRef(false);

  useEffect(() => {
    if (logged.current) return;
    logged.current = true;

    logEvent({
      sessionId: getSessionId(),
      eventType: 'page_view',
      page,
    });
  }, [page]);
}

export function useMarketView() {
  return (marketId: string, marketTitle: string) => {
    logEvent({
      sessionId: getSessionId(),
      eventType: 'market_view',
      marketId,
      marketTitle,
    });
  };
}

export function useBetPlaced() {
  return (marketId: string, marketTitle: string, wagerAmount: number) => {
    logEvent({
      sessionId: getSessionId(),
      eventType: 'bet_placed',
      marketId,
      marketTitle,
      wagerAmount: wagerAmount.toString(),
    });
  };
}
