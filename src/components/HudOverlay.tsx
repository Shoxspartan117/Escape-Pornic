import { useEffect, useState } from 'react';
import type { GeoPosition } from '../types/PointOfInterest';
import type { BatteryInfo } from '../hooks/useBattery';
import type { GeoStatus } from '../hooks/useGeolocation';
import { formatCoord } from '../utils/calculateDistance';

interface HudOverlayProps {
  position: GeoPosition | null;
  status: GeoStatus;
  error: string | null;
  heading: number | null;
  targets: number;
  totalTargets: number;
  battery: BatteryInfo | null;
  simulated: boolean;
}

/** Précision GPS (m) -> qualité du signal (%). */
export function signalPercent(accuracy: number | undefined): number {
  if (accuracy === undefined) return 0;
  return Math.round(Math.max(0, Math.min(100, 100 - (accuracy - 5) * 1.5)));
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const cardinal = (deg: number) => CARDINALS[Math.round(deg / 45) % 8];

/** Mini boussole : le cadran tourne pour garder le nord réel en haut. */
function Compass({ heading }: { heading: number | null }) {
  return (
    <div className="relative h-14 w-14 rounded-full border border-neon/60 shadow-neon">
      <div
        className="absolute inset-0 transition-transform duration-300"
        style={{ transform: `rotate(${-(heading ?? 0)}deg)` }}
      >
        <span className="absolute left-1/2 top-0 -translate-x-1/2 text-[10px] text-alert">N</span>
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[9px] text-neon/60">S</span>
        <span className="absolute left-0.5 top-1/2 -translate-y-1/2 text-[9px] text-neon/60">O</span>
        <span className="absolute right-0.5 top-1/2 -translate-y-1/2 text-[9px] text-neon/60">E</span>
      </div>
      <div className="absolute left-1/2 top-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-radar" />
      <div className="absolute left-1/2 top-1.5 -translate-x-1/2 text-[8px] text-radar">▲</div>
      <div className="absolute inset-x-0 -bottom-4 text-center text-[10px] text-radar">
        {heading === null ? '---' : `${heading}° ${cardinal(heading)}`}
      </div>
    </div>
  );
}

/** HUD toujours visible : état GPS, signal, coordonnées, heure, cibles, batterie. */
export default function HudOverlay({ position, status, error, heading, targets, totalTargets, battery, simulated }: HudOverlayProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const online = status === 'active' || simulated;
  const signal = signalPercent(position?.accuracy);
  const speedKmh = position?.speed != null ? (position.speed * 3.6).toFixed(1) : null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[900] p-2 pt-[calc(8px+env(safe-area-inset-top))]">
      <div className="panel flex items-start justify-between gap-2 px-3 py-2 text-[11px] leading-snug">
        <div className="min-w-0 flex-1">
          <div className={online ? 'text-radar' : 'text-alert'}>
            <span className="blink">●</span> {simulated ? 'GPS SIMULÉ' : online ? 'GPS ONLINE' : status === 'denied' ? 'GPS REFUSÉ' : 'GPS OFFLINE'}
          </div>
          <div className={signal > 60 ? 'text-radar' : signal > 30 ? 'text-signal' : 'text-alert'}>SIGNAL {signal}%</div>
          <div>{position ? formatCoord(position.latitude, 'N', 'S') : 'N --.------'}</div>
          <div>{position ? formatCoord(position.longitude, 'E', 'W') : 'E --.------'}</div>
          <div className="text-neon/70">
            ±{position ? Math.round(position.accuracy) : '--'}m · {speedKmh ?? '--'} km/h
          </div>
          {error && !simulated && <div className="text-alert">⚠ {error}</div>}
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <div className="text-sm tracking-widest text-neon">{now.toLocaleTimeString('fr-FR')}</div>
          <div className="text-signal">
            TARGETS {String(targets).padStart(2, '0')}/{String(totalTargets).padStart(2, '0')}
          </div>
          <div className="text-neon/70">{battery ? `${battery.charging ? '⚡' : '▮'} BAT ${battery.level}%` : 'BAT N/A'}</div>
          <div className="pb-4 pt-1"><Compass heading={heading} /></div>
        </div>
      </div>
    </div>
  );
}
