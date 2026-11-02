import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeoPosition, PointOfInterest } from '../types/PointOfInterest';
import { calculateDistance } from '../utils/calculateDistance';
import { notify, playDetectSound, playExitSound, vibrate } from '../utils/feedback';
import {
  type DiscoveredEntry,
  type GameStats,
  freshStats,
  loadDiscovered,
  loadStats,
  resetProgress,
  saveDiscovered,
  saveStats,
} from '../services/progressService';

export interface Banner {
  id: number;
  kind: 'detect' | 'exit';
  title: string;
  subtitle: string;
}

/** Distance minimale (m) pour compter un déplacement dans les statistiques. */
const MIN_STEP_M = 5;
const MAX_ACCURACY_FOR_STATS_M = 50;

/**
 * Cœur du gameplay : distances, visibilité des POI, détection entrée/sortie de zone,
 * découvertes persistées et statistiques de partie.
 */
export function usePoiTracking(position: GeoPosition | null, pois: PointOfInterest[]) {
  const [discovered, setDiscovered] = useState<DiscoveredEntry[]>(loadDiscovered);
  const [stats, setStats] = useState<GameStats>(loadStats);
  const [banner, setBanner] = useState<Banner | null>(null);
  const previousVisible = useRef<Set<string>>(new Set());
  const lastCounted = useRef<GeoPosition | null>(null);
  const bannerId = useRef(0);

  const distances = useMemo(() => {
    const map = new Map<string, number>();
    if (position) {
      for (const p of pois) {
        map.set(p.id, calculateDistance(position.latitude, position.longitude, p.latitude, p.longitude));
      }
    }
    return map;
  }, [position, pois]);

  const visible = useMemo(
    () =>
      pois.filter((p) => {
        const d = distances.get(p.id);
        return d !== undefined && d <= p.activationRadius;
      }),
    [pois, distances],
  );

  // Entrée / sortie de zone
  useEffect(() => {
    const current = new Set(visible.map((p) => p.id));
    const previous = previousVisible.current;
    const entered = visible.filter((p) => !previous.has(p.id));
    const exitedIds = [...previous].filter((id) => !current.has(id));
    previousVisible.current = current;

    if (entered.length > 0) {
      const now = Date.now();
      setDiscovered((cur) => {
        const known = new Set(cur.map((d) => d.poiId));
        const added = entered.filter((p) => !known.has(p.id)).map((p) => ({ poiId: p.id, at: now }));
        return added.length ? [...cur, ...added] : cur;
      });
      setStats((s) => ({ ...s, zoneEntries: s.zoneEntries + entered.length }));
      const names = entered.map((p) => p.name).join(', ');
      setBanner({ id: ++bannerId.current, kind: 'detect', title: 'SIGNAL DETECTÉ', subtitle: 'Nouvelle cible localisée' });
      vibrate([200, 100, 200, 100, 400]);
      playDetectSound();
      void notify('SIGNAL DETECTÉ', `Nouvelle cible localisée : ${names}`);
    } else if (exitedIds.length > 0) {
      setStats((s) => ({ ...s, zoneExits: s.zoneExits + exitedIds.length }));
      setBanner({ id: ++bannerId.current, kind: 'exit', title: 'ZONE QUITTÉE', subtitle: 'Signal perdu' });
      vibrate(120);
      playExitSound();
    }
  }, [visible]);

  // Distance parcourue (ignorée en simulation et en cas de mauvaise précision)
  useEffect(() => {
    if (!position || position.simulated || position.accuracy > MAX_ACCURACY_FOR_STATS_M) {
      if (position?.simulated) lastCounted.current = null;
      return;
    }
    const last = lastCounted.current;
    if (!last) {
      lastCounted.current = position;
      return;
    }
    const step = calculateDistance(last.latitude, last.longitude, position.latitude, position.longitude);
    if (step >= MIN_STEP_M) {
      lastCounted.current = position;
      setStats((s) => ({ ...s, distanceWalked: s.distanceWalked + step }));
    }
  }, [position]);

  // Temps de jeu
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) setStats((s) => ({ ...s, playTimeMs: s.playTimeMs + 5000 }));
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => saveDiscovered(discovered), [discovered]);
  useEffect(() => saveStats(stats), [stats]);

  const dismissBanner = useCallback(() => setBanner(null), []);

  const reset = useCallback(() => {
    resetProgress();
    setDiscovered([]);
    setStats(freshStats());
    previousVisible.current = new Set();
  }, []);

  return { distances, visible, discovered, stats, banner, dismissBanner, reset };
}
