import { useEffect, useState, type FormEvent } from 'react';
import {
  createTeamInGame,
  getMyTeam,
  joinTeam,
  type GameSession,
} from '../services/gameService';
import { isSupabaseConfigured } from '../services/supabase';

type JoinMode = 'new-team' | 'join-team';

const TEAM_COLORS = [
  { name: 'Rouge', value: '#E85D4A' },
  { name: 'Bleu', value: '#2878C8' },
  { name: 'Vert', value: '#29966F' },
  { name: 'Violet', value: '#8A5CC2' },
  { name: 'Jaune', value: '#D18B22' },
  { name: 'Gris', value: '#475569' },
];

interface TeamSetupProps {
  onReady: (session: GameSession) => void;
  onPlaySolo: () => void;
}

export default function TeamSetup({ onReady, onPlaySolo }: TeamSetupProps) {
  const [mode, setMode] = useState<JoinMode>('join-team');
  const [teamName, setTeamName] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [teamColor, setTeamColor] = useState(TEAM_COLORS[0].value);
  const [gameCode, setGameCode] = useState('');
  const [teamCode, setTeamCode] = useState('');
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    void getMyTeam()
      .then((session) => {
        if (active && session) onReady(session);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Impossible de charger votre équipe.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onReady]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      let session: GameSession | null;
      if (mode === 'new-team') {
        session = await createTeamInGame(gameCode.trim().toUpperCase(), teamName.trim(), teamColor, playerName.trim());
      } else {
        session = await joinTeam(teamCode.trim().toUpperCase(), playerName.trim());
      }
      if (!session) throw new Error('Aucune équipe n’a été renvoyée par le serveur.');
      onReady(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Une erreur est survenue. Réessayez.');
    } finally {
      setPending(false);
    }
  };

  if (loading) {
    return (
      <main className="relative flex h-full items-center justify-center overflow-hidden bg-void p-6 text-center text-neon">
        <div className="scanlines pointer-events-none absolute inset-0" />
        <div className="noise pointer-events-none absolute inset-0" />
        <div className="relative z-10 space-y-5">
          <div className="radar-sweep mx-auto h-16 w-16 rounded-full border border-neon/60" />
          <p role="status" className="holo-text text-sm tracking-[0.2em]">CONNEXION À VOTRE ÉQUIPE…</p>
        </div>
      </main>
    );
  }

  const fieldClass = 'field min-h-12 rounded-sm border-neon/40 bg-black/70 px-3 py-3 text-base text-neon placeholder:text-neon/35 focus:border-radar';

  return (
    <main className="relative flex h-full items-center justify-center overflow-y-auto bg-void px-4 py-[calc(16px+env(safe-area-inset-top))] pb-[calc(16px+env(safe-area-inset-bottom))] text-neon">
      <div className="scanlines pointer-events-none fixed inset-0" />
      <div className="noise pointer-events-none fixed inset-0" />
      <div className="scan-line pointer-events-none fixed inset-x-0 top-0 h-px" />
      <section className="panel relative z-10 my-auto w-full max-w-md space-y-5 p-5 sm:p-7">
        <header className="space-y-2 text-center">
          <div className="radar-sweep mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-neon/60 text-2xl text-radar shadow-neon" aria-hidden="true">◈</div>
          <p className="text-[10px] tracking-[0.35em] text-signal">OPÉRATION PORNIC · TERMINAL DE TERRAIN</p>
          <h1 className="holo-text text-2xl font-bold tracking-[0.18em]">ESCAPE PORNIC</h1>
          <p className="text-sm text-neon/70">Jouez ensemble, chaque équipe suit sa mission.</p>
        </header>

        {!isSupabaseConfigured && (
          <div className="border border-signal/60 bg-signal/10 p-3 text-sm text-signal">
            <p className="font-semibold tracking-wider">⚠ LIAISON ÉQUIPE INDISPONIBLE</p>
            <p className="mt-1 text-neon/80">Configurez Supabase pour créer ou rejoindre une partie. Vous pouvez aussi continuer en mode solo.</p>
          </div>
        )}

        {isSupabaseConfigured && (
          <>
            <div className="grid grid-cols-2 gap-2 border-y border-neon/20 py-3" role="group" aria-label="Choisir une option">
              {([
                ['new-team', 'NOUVELLE ÉQUIPE'],
                ['join-team', 'REJOINDRE'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={mode === id}
                  onClick={() => { setMode(id); setError(null); }}
                  className={`min-h-12 border px-2 py-2 text-[10px] font-bold leading-tight tracking-wider transition ${mode === id ? 'border-radar bg-radar/10 text-radar shadow-radar' : 'border-neon/30 bg-black/50 text-neon/60 active:bg-neon/10'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={(event) => void submit(event)} className="space-y-4">
              <p className="text-[10px] tracking-[0.25em] text-radar">
                {mode === 'new-team' ? '01 / FORMER UNE ÉQUIPE' : '02 / IDENTIFICATION'}
              </p>

              {mode !== 'join-team' && (
                <>
                  {mode === 'new-team' && (
                    <label className="block space-y-2 text-xs tracking-wider text-neon/80">
                      <span>CODE DE LA PARTIE</span>
                      <input className={`${fieldClass} uppercase tracking-[0.2em]`} autoComplete="off" maxLength={10} required value={gameCode} onChange={(event) => setGameCode(event.target.value)} />
                    </label>
                  )}
                  <label className="block space-y-2 text-xs tracking-wider text-neon/80">
                    <span>NOM DE VOTRE ÉQUIPE</span>
                    <input className={fieldClass} autoComplete="organization" maxLength={32} required value={teamName} onChange={(event) => setTeamName(event.target.value)} />
                  </label>
                  <fieldset className="space-y-2">
                    <legend className="text-xs tracking-wider text-neon/80">COULEUR D’IDENTIFICATION</legend>
                    <div className="flex flex-wrap gap-3">
                      {TEAM_COLORS.map(({ name, value }) => (
                        <button
                          key={value}
                          type="button"
                          aria-label={`Choisir ${name}`}
                          aria-pressed={teamColor === value}
                          onClick={() => setTeamColor(value)}
                          className={`h-11 w-11 rounded-full border-2 transition ${teamColor === value ? 'scale-110 border-white ring-2 ring-neon shadow-neon' : 'border-black shadow'}`}
                          style={{ backgroundColor: value }}
                        />
                      ))}
                    </div>
                  </fieldset>
                </>
              )}

              <label className="block space-y-2 text-xs tracking-wider text-neon/80">
                <span>VOTRE NOM DE JOUEUR</span>
                <input
                  className={fieldClass}
                  autoComplete="nickname"
                  maxLength={32}
                  required
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                />
              </label>

              {mode === 'join-team' && (
                <label className="block space-y-2 text-xs tracking-wider text-neon/80">
                  <span>CODE DE VOTRE ÉQUIPE</span>
                  <input className={`${fieldClass} uppercase tracking-[0.2em]`} autoComplete="off" maxLength={10} required value={teamCode} onChange={(event) => setTeamCode(event.target.value)} />
                </label>
              )}

              {error && <p role="alert" className="border border-alert/60 bg-alert/10 p-3 text-sm text-alert">⚠ {error}</p>}
              <button
                type="submit"
                disabled={!isSupabaseConfigured || pending}
                className="min-h-14 w-full border border-radar bg-radar/10 px-4 py-3 text-sm font-bold tracking-[0.16em] text-radar shadow-radar transition active:scale-[0.98] active:bg-radar/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? 'LIAISON EN COURS…' : mode === 'new-team' ? '▶ CRÉER MON ÉQUIPE' : '▶ REJOINDRE L’ÉQUIPE'}
              </button>
            </form>
          </>
        )}

        <button type="button" onClick={onPlaySolo} className="min-h-12 w-full border border-neon/30 px-4 py-3 text-xs font-semibold tracking-wider text-neon/70 transition hover:border-neon/60 hover:text-neon">
          CONTINUER EN MODE SOLO
        </button>
        <p className="text-center text-[9px] tracking-[0.2em] text-neon/35">CONNEXION SÉCURISÉE · TERMINAL PORNIC</p>
      </section>
    </main>
  );
}
