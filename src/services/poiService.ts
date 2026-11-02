import demoPois from '../data/pois.json';
import type { PointOfInterest } from '../types/PointOfInterest';
import { parsePoi, parsePoiList } from '../utils/poiParser';
import { readJson, writeJson } from './storage';

const STORAGE_KEY = 'nantes-ops:pois';

/**
 * Contrat du dépôt de POI. Toutes les méthodes sont asynchrones pour qu'une
 * implémentation REST (fetch) puisse remplacer `LocalStoragePoiRepository`
 * sans modifier les composants.
 */
export interface PoiRepository {
  getAll(): Promise<PointOfInterest[]>;
  save(poi: PointOfInterest): Promise<PointOfInterest[]>;
  remove(id: string): Promise<PointOfInterest[]>;
  replaceAll(pois: PointOfInterest[]): Promise<PointOfInterest[]>;
  reset(): Promise<PointOfInterest[]>;
}

const demo = (): PointOfInterest[] => (demoPois as unknown[]).map(parsePoi);

class LocalStoragePoiRepository implements PoiRepository {
  private read(): PointOfInterest[] {
    const stored = readJson<unknown[] | null>(STORAGE_KEY, null);
    if (!Array.isArray(stored)) return demo();
    try {
      return stored.map(parsePoi);
    } catch {
      return demo();
    }
  }

  private write(pois: PointOfInterest[]): PointOfInterest[] {
    writeJson(STORAGE_KEY, pois);
    return pois;
  }

  async getAll() {
    return this.read();
  }

  async save(poi: PointOfInterest) {
    const list = this.read();
    const i = list.findIndex((p) => p.id === poi.id);
    if (i >= 0) list[i] = poi;
    else list.push(poi);
    return this.write(list);
  }

  async remove(id: string) {
    return this.write(this.read().filter((p) => p.id !== id));
  }

  async replaceAll(pois: PointOfInterest[]) {
    return this.write(pois);
  }

  async reset() {
    return this.write(demo());
  }
}

export const poiService: PoiRepository = new LocalStoragePoiRepository();

export const exportPoisJson = (pois: PointOfInterest[]) => JSON.stringify(pois, null, 2);
export const importPoisJson = parsePoiList;
