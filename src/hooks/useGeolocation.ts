import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeoPosition } from '../types/PointOfInterest';

export type GeoStatus = 'idle' | 'pending' | 'active' | 'denied' | 'unavailable';

/**
 * Suivi GPS permanent haute précision.
 * `maximumAge: 3000` => une position fraîche au plus toutes les ~3 s.
 */
export function useGeolocation(enabled: boolean) {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      setError('Géolocalisation non supportée');
      return;
    }
    setStatus('pending');
    setError(null);
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setStatus('active');
        setError(null);
        setPosition({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
          speed: p.coords.speed,
          heading: p.coords.heading,
          timestamp: p.timestamp,
        });
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          setStatus('denied');
          setError('Autorisation GPS refusée');
        } else {
          setError(e.code === e.POSITION_UNAVAILABLE ? 'Signal GPS indisponible' : 'Délai GPS dépassé');
        }
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 },
    );
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [enabled, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { position, status, error, retry };
}
