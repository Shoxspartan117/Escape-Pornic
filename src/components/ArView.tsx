import { useEffect, useRef, useState } from 'react';
import type { GeoPosition, PointOfInterest } from '../types/PointOfInterest';
import { calculateBearing, formatDistance } from '../utils/calculateDistance';

interface ArViewProps {
  position: GeoPosition | null;
  heading: number | null;
  pois: PointOfInterest[];
  distances: Map<string, number>;
  onSelect: (poi: PointOfInterest) => void;
  onClose: () => void;
}

/** Champ de vision horizontal approximatif de la caméra (degrés). */
const FOV = 66;

/** Réalité augmentée : flux caméra + étiquettes des POI visibles placées selon la boussole. */
export default function ArView({ position, heading, pois, distances, onSelect, onClose }: ArViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Caméra non disponible (HTTPS requis)');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play().catch(() => undefined);
        }
      })
      .catch(() => setError('Accès caméra refusé'));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const labels = position && heading !== null
    ? pois
        .map((p) => {
          const bearing = calculateBearing(position.latitude, position.longitude, p.latitude, p.longitude);
          const rel = ((bearing - heading + 540) % 360) - 180;
          return { poi: p, rel };
        })
        .filter((l) => Math.abs(l.rel) <= FOV / 2)
    : [];

  return (
    <div className="absolute inset-0 z-[1050] bg-black">
      <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
      <div className="scanlines pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-radar/70" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-px w-24 -translate-x-1/2 bg-radar/60" />

      {labels.map(({ poi, rel }) => (
        <button
          key={poi.id}
          onClick={() => onSelect(poi)}
          className="banner-enter panel absolute top-1/3 -translate-x-1/2 px-2 py-1 text-center text-[11px] text-signal"
          style={{ left: `${50 + (rel / FOV) * 100}%` }}
        >
          <div className="text-xs">◈ {poi.name}</div>
          <div className="text-neon">{formatDistance(distances.get(poi.id))}</div>
          <div className="mx-auto h-8 w-px bg-signal" />
        </button>
      ))}

      <div className="absolute inset-x-0 top-[calc(12px+env(safe-area-inset-top))] flex justify-center">
        <div className="panel px-3 py-1 text-xs text-radar">
          {error ?? (heading === null ? 'BOUSSOLE INDISPONIBLE' : labels.length ? `${labels.length} CIBLE(S) EN VUE` : 'AUCUNE CIBLE EN VUE')}
        </div>
      </div>
      <button className="btn-neon absolute bottom-[calc(80px+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2" onClick={onClose}>
        QUITTER LE MODE AR
      </button>
    </div>
  );
}
