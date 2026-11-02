export type PanelId = 'radar' | 'ar' | 'journal' | 'audio';

interface NavBarProps {
  active: PanelId | null;
  audioPlaying: boolean;
  onSelect: (panel: PanelId | null) => void;
}

const ITEMS: { id: PanelId | null; label: string; icon: string }[] = [
  { id: null, label: 'CARTE', icon: '◉' },
  { id: 'radar', label: 'RADAR', icon: '◎' },
  { id: 'ar', label: 'AR', icon: '◈' },
  { id: 'journal', label: 'JOURNAL', icon: '▤' },
  { id: 'audio', label: 'AUDIO', icon: '♪' },
];

/** Barre de navigation inférieure. */
export default function NavBar({ active, audioPlaying, onSelect }: NavBarProps) {
  return (
    <nav className="pointer-events-auto absolute inset-x-0 bottom-0 z-[1300] flex border-t border-neon/40 bg-black/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      {ITEMS.map((it) => (
        <button
          key={it.label}
          onClick={() => onSelect(it.id === active ? null : it.id)}
          className={`flex h-16 flex-1 flex-col items-center justify-center text-[10px] tracking-wider ${it.id === active ? 'bg-neon/10 text-radar' : 'text-neon/70'}`}
        >
          <span className={`text-xl leading-none ${it.id === 'audio' && audioPlaying ? 'blink' : ''}`}>{it.icon}</span>
          {it.label}
        </button>
      ))}
    </nav>
  );
}
