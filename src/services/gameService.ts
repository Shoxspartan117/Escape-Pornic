import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface GameTeam {
  id: string;
  name: string;
  color: string;
  playersSharingLocation: number;
}

export interface GamePlayer {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  location: TeamLocation;
}

export interface TeamLocation {
  latitude: number;
  longitude: number;
  updatedAt: number;
}

export interface GameSession {
  gameId: string;
  gameName: string;
  gameCode: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  teamCode: string;
  playerName: string;
  playerId: string;
}

type SessionRpcName =
  | 'get_my_team'
  | 'create_team_in_game'
  | 'join_team_by_code';

let realtimeChannelSequence = 0;

function getClient(): SupabaseClient {
  if (!supabase) {
    throw new Error('La connexion aux équipes n’est pas configurée. Consultez le guide de démarrage.');
  }
  return supabase;
}

async function getAuthenticatedClient(): Promise<SupabaseClient> {
  const client = getClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw new Error(`Connexion impossible : ${sessionError.message}`);
  if (sessionData.session) return client;

  const { error } = await client.auth.signInAnonymously();
  if (error) throw new Error(`Connexion anonyme impossible : ${error.message}`);
  return client;
}

function parseSession(raw: unknown): GameSession {
  if (!isRecord(raw)) {
    throw new Error('Le serveur a renvoyé une réponse de partie invalide.');
  }
  const gameId = requiredString(raw.game_id);
  const gameName = requiredString(raw.game_name);
  const gameCode = requiredString(raw.game_code);
  const teamId = requiredString(raw.team_id);
  const teamName = requiredString(raw.team_name);
  const teamColor = requiredString(raw.team_color);
  const teamCode = requiredString(raw.team_code);
  const playerName = requiredString(raw.player_name);
  const playerId = requiredString(raw.player_id);
  if (!gameId || !gameName || !gameCode || !teamId || !teamName || !teamColor || !teamCode || !playerName || !playerId) {
    throw new Error('Le serveur a renvoyé une réponse de partie incomplète.');
  }

  return { gameId, gameName, gameCode, teamId, teamName, teamColor, teamCode, playerName, playerId };
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTeams(raw: unknown): GameTeam[] {
  if (!Array.isArray(raw)) {
    throw new Error('Le serveur a renvoyé une liste d’équipes invalide.');
  }
  return raw.map((entry) => {
    if (!isRecord(entry)) throw new Error('Le serveur a renvoyé une équipe invalide.');
    const id = requiredString(entry.id);
    const name = requiredString(entry.name);
    const color = requiredString(entry.color);
    if (!id || !name || !color) throw new Error('Le serveur a renvoyé une équipe incomplète.');
    return { id, name, color, playersSharingLocation: 0 };
  });
}

function parseGamePlayers(raw: unknown): GamePlayer[] {
  if (!Array.isArray(raw)) throw new Error('Le serveur a renvoyé une liste de joueurs invalide.');
  return raw.map((entry) => {
    if (!isRecord(entry)) throw new Error('Le serveur a renvoyé un joueur invalide.');
    const id = requiredString(entry.player_id);
    const name = requiredString(entry.player_name);
    const teamId = requiredString(entry.team_id);
    const teamName = requiredString(entry.team_name);
    const teamColor = requiredString(entry.team_color);
    const updatedAt = typeof entry.updated_at === 'string' ? Date.parse(entry.updated_at) : NaN;
    const latitude = typeof entry.latitude === 'number' ? entry.latitude : NaN;
    const longitude = typeof entry.longitude === 'number' ? entry.longitude : NaN;
    if (
      !id ||
      !name ||
      !teamId ||
      !teamName ||
      !teamColor ||
      !Number.isFinite(updatedAt) ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error('Le serveur a renvoyé des informations de joueur invalides.');
    }
    return {
      id,
      name,
      teamId,
      teamName,
      teamColor,
      location: { latitude, longitude, updatedAt },
    };
  });
}

async function getGamePlayers(client: SupabaseClient, gameId: string): Promise<GamePlayer[]> {
  const { data, error } = await client.rpc('get_game_player_positions', { p_game_id: gameId });
  if (error) throw new Error(`Impossible de charger les joueurs : ${error.message}`);
  return parseGamePlayers(data);
}

async function callSessionRpc(
  name: SessionRpcName,
  args?: Record<string, string>,
): Promise<GameSession | null> {
  const client = await getAuthenticatedClient();
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
  return data === null ? null : parseSession(data);
}

export async function getGameRoster(gameId: string): Promise<{ teams: GameTeam[]; players: GamePlayer[] }> {
  const client = await getAuthenticatedClient();
  const { data: teamsData, error: teamsError } = await client
    .from('teams')
    .select('id, name, color')
    .eq('game_id', gameId)
    .order('created_at', { ascending: true });
  if (teamsError) throw new Error(`Impossible de charger les équipes : ${teamsError.message}`);
  const teams = parseTeams(teamsData);
  const players = await getGamePlayers(client, gameId);
  const playersByTeam = new Map<string, number>();
  for (const player of players) {
    playersByTeam.set(player.teamId, (playersByTeam.get(player.teamId) ?? 0) + 1);
  }
  return {
    teams: teams.map((team) => ({ ...team, playersSharingLocation: playersByTeam.get(team.id) ?? 0 })),
    players,
  };
}

export async function setMyPlayerPosition(latitude: number, longitude: number): Promise<void> {
  const client = await getAuthenticatedClient();
  const { error } = await client.rpc('set_my_player_position', {
    p_latitude: latitude,
    p_longitude: longitude,
  });
  if (error) throw new Error(`Impossible de partager la position : ${error.message}`);
}

export async function clearMyPlayerPosition(): Promise<void> {
  const client = await getAuthenticatedClient();
  const { error } = await client.rpc('clear_my_player_position');
  if (error) throw new Error(`Impossible d’arrêter le partage de position : ${error.message}`);
}

export async function updateMyPlayerName(playerName: string): Promise<string> {
  const client = await getAuthenticatedClient();
  const { data, error } = await client.rpc('set_my_player_name', {
    p_player_name: playerName.trim(),
  });
  if (error) throw new Error(`Impossible de modifier le nom du joueur : ${error.message}`);
  const updatedName = requiredString(data);
  if (!updatedName) throw new Error('Le serveur n’a pas confirmé le nouveau nom du joueur.');
  return updatedName;
}

export async function watchGameTeams(
  gameId: string,
  onChange: () => void,
  onStatus: (status: 'connecting' | 'connected' | 'disconnected', message?: string) => void,
): Promise<() => void> {
  const client = await getAuthenticatedClient();
  const channel = client
    .channel(`game-teams:${gameId}:${++realtimeChannelSequence}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'teams', filter: `game_id=eq.${gameId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'player_positions', filter: `game_id=eq.${gameId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'team_members' },
      onChange,
    )
    .subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        onStatus('connected');
        onChange();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onStatus(
          'disconnected',
          error?.message ||
            (status === 'TIMED_OUT'
              ? 'Supabase n’a pas répondu à temps. Vérifiez votre connexion internet.'
              : 'La souscription Realtime a échoué. Vérifiez les paramètres Realtime du projet.'),
        );
      } else if (status === 'CLOSED') {
        onStatus('disconnected', 'La connexion Realtime a été fermée.');
      } else {
        onStatus('connecting');
      }
    });

  return () => {
    void client.removeChannel(channel);
  };
}

export function getMyTeam(): Promise<GameSession | null> {
  return callSessionRpc('get_my_team');
}

export function createTeamInGame(
  gameCode: string,
  teamName: string,
  teamColor: string,
  playerName: string,
): Promise<GameSession | null> {
  return callSessionRpc('create_team_in_game', {
    p_game_code: gameCode,
    p_team_name: teamName,
    p_color: teamColor,
    p_player_name: playerName,
  });
}

export function joinTeam(teamCode: string, playerName: string): Promise<GameSession | null> {
  return callSessionRpc('join_team_by_code', { p_team_code: teamCode, p_player_name: playerName });
}
