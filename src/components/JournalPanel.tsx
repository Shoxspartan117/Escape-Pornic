import type { PointOfInterest } from '../types/PointOfInterest';
import type { DiscoveredEntry, GameStats } from '../services/progressService';
import { formatDistance } from '../utils/calculateDistance';
import Sheet from './Sheet';

interface JournalPanelProps {
  pois: PointOfInterest[];
  discovered: DiscoveredEntry[];
  stats: GameStats;
  isAdmin: boolean;
  simulating: boolean;
  onSelect: (poi: PointOfInterest) => void;
  onSimulate: (poi: PointOfInterest | null) => void;
  onReset: () => void;
  onClose: () => void;
}

function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}

/** Historique des énigmes découvertes, progression et statistiques de partie. */
export default function JournalPanel({ pois, discovered, stats, isAdmin, simulating, onSelect, onSimulate, onReset, onClose }: JournalPanelProps) {
  const byId = new Map(pois.map((p) => [p.id, p]));
  const entries = discovered.filter((d) => byId.has(d.poiId)).sort((a, b) => b.at - a.at);
  const pct = pois.length ? Math.round((entries.length / pois.length) * 100) : 0;

  return (
    <Sheet title="JOURNAL DE MISSION" onClose={onClose}>
      <div className="space-y-4 text-xs">
        <section>
          <div className="mb-1 flex justify-between text-radar">
            <span>PROGRESSION</span>
            <span>{entries.length}/{pois.length} · {pct}%</span>
          </div>
          <div className="h-2 border border-radar/60">
            <div className="h-full bg-radar shadow-radar transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2 text-neon/90">
          <div className="border border-neon/30 p-2">TEMPS DE JEU<br /><b className="text-neon">{formatDuration(stats.playTimeMs)}</b></div>
          <div className="border border-neon/30 p-2">DISTANCE<br /><b className="text-neon">{formatDistance(stats.distanceWalked)}</b></div>
          <div className="border border-neon/30 p-2">ENTRÉES DE ZONE<br /><b className="text-signal">{stats.zoneEntries}</b></div>
          <div className="border border-neon/30 p-2">SORTIES DE ZONE<br /><b className="text-signal">{stats.zoneExits}</b></div>
        </section>

        <section>
          <div className="mb-1 tracking-widest text-neon/70">ÉNIGMES DÉCOUVERTES</div>
          {entries.length === 0 && <p className="text-neon/60">Aucune cible découverte pour le moment.</p>}
          <ul className="space-y-1">
            {entries.map((d) => {
              const poi = byId.get(d.poiId)!;
              return (
                <li key={d.poiId}>
                  <button className="w-full border border-radar/40 px-2 py-1 text-left" onClick={() => onSelect(poi)}>
                    <div className="flex justify-between text-radar">
                      <span>{poi.name}</span>
                      <span className="text-neon/60">{new Date(d.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="truncate text-white/70">{poi.riddle}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {(isAdmin || simulating) && (
          <section className="space-y-1">
            <div className="tracking-widest text-neon/70">MODE SIMULATION (tests hors Nantes)</div>
            <div className="flex flex-wrap gap-1">
              {pois.map((p) => (
                <button key={p.id} className="btn-neon !px-2 !py-1 !text-[10px]" onClick={() => onSimulate(p)}>{p.name.slice(0, 14)}</button>
              ))}
            </div>
            {simulating && <button className="btn-neon w-full !border-signal !text-signal" onClick={() => onSimulate(null)}>RETOUR AU GPS RÉEL</button>}
          </section>
        )}

        <button
          className="btn-neon w-full !border-alert !text-alert"
          onClick={() => window.confirm('Réinitialiser la progression et les statistiques ?') && onReset()}
        >
          RÉINITIALISER LA PARTIE
        </button>
      </div>
    </Sheet>
  );
}
