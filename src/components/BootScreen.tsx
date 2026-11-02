interface BootScreenProps {
  onStart: () => void;
}

/** Écran d'initialisation : le geste utilisateur débloque GPS, boussole, audio et notifications. */
export default function BootScreen({ onStart }: BootScreenProps) {
  return (
    <div className="absolute inset-0 z-[2000] flex flex-col items-center justify-center gap-6 bg-void p-6 text-center">
      <div className="radar-sweep relative h-40 w-40 rounded-full border border-neon/70 shadow-neon">
        <div className="absolute inset-6 rounded-full border border-neon/40" />
        <div className="absolute inset-14 rounded-full border border-radar/50" />
      </div>
      <div>
        <div className="holo-text text-2xl tracking-[0.35em]">ESCAPE PORNIC</div>
        <div className="mt-1 text-xs tracking-widest text-radar">JEU DE PISTE GÉOLOCALISÉ</div>
      </div>
      <p className="max-w-xs text-xs leading-relaxed text-neon/80">
        Autorisez la localisation pour découvrir les étapes du parcours autour de vous.
      </p>
      <button className="btn-neon px-8 py-3 text-base" onClick={onStart}>
        ▶ INITIALISER LES SYSTÈMES
      </button>
    </div>
  );
}
