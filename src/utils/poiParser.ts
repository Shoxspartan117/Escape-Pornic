import type { PointOfInterest } from '../types/PointOfInterest';

/** Image par défaut des POI. */
export const DEMO_IMAGE = '/icons/target.svg';

export function newId(): string {
  return `poi-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Valide un objet inconnu et le convertit en POI (lève une erreur explicite sinon). */
export function parsePoi(raw: unknown, index: number): PointOfInterest {
  const o = raw as Record<string, unknown>;
  const fail = (field: string) => {
    throw new Error(`POI #${index + 1} : champ "${field}" invalide`);
  };
  if (!o || typeof o !== 'object') fail('objet');
  const latitude = Number(o.latitude);
  const longitude = Number(o.longitude);
  const radius = o.activationRadius === undefined ? 50 : Number(o.activationRadius);
  if (typeof o.name !== 'string' || !o.name.trim()) fail('name');
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) fail('latitude');
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) fail('longitude');
  if (!Number.isFinite(radius) || radius <= 0) fail('activationRadius');
  return {
    id: typeof o.id === 'string' && o.id ? o.id : newId(),
    name: String(o.name).trim(),
    latitude,
    longitude,
    riddle: typeof o.riddle === 'string' ? o.riddle : '',
    icon: typeof o.icon === 'string' && o.icon ? o.icon : DEMO_IMAGE,
    ...(typeof o.audio === 'string' && o.audio.trim() ? { audio: o.audio.trim() } : {}),
    activationRadius: radius,
  };
}

export function parsePoiList(json: string): PointOfInterest[] {
  const data = JSON.parse(json);
  if (!Array.isArray(data)) throw new Error('Le JSON doit être un tableau de POI');
  const pois = data.map(parsePoi);
  const ids = new Set<string>();
  for (const p of pois) {
    if (ids.has(p.id)) throw new Error(`Identifiant dupliqué : ${p.id}`);
    ids.add(p.id);
  }
  return pois;
}
