import { useEffect, useState } from 'react';
import { updateMyPlayerName, type GamePlayer, type GameSession, type GameTeam } from '../services/gameService';
import { getMyPlayerItems, type AdminPlayerItem } from '../services/adminService';

interface TeamInfoPanelProps {
  session: GameSession;
  teams: GameTeam[];
  players: GamePlayer[];
  loadingTeams: boolean;
  teamsError: string | null;
  connection: 'connecting' | 'connected' | 'disconnected';
  connectionError: string | null;
  onRetryConnection: () => void;
  sharePlayerLocation: boolean;
  onSharePlayerLocationChange: (enabled: boolean) => void;
  playerLocationError: string | null;
  gpsReady: boolean;
  now: number;
  onPlayerNameChange: (playerName: string) => void;
  onClose: () => void;
}

export default function TeamInfoPanel({
  session,
  teams,
  players,
  loadingTeams,
  teamsError,
  connection,
  connectionError,
  onRetryConnection,
  sharePlayerLocation,
  onSharePlayerLocationChange,
  playerLocationError,
  gpsReady,
  now,
  onPlayerNameChange,
  onClose,
}: TeamInfoPanelProps) {
  const [message, setMessage] = useState('');
  const [playerName, setPlayerName] = useState(session.playerName);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [items, setItems] = useState<AdminPlayerItem[]>([]);
  const [itemsError, setItemsError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refreshItems = async () => {
      try {
        const result = await getMyPlayerItems();
        if (active) setItems(result);
        if (active) setItemsError(null);
      } catch (cause) {
        if (active) setItemsError(cause instanceof Error ? cause.message : 'Impossible de charger vos bonus/malus.');
      }
    };
    void refreshItems();
    const timer = window.setInterval(() => void refreshItems(), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [session.playerId]);

  const copyCode = async (code: string, label: string) => {
    try {
      if (!navigator.clipboard) throw new Error('Presse-papiers indisponible sur cet appareil.');
      await navigator.clipboard.writeText(code);
      setMessage(`${label} copié.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Impossible de copier le code.');
    }
  };

  const savePlayerName = async () => {
    setSavingName(true);
    setNameError(null);
    try {
      const updatedName = await updateMyPlayerName(playerName);
      setPlayerName(updatedName);
      onPlayerNameChange(updatedName);
    } catch (cause) {
      setNameError(cause instanceof Error ? cause.message : 'Impossible de modifier le nom du joueur.');
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[1600] flex items-end justify-center bg-black/75 p-2 pb-[calc(76px+env(safe-area-inset-bottom))] backdrop-blur-sm" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-info-title"
        className="sheet-enter panel max-h-[82vh] w-full max-w-lg space-y-4 overflow-y-auto p-4 text-neon sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] tracking-[0.3em] text-signal">IDENTIFICATION D’ÉQUIPE</p>
            <h2 id="team-info-title" className="holo-text text-xl font-bold tracking-wider">{session.teamName}</h2>
            <p className="text-sm text-neon/60">{session.gameName}</p>
          </div>
          <span className="mt-1 h-7 w-7 shrink-0 rounded-full border-2 border-white shadow-neon" style={{ backgroundColor: session.teamColor }} aria-label="Couleur de l’équipe" />
        </header>

        <section className="space-y-2 border border-neon/20 bg-black/40 p-3">
          <label htmlFor="player-display-name" className="block text-xs font-semibold tracking-wider">IDENTITÉ DU JOUEUR</label>
          <div className="flex gap-2">
            <input
              id="player-display-name"
              className="field min-h-11 min-w-0 flex-1 border-neon/30 bg-black/70 px-3 text-sm text-neon"
              autoComplete="nickname"
              maxLength={32}
              required
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
            />
            <button type="button" className="btn-neon min-h-11 !px-3" disabled={savingName || playerName.trim() === session.playerName} onClick={() => void savePlayerName()}>
              {savingName ? '…' : 'MODIFIER'}
            </button>
          </div>
          {nameError && <p role="alert" className="text-[10px] text-alert">{nameError}</p>}
        </section>

        <section className="space-y-2 border border-neon/20 bg-black/40 p-3">
          <h3 className="text-xs font-semibold tracking-wider">MES BONUS & MALUS</h3>
          {itemsError && <p role="alert" className="text-[10px] text-alert">{itemsError}</p>}
          {!itemsError && items.length === 0 && <p className="text-[10px] text-neon/45">Aucun objet attribué.</p>}
          {items.map((item) => (
            <article key={item.id} className={`border p-2 ${item.kind === 'bonus' ? 'border-radar/40 bg-radar/5' : 'border-alert/40 bg-alert/5'}`}>
              <p className={`text-xs font-semibold ${item.kind === 'bonus' ? 'text-radar' : 'text-alert'}`}>
                {item.kind === 'bonus' ? 'BONUS' : 'MALUS'} · {item.name}
              </p>
              {item.description && <p className="mt-1 whitespace-pre-wrap text-[10px] text-neon/65">{item.description}</p>}
            </article>
          ))}
        </section>

        <div className="space-y-3 border border-neon/20 bg-black/60 p-3">
          <div>
            <p className="text-[10px] tracking-[0.2em] text-neon/70">CODE DE LA PARTIE</p>
            <p className="text-[10px] text-neon/40">À partager avec les autres équipes.</p>
            <div className="mt-2 flex items-center justify-between gap-2 border border-neon/20 bg-neon/5 p-2">
              <code className="text-xl font-bold tracking-[0.25em] text-radar">{session.gameCode}</code>
              <button type="button" className="btn-neon min-h-11 !px-3" onClick={() => void copyCode(session.gameCode, 'Code de partie')}>COPIER</button>
            </div>
          </div>
          <div className="border-t border-neon/20 pt-3">
            <p className="text-[10px] tracking-[0.2em] text-neon/70">CODE DE VOTRE ÉQUIPE</p>
            <p className="text-[10px] text-neon/40">À partager avec les membres de votre équipe.</p>
            <div className="mt-2 flex items-center justify-between gap-2 border border-neon/20 bg-neon/5 p-2">
              <code className="text-xl font-bold tracking-[0.25em] text-radar">{session.teamCode}</code>
              <button type="button" className="btn-neon min-h-11 !px-3" onClick={() => void copyCode(session.teamCode, 'Code d’équipe')}>COPIER</button>
            </div>
          </div>
        </div>

        <section aria-labelledby="game-teams-title" className="space-y-2 border border-neon/20 bg-black/40 p-3">
          <div className="flex items-center justify-between gap-2 border-b border-neon/20 pb-2">
            <h3 id="game-teams-title" className="text-xs font-semibold tracking-[0.15em]">ÉQUIPES DE LA PARTIE</h3>
            <span className={`text-[10px] tracking-wider ${connection === 'connected' ? 'text-radar' : connection === 'disconnected' ? 'text-alert' : 'text-signal'}`}>
              {connection === 'connected' ? '● EN DIRECT' : connection === 'disconnected' ? '● LIAISON À RÉTABLIR' : '● CONNEXION…'}
            </span>
          </div>
          {connectionError && (
            <div className="space-y-2 border border-signal/40 bg-signal/10 p-2 text-xs text-neon/80">
              <p role="status">{connectionError}</p>
              <p>Vérifiez la liaison Realtime du projet, puis réessayez.</p>
              <button
                type="button"
                className="btn-neon min-h-11 !border-signal !text-signal"
                onClick={onRetryConnection}
              >
                RÉESSAYER LA LIAISON
              </button>
            </div>
          )}
          {loadingTeams && <p role="status" className="text-xs text-neon/60">Recherche des équipes…</p>}
          {teamsError && <p role="alert" className="border border-alert/50 bg-alert/10 p-2 text-xs text-alert">{teamsError}</p>}
          {!loadingTeams && !teamsError && (
            <ul className="max-h-36 space-y-1 overflow-y-auto">
              {teams.map((team) => (
                <li key={team.id} className="border-b border-neon/10 px-1 py-2 text-sm">
                  <div className="flex min-h-7 items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full shadow-neon" style={{ backgroundColor: team.color }} />
                    <span className="min-w-0 flex-1 truncate text-neon/90">{team.name}</span>
                    <span className={`text-[9px] tracking-wider ${team.playersSharingLocation ? 'text-radar' : 'text-neon/40'}`}>
                      {team.playersSharingLocation} SUR CARTE
                    </span>
                    {team.id === session.teamId && <span className="text-[9px] tracking-wider text-radar">VOTRE ÉQUIPE</span>}
                  </div>
                  {team.playersSharingLocation > 0 && (
                    <p className="ml-5 mt-1 truncate text-[10px] text-neon/50">
                      {players
                        .filter((player) => player.teamId === team.id && now - player.location.updatedAt <= 90_000)
                        .map((player) => player.name)
                        .join(' · ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2 border border-neon/20 bg-black/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold tracking-wider">PARTAGER MA POSITION GPS</h3>
              <p className="mt-1 text-[10px] leading-relaxed text-neon/55">
                Les autres joueurs de la partie verront votre marqueur individuel, aux couleurs de votre équipe. Aucun historique n’est conservé.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={sharePlayerLocation}
              aria-label="Partager ma position GPS"
              onClick={() => onSharePlayerLocationChange(!sharePlayerLocation)}
              className={`relative h-8 w-14 shrink-0 border transition ${sharePlayerLocation ? 'border-radar bg-radar/20' : 'border-neon/40 bg-black'}`}
            >
              <span className={`absolute top-1 h-5 w-5 rounded-full transition-all ${sharePlayerLocation ? 'left-7 bg-radar shadow-radar' : 'left-1 bg-neon/60'}`} />
            </button>
          </div>
          <p className={`text-[10px] ${sharePlayerLocation ? gpsReady ? 'text-radar' : 'text-signal' : 'text-neon/45'}`}>
            {sharePlayerLocation
              ? gpsReady
                ? `Partage activé · ${session.playerName} est visible sur la carte`
                : 'En attente d’un signal GPS précis'
              : 'Partage désactivé · votre position reste privée'}
          </p>
          {playerLocationError && <p role="alert" className="border border-alert/50 bg-alert/10 p-2 text-[10px] text-alert">{playerLocationError}</p>}
          {sharePlayerLocation && !gpsReady && (
            <p className="text-[10px] text-neon/50">
              Démarrez le jeu et autorisez la localisation pour partager votre position.
            </p>
          )}
        </section>

        {message && <p role="status" className="text-xs text-radar">{message}</p>}
        <button type="button" className="btn-neon min-h-12 w-full !border-radar !text-radar" onClick={onClose}>CONTINUER</button>
      </section>
    </div>
  );
}
