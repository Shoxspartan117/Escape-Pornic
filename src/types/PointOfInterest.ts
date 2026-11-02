/**
 * Point d'intérêt (POI) de l'escape game.
 * Le format est identique à celui du JSON importé / exporté par l'administration.
 */
export interface PointOfInterest {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  riddle: string;
  /** URL de l'image / icône du POI. */
  icon: string;
  /** Son joué en boucle tant que le POI est sélectionné (ex. "/audio/chateau.mp3"). */
  audio?: string;
  /** Distance (en mètres) en dessous de laquelle le POI devient visible. */
  activationRadius: number;
}

export const DEFAULT_ACTIVATION_RADIUS = 50;

/** Position normalisée issue de l'API Geolocation (ou simulée). */
export interface GeoPosition {
  latitude: number;
  longitude: number;
  /** Précision en mètres. */
  accuracy: number;
  /** Vitesse en m/s si disponible. */
  speed: number | null;
  /** Cap GPS (degrés) si disponible. */
  heading: number | null;
  timestamp: number;
  /** true si la position vient du mode simulation. */
  simulated?: boolean;
}
