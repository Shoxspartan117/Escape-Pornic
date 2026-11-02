import { useCallback, useEffect, useRef, useState } from 'react';
import {
  acknowledgeGameMessage,
  getMyGameMessages,
  type GameMessage,
  watchGameMessages,
} from '../services/adminService';

export function useGameMessages(gameId: string | null) {
  const [messages, setMessages] = useState<GameMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refreshPending = useRef(false);
  const refreshAgain = useRef(false);

  const refresh = useCallback(async () => {
    if (!gameId) {
      setMessages([]);
      return;
    }
    if (refreshPending.current) {
      refreshAgain.current = true;
      return;
    }
    refreshPending.current = true;
    try {
      setMessages(await getMyGameMessages());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de charger les messages.');
    } finally {
      refreshPending.current = false;
      if (refreshAgain.current) {
        refreshAgain.current = false;
        void refresh();
      }
    }
  }, [gameId]);

  useEffect(() => {
    if (!gameId) {
      setMessages([]);
      setError(null);
      return;
    }
    let active = true;
    void refresh();
    let stop: (() => void) | null = null;
    void watchGameMessages(gameId, () => {
      if (active) void refresh();
    })
      .then((unsubscribe) => {
        if (active) stop = unsubscribe;
        else unsubscribe();
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Connexion aux communications impossible.');
      });
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      stop?.();
    };
  }, [gameId, refresh]);

  const acknowledge = useCallback(async (messageId: string) => {
    await acknowledgeGameMessage(messageId);
    await refresh();
  }, [refresh]);

  return { messages, error, acknowledge };
}
