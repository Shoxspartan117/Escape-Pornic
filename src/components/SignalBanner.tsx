import { useEffect } from 'react';
import type { Banner } from '../hooks/usePoiTracking';

interface SignalBannerProps {
  banner: Banner | null;
  onDone: () => void;
}

/** Bandeau plein écran : "SIGNAL DETECTÉ / Nouvelle cible localisée". */
export default function SignalBanner({ banner, onDone }: SignalBannerProps) {
  useEffect(() => {
    if (!banner) return;
    const id = window.setTimeout(onDone, 4500);
    return () => window.clearTimeout(id);
  }, [banner, onDone]);

  if (!banner) return null;
  const detect = banner.kind === 'detect';
  const color = detect ? 'border-signal text-signal' : 'border-alert text-alert';

  return (
    <div key={banner.id} className="pointer-events-none absolute inset-x-0 top-1/3 z-[1200] flex justify-center px-4">
      <div className={`banner-enter panel border-2 px-6 py-4 text-center ${color}`} style={{ boxShadow: '0 0 30px currentColor' }}>
        <div className="text-[10px] tracking-[0.4em]">{detect ? '⚠ ALERTE ⚠' : 'INFO'}</div>
        <div className="glitch text-2xl font-bold tracking-widest">{banner.title}</div>
        <div className="text-sm text-white/90">{banner.subtitle}</div>
      </div>
    </div>
  );
}
