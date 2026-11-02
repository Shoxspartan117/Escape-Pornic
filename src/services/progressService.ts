import { readJson, writeJson } from './storage';

const DISCOVERED_KEY = 'nantes-ops:discovered';
const STATS_KEY = 'nantes-ops:stats';

export interface DiscoveredEntry {
  poiId: string;
  at: number;
}

export interface GameStats {
  startedAt: number;
  playTimeMs: number;
  distanceWalked: number;
  zoneEntries: number;
  zoneExits: number;
}

export const loadDiscovered = (): DiscoveredEntry[] => readJson<DiscoveredEntry[]>(DISCOVERED_KEY, []);
export const saveDiscovered = (d: DiscoveredEntry[]) => writeJson(DISCOVERED_KEY, d);

export const freshStats = (): GameStats => ({
  startedAt: Date.now(),
  playTimeMs: 0,
  distanceWalked: 0,
  zoneEntries: 0,
  zoneExits: 0,
});

export const loadStats = (): GameStats => ({ ...freshStats(), ...readJson<Partial<GameStats>>(STATS_KEY, {}) });
export const saveStats = (s: GameStats) => writeJson(STATS_KEY, s);

export function resetProgress(): void {
  localStorage.removeItem(DISCOVERED_KEY);
  localStorage.removeItem(STATS_KEY);
}
