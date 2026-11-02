import type { ReactNode } from 'react';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Hauteur max (classe Tailwind). */
  maxHeight?: string;
}

/** Panneau tactique glissant depuis le bas de l'écran. */
export default function Sheet({ title, onClose, children, maxHeight = 'max-h-[68vh]' }: SheetProps) {
  return (
    <div className="sheet-enter pointer-events-auto absolute inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-[1000] px-2">
      <div className={`panel flex ${maxHeight} flex-col overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-neon/30 px-3 py-2">
          <span className="holo-text text-sm tracking-[0.25em]">{title}</span>
          <button onClick={onClose} className="px-2 text-lg text-alert" aria-label="Fermer">✕</button>
        </div>
        <div className="overflow-y-auto p-3">{children}</div>
      </div>
    </div>
  );
}
