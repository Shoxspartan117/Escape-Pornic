import type { GeoPosition, PointOfInterest } from '../types/PointOfInterest';
import { calculateBearing, formatDistance } from '../utils/calculateDistance';
import Sheet from './Sheet';

interface RadarPanelProps {
  position: GeoPosition | null;
  heading: number | null;
  /** POI actuellement visibles. */
  pois: PointOfInterest[];
  distances: Map<string, number>;
  onSelect: (poi: PointOfInterest) => void;
  onClose: () => void;
}

const SIZE = 240;
const C = SIZE / 2;
const R = C - 10;

/** Radar animé : utilisateur au centre, POI visibles, balayage rotatif. Orienté selon la boussole. */
export default function RadarPanel({ position, heading, pois, distances, onSelect, onClose }: RadarPanelProps) {
  const farthest = Math.max(0, ...pois.map((p) => distances.get(p.id) ?? 0));
  const range = Math.max(60, Math.ceil((farthest * 1.2) / 10) * 10);
  const rotation = heading ?? 0;

  return (
    <Sheet title="RADAR TACTIQUE" onClose={onClose}>
      <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
        <div className="absolute inset-0 overflow-hidden rounded-full border border-neon/60 bg-black shadow-neon">
          <div className="radar-sweep absolute inset-0" />
        </div>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0">
          {[0.33, 0.66, 1].map((k) => (
            <circle key={k} cx={C} cy={C} r={R * k} fill="none" stroke="#00FFFF" strokeOpacity={0.35} strokeWidth={1} />
          ))}
          <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="#00FFFF" strokeOpacity={0.25} />
          <line x1={C - R} y1={C} x2={C + R} y2={C} stroke="#00FFFF" strokeOpacity={0.25} />
          {/* Nord réel */}
          <g transform={`rotate(${-rotation} ${C} ${C})`}>
            <text x={C} y={C - R + 12} textAnchor="middle" fill="#FF3B30" fontSize="11">N</text>
          </g>
          {position &&
            pois.map((p) => {
              const d = distances.get(p.id) ?? 0;
              const angle = ((calculateBearing(position.latitude, position.longitude, p.latitude, p.longitude) - rotation) * Math.PI) / 180;
              const r = Math.min(d / range, 1) * R;
              const x = C + r * Math.sin(angle);
              const y = C - r * Math.cos(angle);
              return (
                <g key={p.id} onClick={() => onSelect(p)} style={{ cursor: 'pointer' }}>
                  <circle cx={x} cy={y} r={14} fill="transparent" />
                  <circle cx={x} cy={y} r={5} fill="#FF9500" className="blip" />
                  <circle cx={x} cy={y} r={9} fill="none" stroke="#FF9500" strokeOpacity={0.6} className="blip-ring" />
                </g>
              );
            })}
          <circle cx={C} cy={C} r={4} fill="#00FF99" />
          <path d={`M${C} ${C - 12} L${C - 5} ${C - 3} L${C + 5} ${C - 3}Z`} fill="#00FF99" />
        </svg>
      </div>
      <div className="mt-2 text-center text-[11px] text-neon/70">PORTÉE {range} m · {heading === null ? 'NORD EN HAUT' : 'CAP EN HAUT'}</div>
      <ul className="mt-2 space-y-1 text-xs">
        {pois.length === 0 && <li className="text-neon/60">Aucun signal dans la zone. Déplacez-vous…</li>}
        {pois.map((p) => (
          <li key={p.id}>
            <button className="flex w-full justify-between border border-signal/40 px-2 py-1 text-signal" onClick={() => onSelect(p)}>
              <span className="truncate">{p.name}</span>
              <span>{formatDistance(distances.get(p.id))}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
