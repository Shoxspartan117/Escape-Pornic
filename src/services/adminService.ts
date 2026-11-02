import type { PointOfInterest } from '../types/PointOfInterest';
import { parsePoiList } from '../utils/poiParser';
import { adminSupabase, supabase } from './supabase';

export interface AdminGame {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  teamCount: number;
  playerCount: number;
}

export interface AdminPlayerItem {
  id: string;
  kind: 'bonus' | 'malus';
  name: string;
  description: string;
  active: boolean;
}

export interface AdminPlayer {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  sharingLocation: boolean;
  items: AdminPlayerItem[];
}

export interface AdminTeam {
  id: string;
  name: string;
  color: string;
  playerCount: number;
}

export interface AdminRoster {
  teams: AdminTeam[];
  players: AdminPlayer[];
}

export interface AdminMessage {
  id: string;
  teamId: string | null;
  teamName: string | null;
  title: string;
  body: string;
  createdAt: string;
  acknowledgedCount: number;
}

function adminClientOrThrow() {
  if (!adminSupabase) throw new Error('Supabase n’est pas configuré.');
  return adminSupabase;
}

function playerClientOrThrow() {
  if (!supabase) throw new Error('Supabase n’est pas configuré.');
  return supabase;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Le serveur a renvoyé une réponse invalide.');
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Le serveur a renvoyé un champ ${field} invalide.`);
  return value;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Le serveur a renvoyé une liste invalide.');
  return value;
}

function parseAdminGame(raw: unknown): AdminGame {
  const row = record(raw);
  const counts = [row.team_count, row.player_count].map(Number);
  if (counts.some((count) => !Number.isInteger(count) || count < 0)) throw new Error('Compteurs de partie invalides.');
  return {
    id: string(row.id, 'id'),
    name: string(row.name, 'name'),
    code: string(row.code, 'code'),
    createdAt: string(row.created_at, 'created_at'),
    teamCount: counts[0],
    playerCount: counts[1],
  };
}

function parseItem(raw: unknown): AdminPlayerItem {
  const row = record(raw);
  if (row.kind !== 'bonus' && row.kind !== 'malus') throw new Error('Type de bonus/malus invalide.');
  if (row.active !== undefined && typeof row.active !== 'boolean') throw new Error('État du bonus/malus invalide.');
  return {
    id: string(row.id, 'item id'),
    kind: row.kind,
    name: string(row.name, 'item name'),
    description: typeof row.description === 'string' ? row.description : '',
    active: typeof row.active === 'boolean' ? row.active : true,
  };
}

function parseAdminPlayer(raw: unknown): AdminPlayer {
  const row = record(raw);
  if (typeof row.sharing_location !== 'boolean') throw new Error('État GPS du joueur invalide.');
  return {
    id: string(row.player_id, 'player id'),
    name: string(row.player_name, 'player name'),
    teamId: string(row.team_id, 'team id'),
    teamName: string(row.team_name, 'team name'),
    teamColor: string(row.team_color, 'team color'),
    sharingLocation: row.sharing_location,
    items: array(row.items).map(parseItem),
  };
}

function parseAdminTeam(raw: unknown): AdminTeam {
  const row = record(raw);
  const playerCount = Number(row.player_count);
  if (!Number.isInteger(playerCount) || playerCount < 0) throw new Error('Nombre de joueurs par équipe invalide.');
  return {
    id: string(row.id, 'team id'),
    name: string(row.name, 'team name'),
    color: string(row.color, 'team color'),
    playerCount,
  };
}

function parseMessage(raw: unknown): AdminMessage {
  const row = record(raw);
  const acknowledgedCount = Number(row.acknowledged_count);
  if (!Number.isInteger(acknowledgedCount) || acknowledgedCount < 0) throw new Error('Compteur d’acquittements invalide.');
  return {
    id: string(row.id, 'message id'),
    teamId: typeof row.team_id === 'string' ? row.team_id : null,
    teamName: typeof row.team_name === 'string' ? row.team_name : null,
    title: string(row.title, 'message title'),
    body: string(row.body, 'message body'),
    createdAt: string(row.created_at, 'message date'),
    acknowledgedCount,
  };
}

export async function signInAdmin(email: string, password: string): Promise<void> {
  const client = adminClientOrThrow();
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(`Connexion admin impossible : ${error.message}`);
  const { data, error: roleError } = await client.rpc('is_admin');
  if (roleError || data !== true) {
    const reason = roleError?.message ?? 'Ce compte n’a pas les droits administrateur.';
    const { error: signOutError } = await client.auth.signOut();
    throw new Error(signOutError ? `${reason} La fermeture de la session a échoué : ${signOutError.message}` : reason);
  }
}

export async function checkAdminSession(): Promise<boolean> {
  const client = adminClientOrThrow();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw new Error(`Vérification de la session impossible : ${sessionError.message}`);
  if (!sessionData.session) return false;
  const { data, error } = await client.rpc('is_admin');
  if (error) throw new Error(`Vérification des droits impossible : ${error.message}`);
  return data === true;
}

export async function signOutAdmin(): Promise<void> {
  const { error } = await adminClientOrThrow().auth.signOut();
  if (error) throw new Error(`Déconnexion impossible : ${error.message}`);
}

export async function listAdminGames(): Promise<AdminGame[]> {
  const { data, error } = await adminClientOrThrow().rpc('admin_list_games');
  if (error) throw new Error(`Chargement des parties impossible : ${error.message}`);
  return array(data).map(parseAdminGame);
}

export async function createAdminGame(name: string, pois: PointOfInterest[]): Promise<AdminGame> {
  const { data, error } = await adminClientOrThrow().rpc('admin_create_game', {
    p_name: name.trim(),
    p_pois: pois,
  });
  if (error) throw new Error(`Création de la partie impossible : ${error.message}`);
  const row = record(data);
  return {
    id: string(row.id, 'id'),
    name: string(row.name, 'name'),
    code: string(row.code, 'code'),
    createdAt: new Date().toISOString(),
    teamCount: 0,
    playerCount: 0,
  };
}

export async function getGamePois(gameId: string): Promise<PointOfInterest[]> {
  const { data, error } = await playerClientOrThrow().rpc('get_game_pois', { p_game_id: gameId });
  if (error) throw new Error(`Chargement du parcours impossible : ${error.message}`);
  return parsePoiList(JSON.stringify(data));
}

export async function getAdminGamePois(gameId: string): Promise<PointOfInterest[]> {
  const { data, error } = await adminClientOrThrow().rpc('get_game_pois', { p_game_id: gameId });
  if (error) throw new Error(`Chargement du parcours impossible : ${error.message}`);
  return parsePoiList(JSON.stringify(data));
}

export async function saveGamePois(gameId: string, pois: PointOfInterest[]): Promise<void> {
  const { error } = await adminClientOrThrow().rpc('admin_replace_game_pois', {
    p_game_id: gameId,
    p_pois: pois,
  });
  if (error) throw new Error(`Enregistrement du parcours impossible : ${error.message}`);
}

export async function getAdminGameRoster(gameId: string): Promise<AdminRoster> {
  const { data, error } = await adminClientOrThrow().rpc('admin_get_game_roster', { p_game_id: gameId });
  if (error) throw new Error(`Chargement des joueurs impossible : ${error.message}`);
  const result = record(data);
  return {
    teams: array(result.teams).map(parseAdminTeam),
    players: array(result.players).map(parseAdminPlayer),
  };
}

export async function grantPlayerItem(
  playerId: string,
  kind: 'bonus' | 'malus',
  name: string,
  description: string,
): Promise<void> {
  const { error } = await adminClientOrThrow().rpc('admin_grant_player_item', {
    p_player_id: playerId,
    p_kind: kind,
    p_name: name,
    p_description: description,
  });
  if (error) throw new Error(`Attribution impossible : ${error.message}`);
}

export async function deactivatePlayerItem(itemId: string): Promise<void> {
  const { error } = await adminClientOrThrow().rpc('admin_deactivate_player_item', { p_item_id: itemId });
  if (error) throw new Error(`Retrait de l’objet impossible : ${error.message}`);
}

export async function sendGameMessage(
  gameId: string,
  teamId: string | null,
  title: string,
  body: string,
): Promise<void> {
  const { error } = await adminClientOrThrow().rpc('admin_send_game_message', {
    p_game_id: gameId,
    p_team_id: teamId,
    p_title: title,
    p_body: body,
  });
  if (error) throw new Error(`Envoi du message impossible : ${error.message}`);
}

export async function listGameMessages(gameId: string): Promise<AdminMessage[]> {
  const { data, error } = await adminClientOrThrow().rpc('admin_list_game_messages', { p_game_id: gameId });
  if (error) throw new Error(`Chargement des communications impossible : ${error.message}`);
  return array(data).map(parseMessage);
}

export async function getMyPlayerItems(): Promise<AdminPlayerItem[]> {
  const { data, error } = await playerClientOrThrow().rpc('get_my_player_items');
  if (error) throw new Error(`Chargement des bonus et malus impossible : ${error.message}`);
  return array(data).map(parseItem);
}

export interface GameMessage {
  id: string;
  title: string;
  body: string;
}

export async function getMyGameMessages(): Promise<GameMessage[]> {
  const { data, error } = await playerClientOrThrow().rpc('get_my_game_messages');
  if (error) throw new Error(`Chargement des messages impossible : ${error.message}`);
  return array(data).map((raw) => {
    const row = record(raw);
    return {
      id: string(row.id, 'message id'),
      title: string(row.title, 'message title'),
      body: string(row.body, 'message body'),
    };
  });
}

export async function acknowledgeGameMessage(messageId: string): Promise<void> {
  const { error } = await playerClientOrThrow().rpc('acknowledge_game_message', { p_message_id: messageId });
  if (error) throw new Error(`Acquittement du message impossible : ${error.message}`);
}

let messageChannelId = 0;

export async function watchGameMessages(gameId: string, onChange: () => void): Promise<() => void> {
  const client = playerClientOrThrow();
  const channel = client
    .channel(`game-messages:${gameId}:${++messageChannelId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_messages', filter: `game_id=eq.${gameId}` }, onChange)
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
