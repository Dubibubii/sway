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
  
  // Keep ref in sync with state
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  const recordSwipe = useCallback((cardId: string) => {
    // IMMEDIATELY update the ref for synchronous access
    // This prevents race conditions where getVisibleCards runs before state updates
    const currentRef = historyRef.current;
    const newCounter = currentRef.swipeCounter + 1;
    const newSwipedCards = { ...currentRef.swipedCards, [cardId]: newCounter };
    
    // Clean up old cards from ref
    for (const [id, swipedAt] of Object.entries(newSwipedCards)) {
      if (newCounter - swipedAt >= SWIPES_BEFORE_RETURN) {
        delete newSwipedCards[id];
      }
    }
    
    // Update ref synchronously
    historyRef.current = {
      ...currentRef,
      swipeCounter: newCounter,
      swipedCards: newSwipedCards,
    };
    
    // Also update state (for persistence and re-renders)
    setHistory(prev => {
      const counter = prev.swipeCounter + 1;
      const cards = { ...prev.swipedCards, [cardId]: counter };
      
      for (const [id, swipedAt] of Object.entries(cards)) {
        if (counter - swipedAt >= SWIPES_BEFORE_RETURN) {
          delete cards[id];
        }
      }
      
      return {
        ...prev,
        swipeCounter: counter,
        swipedCards: cards,
      };
    });
  }, []);

  // Use ref for synchronous, always-current check
  const shouldShowCard = useCallback((cardId: string): boolean => {
    const current = historyRef.current;
    const swipedAt = current.swipedCards[cardId];
    if (swipedAt === undefined) {
      return true;
    }
    return current.swipeCounter - swipedAt >= SWIPES_BEFORE_RETURN;
  }, []);

  const getVisibleCards = useCallback(<T extends { id: string }>(cards: T[]): T[] => {
    return cards.filter(card => shouldShowCard(card.id));
  }, [shouldShowCard]);

  const resetHistory = useCallback(() => {
    const newHistory = { swipeCounter: 0, swipedCards: {}, cacheTimestamp: null };
    historyRef.current = newHistory;
    setHistory(newHistory);
  }, []);
  
  const updateCacheTimestamp = useCallback((newTimestamp: number): boolean => {
    const current = historyRef.current;
    // Only return true if cache changed (for shuffled order reset)
    // Do NOT reset swipe history - preserve swiped cards across cache updates
    const cacheChanged = current.cacheTimestamp !== null && current.cacheTimestamp !== newTimestamp;
    
    if (current.cacheTimestamp !== newTimestamp) {
      // Update timestamp but keep swipe history intact
      const updated = { ...current, cacheTimestamp: newTimestamp };
      historyRef.current = updated;
      setHistory(prev => ({ ...prev, cacheTimestamp: newTimestamp }));
    }
    
    return cacheChanged;
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
