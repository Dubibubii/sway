import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'sway_swipe_history';
const SWIPES_BEFORE_RETURN = 100;

interface SwipeHistory {
  swipeCounter: number;
  swipedCards: Record<string, number>;
  cacheTimestamp: number | null;
}

function loadHistory(): SwipeHistory {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        swipeCounter: parsed.swipeCounter || 0,
        swipedCards: parsed.swipedCards || {},
        cacheTimestamp: parsed.cacheTimestamp || null,
      };
    }
  } catch (e) {
    console.error('Failed to load swipe history:', e);
  }
  return { swipeCounter: 0, swipedCards: {}, cacheTimestamp: null };
}

function saveHistory(history: SwipeHistory): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Failed to save swipe history:', e);
  }
}

export function useSwipeHistory() {
  const [history, setHistory] = useState<SwipeHistory>(loadHistory);
  const historyRef = useRef(history);
  
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  const recordSwipe = useCallback((cardId: string) => {
    setHistory(prev => {
      const newCounter = prev.swipeCounter + 1;
      const newSwipedCards = { ...prev.swipedCards, [cardId]: newCounter };
      
      for (const [id, swipedAt] of Object.entries(newSwipedCards)) {
        if (newCounter - swipedAt >= SWIPES_BEFORE_RETURN) {
          delete newSwipedCards[id];
        }
      }
      
      return {
        ...prev,
        swipeCounter: newCounter,
        swipedCards: newSwipedCards,
      };
    });
  }, []);

  const shouldShowCard = useCallback((cardId: string): boolean => {
    const swipedAt = history.swipedCards[cardId];
    if (swipedAt === undefined) {
      return true;
    }
    return history.swipeCounter - swipedAt >= SWIPES_BEFORE_RETURN;
  }, [history]);

  const getVisibleCards = useCallback(<T extends { id: string }>(cards: T[]): T[] => {
    return cards.filter(card => shouldShowCard(card.id));
  }, [shouldShowCard]);

  const resetHistory = useCallback(() => {
    setHistory({ swipeCounter: 0, swipedCards: {}, cacheTimestamp: null });
  }, []);
  
  const updateCacheTimestamp = useCallback((newTimestamp: number): boolean => {
    const current = historyRef.current;
    if (current.cacheTimestamp !== null && current.cacheTimestamp !== newTimestamp) {
      setHistory({ swipeCounter: 0, swipedCards: {}, cacheTimestamp: newTimestamp });
      return true;
    }
    if (current.cacheTimestamp === null) {
      setHistory(prev => ({ ...prev, cacheTimestamp: newTimestamp }));
    }
    return false;
  }, []);
  
  const getSwipedIds = useCallback((): string[] => {
    return Object.keys(historyRef.current.swipedCards);
  }, []);

  return {
    recordSwipe,
    shouldShowCard,
    getVisibleCards,
    resetHistory,
    swipeCount: history.swipeCounter,
    updateCacheTimestamp,
    getSwipedIds,
    cacheTimestamp: history.cacheTimestamp,
  };
}
