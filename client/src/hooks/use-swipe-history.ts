import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'pulse_swipe_history';
const SWIPES_BEFORE_RETURN = 100;

interface SwipeHistory {
  swipeCounter: number;
  swipedCards: Record<string, number>;
}

function loadHistory(): SwipeHistory {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load swipe history:', e);
  }
  return { swipeCounter: 0, swipedCards: {} };
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
    setHistory({ swipeCounter: 0, swipedCards: {} });
  }, []);

  return {
    recordSwipe,
    shouldShowCard,
    getVisibleCards,
    resetHistory,
    swipeCount: history.swipeCounter,
  };
}
