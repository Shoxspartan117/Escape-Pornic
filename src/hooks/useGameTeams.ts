import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getGameRoster,
  type GameSession,
  type GamePlayer,
  type GameTeam,
  watchGameTeams,
} from '../services/gameService';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export function useGameTeams(session: GameSession | null) {
  const [teamList, setTeamList] = useState<GameTeam[]>([]);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>('connecting');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(Date.now());
  const refreshPending = useRef(false);
  const refreshRequested = useRef(false);

  useEffect(() => {
    if (!session) {
      setTeamList([]);
      setPlayers([]);
      setLoading(false);
      setError(null);
      setConnection('connecting');
      setConnectionError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setTeamList([]);
    setPlayers([]);
    refreshPending.current = false;
    refreshRequested.current = false;
    let unsubscribe: (() => void) | null = null;

    const refreshTeams = async () => {
      if (refreshPending.current) {
        refreshRequested.current = true;
        return;
      }
      refreshPending.current = true;
      try {
        const result = await getGameRoster(session.gameId);
        if (active) {
          setTeamList(result.teams);
          setPlayers(result.players);
          setError(null);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Impossible de charger les équipes.');
      } finally {
        refreshPending.current = false;
        if (active) setLoading(false);
        if (active && refreshRequested.current) {
          refreshRequested.current = false;
          void refreshTeams();
        }
      }
    };

    void refreshTeams();
    void watchGameTeams(
      session.gameId,
      () => void refreshTeams(),
      (status, detail) => {
        if (!active) return;
        setConnection(status);
        setConnectionError(status === 'disconnected' ? detail ?? 'Connexion Realtime indisponible.' : null);
      },
    )
      .then((stop) => {
        if (active) unsubscribe = stop;
        else stop();
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setConnection('disconnected');
        setConnectionError(cause instanceof Error ? cause.message : 'Connexion Realtime impossible.');
      });

    const clock = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      active = false;
      window.clearInterval(clock);
      unsubscribe?.();
    };
  }, [retry, session]);

  const teams = useMemo(() => {
    const activePlayers = players.filter((player) => now - player.location.updatedAt <= 90_000);
    const counts = new Map<string, number>();
    for (const player of activePlayers) counts.set(player.teamId, (counts.get(player.teamId) ?? 0) + 1);
    return teamList.map((team) => ({
      ...team,
      playersSharingLocation: counts.get(team.id) ?? 0,
    }));
  }, [now, players, teamList]);

  return {
    teams,
    players,
    loading,
    error,
    connection,
    connectionError,
    now,
    retry: () => setRetry((current) => current + 1),
  };
}
