import { useEffect, useRef } from 'react';
import type { PointOfInterest } from '../types/PointOfInterest';
import { formatCoord, formatDistance } from '../utils/calculateDistance';
import { asset } from '../utils/asset';
import { useAudio } from './AudioManager';

interface PoiPopupProps {
  poi: PointOfInterest;
  distance: number | undefined;
  onClose: () => void;
}

/** Joue le son du POI en boucle tant que la fiche est ouverte ; l'ambiance est mise en pause puis reprise. */
function usePoiSound(audioPath: string | undefined) {
  const { playing, play, pause } = useAudio();
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    if (!audioPath) return;
    const resumeAmbient = playingRef.current;
    const el = new Audio(asset(audioPath));
    el.loop = true;
    if (resumeAmbient) pause();
    void el.play().catch(() => {
      if (resumeAmbient) play();
    });
    return () => {
      el.pause();
      el.removeAttribute('src');
      el.load();
      if (resumeAmbient) play();
    };
  }, [audioPath, play, pause]);
}

/** Panneau de renseignement ouvert au clic sur un POI. */
export default function PoiPopup({ poi, distance, onClose }: PoiPopupProps) {
  usePoiSound(poi.audio);
  return (
    <div className="absolute inset-0 z-[1100] flex items-end bg-black/60 p-2 pb-[calc(72px+env(safe-area-inset-bottom))]" onClick={onClose}>
      <div className="sheet-enter panel max-h-[80vh] w-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <pre className="holo-text overflow-hidden whitespace-pre-wrap break-all px-2 pt-3 text-center text-[11px] leading-tight tracking-widest">
          {'═══════════════════════\n  CIBLE IDENTIFIÉE\n═══════════════════════'}
        </pre>
        <div className="space-y-3 p-3 text-xs">
          <div className="relative mx-auto h-36 w-full overflow-hidden border border-neon/50 bg-black">
            <img src={asset(poi.icon)} alt={poi.name} className="h-full w-full object-contain" onError={(e) => ((e.target as HTMLImageElement).src = asset('/icons/target.svg'))} />
            <div className="scan-line absolute inset-x-0 h-0.5" />
          </div>
          <h2 className="text-base tracking-wider text-radar">{poi.name}</h2>
          <div className="grid grid-cols-2 gap-2 text-neon/90">
            <div>{formatCoord(poi.latitude, 'N', 'S')}</div>
            <div>{formatCoord(poi.longitude, 'E', 'W')}</div>
            <div className="text-signal">DISTANCE : {formatDistance(distance)}</div>
            <div>RAYON : {poi.activationRadius} m</div>
          </div>
          <div className="border-l-2 border-signal bg-signal/10 p-2">
            <div className="mb-1 text-[10px] tracking-widest text-signal">ÉNIGME</div>
            <p className="text-sm leading-relaxed text-white/90">{poi.riddle || 'Aucune énigme.'}</p>
          </div>
          <button className="btn-neon w-full" onClick={onClose}>FERMER LE DOSSIER</button>
        </div>
      </div>
    </div>
  );
}
