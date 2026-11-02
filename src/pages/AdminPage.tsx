import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { PointOfInterest } from '../types/PointOfInterest';
import { DEFAULT_ACTIVATION_RADIUS } from '../types/PointOfInterest';
import { exportPoisJson, importPoisJson, poiService } from '../services/poiService';
import { DEMO_IMAGE, newId } from '../utils/poiParser';
import { asset } from '../utils/asset';
import MapScreen from './MapScreen';
import { isSupabaseConfigured } from '../services/supabase';
import {
  checkAdminSession,
  createAdminGame,
  deactivatePlayerItem,
  getAdminGameRoster,
  getAdminGamePois,
  grantPlayerItem,
  listAdminGames,
  listGameMessages,
  saveGamePois,
  sendGameMessage,
  signInAdmin,
  signOutAdmin,
  type AdminGame,
  type AdminMessage,
  type AdminPlayer,
  type AdminTeam,
} from '../services/adminService';

interface AdminPageProps {
  pois: PointOfInterest[];
  onChange: (pois: PointOfInterest[]) => void;
  onAdminSessionChange: (isAdmin: boolean) => void;
  onExit: () => void;
}

interface FormState {
  id: string | null;
  name: string;
  latitude: string;
  longitude: string;
  riddle: string;
  icon: string;
  audio: string;
  activationRadius: string;
}

const emptyForm = (): FormState => ({
  id: null,
  name: '',
  latitude: '',
  longitude: '',
  riddle: '',
  icon: DEMO_IMAGE,
  audio: '',
  activationRadius: String(DEFAULT_ACTIVATION_RADIUS),
});

export default function AdminPage({ pois, onChange, onAdminSessionChange, onExit }: AdminPageProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [loadingAdmin, setLoadingAdmin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [games, setGames] = useState<AdminGame[]>([]);
  const [selectedGameId, setSelectedGameId] = useState('');
  const [newGameName, setNewGameName] = useState('');
  const [teams, setTeams] = useState<AdminTeam[]>([]);
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [adminMessages, setAdminMessages] = useState<AdminMessage[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [itemKind, setItemKind] = useState<'bonus' | 'malus'>('bonus');
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [messageAudience, setMessageAudience] = useState('');
  const [messageTitle, setMessageTitle] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void checkAdminSession()
      .then((allowed) => {
        if (active) {
          setUnlocked(allowed);
          onAdminSessionChange(allowed);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          onAdminSessionChange(false);
          setAuthError(cause instanceof Error ? cause.message : 'Vérification de la session impossible.');
        }
      })
      .finally(() => {
        if (active) setLoadingAdmin(false);
      });
    return () => {
      active = false;
    };
  }, [onAdminSessionChange]);

  useEffect(() => {
    if (!unlocked) return;
    let active = true;
    void listAdminGames()
      .then((result) => {
        if (!active) return;
        setGames(result);
        setSelectedGameId((current) => current || result[0]?.id || '');
      })
      .catch((cause: unknown) => {
        if (active) setMessage({ ok: false, text: cause instanceof Error ? cause.message : 'Chargement des parties impossible.' });
      });
    return () => {
      active = false;
    };
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked || !selectedGameId) {
      setTeams([]);
      setPlayers([]);
      setAdminMessages([]);
      return;
    }
    let active = true;
    let loading = false;
    const refresh = async () => {
      if (loading) return;
      loading = true;
      try {
        const [roster, communications, allGames] = await Promise.all([
          getAdminGameRoster(selectedGameId),
          listGameMessages(selectedGameId),
          listAdminGames(),
        ]);
        if (!active) return;
        setTeams(roster.teams);
        setPlayers(roster.players);
        setAdminMessages(communications);
        setGames(allGames);
        setSelectedPlayerId((current) => roster.players.some((player) => player.id === current) ? current : roster.players[0]?.id ?? '');
      } catch (cause) {
        if (active) setMessage({ ok: false, text: cause instanceof Error ? cause.message : 'Chargement de la partie impossible.' });
      } finally {
        loading = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [unlocked, selectedGameId]);

  useEffect(() => {
    if (!unlocked || !selectedGameId) return;
    let active = true;
    void getAdminGamePois(selectedGameId)
      .then((gamePois) => {
        if (active) {
          onChange(gamePois);
          setForm(emptyForm());
        }
      })
      .catch((cause: unknown) => {
        if (active) setMessage({ ok: false, text: cause instanceof Error ? cause.message : 'Chargement du parcours impossible.' });
      });
    return () => {
      active = false;
    };
  }, [onChange, selectedGameId, unlocked]);

  useEffect(() => {
    setMessageAudience('');
  }, [selectedGameId]);

  const login = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setAuthError(null);
    try {
      await signInAdmin(email, password);
      setUnlocked(true);
      onAdminSessionChange(true);
      setPassword('');
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : 'Authentification impossible.');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    try {
      await signOutAdmin();
      setUnlocked(false);
      onAdminSessionChange(false);
      onExit();
    } catch (cause) {
      setMessage({ ok: false, text: cause instanceof Error ? cause.message : 'Déconnexion impossible.' });
    }
  };

  if (loadingAdmin) {
    return <div className="flex h-full items-center justify-center bg-void text-sm tracking-widest text-radar">VÉRIFICATION DES DROITS ADMIN…</div>;
  }

  if (!unlocked) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-void p-6">
        <div className="holo-text text-xl tracking-[0.3em]">CONSOLE ADMIN</div>
        <form onSubmit={(event) => void login(event)} className="panel w-full max-w-xs space-y-3 p-4">
          <input
            className="field"
            type="email"
            autoComplete="username"
            required
            placeholder="Adresse e-mail admin"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            required
            placeholder="Mot de passe"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {authError && <div role="alert" className="text-xs text-alert">⚠ {authError}</div>}
          {!isSupabaseConfigured && <div role="alert" className="text-xs text-alert">Supabase doit être configuré pour ouvrir la console.</div>}
          <button className="btn-neon w-full" type="submit" disabled={busy || !isSupabaseConfigured}>{busy ? 'VÉRIFICATION…' : 'AUTHENTIFIER'}</button>
          <button className="btn-neon w-full !border-signal !text-signal" type="button" onClick={onExit}>RETOUR</button>
        </form>
      </div>
    );
  }

  const set = <K extends keyof FormState>(key: K, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const flash = (ok: boolean, text: string) => setMessage({ ok, text });

  const persistPois = async (nextPois: PointOfInterest[]) => {
    await poiService.replaceAll(nextPois);
    onChange(nextPois);
    if (selectedGameId) await saveGamePois(selectedGameId, nextPois);
  };

  const createGame = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await createAdminGame(newGameName, pois);
      setGames((current) => [created, ...current]);
      setSelectedGameId(created.id);
      setNewGameName('');
      flash(true, `Partie créée · code à communiquer : ${created.code}`);
      void listAdminGames()
        .then(setGames)
        .catch((cause: unknown) =>
          setMessage({ ok: false, text: cause instanceof Error ? cause.message : 'Actualisation des parties impossible.' }),
        );
    } catch (cause) {
      flash(false, cause instanceof Error ? cause.message : 'Création de la partie impossible.');
    } finally {
      setBusy(false);
    }
  };

  const refreshRoster = async () => {
    if (!selectedGameId) return;
    try {
      const roster = await getAdminGameRoster(selectedGameId);
      setTeams(roster.teams);
      setPlayers(roster.players);
    } catch (cause) {
      flash(false, cause instanceof Error ? cause.message : 'Actualisation des joueurs impossible.');
      throw cause;
    }
  };

  const addPlayerItem = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPlayerId) return flash(false, 'Choisissez un joueur.');
    setBusy(true);
    try {
      await grantPlayerItem(selectedPlayerId, itemKind, itemName, itemDescription);
      await refreshRoster();
      setItemName('');
      setItemDescription('');
      flash(true, `${itemKind === 'bonus' ? 'Bonus' : 'Malus'} attribué.`);
    } catch (cause) {
      flash(false, cause instanceof Error ? cause.message : 'Attribution impossible.');
    } finally {
      setBusy(false);
    }
  };

  const removePlayerItem = async (itemId: string) => {
    try {
      await deactivatePlayerItem(itemId);
      await refreshRoster();
      flash(true, 'Objet retiré de l’inventaire actif.');
    } catch (cause) {
      flash(false, cause instanceof Error ? cause.message : 'Retrait impossible.');
    }
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedGameId) return flash(false, 'Créez ou sélectionnez une partie.');
    setBusy(true);
    try {
      await sendGameMessage(selectedGameId, messageAudience || null, messageTitle, messageBody);
      setAdminMessages(await listGameMessages(selectedGameId));
      setMessageTitle('');
      setMessageBody('');
      flash(true, 'Communication enregistrée et envoyée.');
    } catch (cause) {
      flash(false, cause instanceof Error ? cause.message : 'Envoi de la communication impossible.');
    } finally {
      setBusy(false);
    }
  };

  const selectedGame = games.find((game) => game.id === selectedGameId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    const radius = Number(form.activationRadius);
    if (!form.name.trim()) return flash(false, 'Nom obligatoire');
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) return flash(false, 'Latitude invalide');
    if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) return flash(false, 'Longitude invalide');
    if (!Number.isFinite(radius) || radius <= 0) return flash(false, "Rayon d'activation invalide");
    const poi: PointOfInterest = {
      id: form.id ?? newId(),
      name: form.name.trim(),
      latitude,
      longitude,
      riddle: form.riddle.trim(),
      icon: form.icon.trim() || DEMO_IMAGE,
      ...(form.audio.trim() ? { audio: form.audio.trim() } : {}),
      activationRadius: radius,
    };
    try {
      const updatedPois = form.id
        ? pois.map((existing) => existing.id === form.id ? poi : existing)
        : [...pois, poi];
      await persistPois(updatedPois);
      flash(true, form.id ? 'POI modifié' : 'POI ajouté');
      setForm(emptyForm());
    } catch (cause) {
      flash(false, cause instanceof Error ? cause.message : 'Enregistrement du POI impossible.');
    }
  };

  const edit = (p: PointOfInterest) =>
    setForm({
      id: p.id,
      name: p.name,
      latitude: String(p.latitude),
      longitude: String(p.longitude),
      riddle: p.riddle,
      icon: p.icon,
      audio: p.audio ?? '',
      activationRadius: String(p.activationRadius),
    });

  const remove = async (p: PointOfInterest) => {
    if (!window.confirm(`Supprimer « ${p.name} » ?`)) return;
    try {
      await persistPois(pois.filter((item) => item.id !== p.id));
      if (form.id === p.id) setForm(emptyForm());
      flash(true, 'POI supprimé');
    } catch (cause) {
      flash(false, cause instanceof Error ? cause.message : 'Suppression du POI impossible.');
    }
  };

  const exportJson = () => {
    const blob = new Blob([exportPoisJson(pois)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pois.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      const list = importPoisJson(await file.text());
      await persistPois(list);
      flash(true, `${list.length} POI importés`);
    } catch (cause) {
      flash(false, `Import impossible : ${cause instanceof Error ? cause.message : 'erreur inconnue'}`);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  // Aperçu : le POI en cours d'édition est affiché à sa position saisie
  const previewPois: PointOfInterest[] = (() => {
    const lat = Number(form.latitude);
    const lon = Number(form.longitude);
    if (!form.latitude || !form.longitude || !Number.isFinite(lat) || !Number.isFinite(lon)) return pois;
    const draft: PointOfInterest = {
      id: form.id ?? '__draft__',
      name: form.name || 'Nouveau POI',
      latitude: lat,
      longitude: lon,
      riddle: form.riddle,
      icon: form.icon || DEMO_IMAGE,
      audio: form.audio.trim() || undefined,
      activationRadius: Number(form.activationRadius) || DEFAULT_ACTIVATION_RADIUS,
    };
    return [...pois.filter((p) => p.id !== draft.id), draft];
  })();

  return (
    <div className="h-full overflow-y-auto bg-void pb-8 pt-[env(safe-area-inset-top)]">
      <header className="sticky top-0 z-[1500] flex items-center justify-between border-b border-neon/40 bg-black/95 px-3 py-2">
        <span className="holo-text tracking-[0.25em]">ADMINISTRATION</span>
        <div className="flex gap-2">
          <button className="btn-neon !px-2 !py-1 text-xs" onClick={onExit}>← JEU</button>
          <button className="btn-neon !border-alert !px-2 !py-1 text-xs !text-alert" onClick={() => void logout()}>DÉCONNEXION</button>
        </div>
      </header>

      <div className="space-y-4 p-3 text-xs">
        {message && (
          <p role={message.ok ? 'status' : 'alert'} className={`border p-2 ${message.ok ? 'border-radar/40 text-radar' : 'border-alert/50 text-alert'}`}>
            {message.ok ? '✔' : '⚠'} {message.text}
          </p>
        )}
        <section className="panel space-y-3 p-3">
          <h2 className="tracking-widest text-radar">PARTIES · GESTION ADMIN</h2>
          <form onSubmit={(event) => void createGame(event)} className="flex flex-col gap-2 sm:flex-row">
            <input className="field min-w-0 flex-1" maxLength={40} required placeholder="Nom de la nouvelle partie" value={newGameName} onChange={(event) => setNewGameName(event.target.value)} />
            <button type="submit" className="btn-neon" disabled={busy}>{busy ? 'CRÉATION…' : 'CRÉER · COPIER LES POI ACTUELS'}</button>
          </form>
          {games.length > 0 ? (
            <label className="block space-y-1">
              <span>PARTIE SÉLECTIONNÉE</span>
              <select className="field" value={selectedGameId} onChange={(event) => setSelectedGameId(event.target.value)}>
                {games.map((game) => <option key={game.id} value={game.id}>{game.name} · {game.code}</option>)}
              </select>
            </label>
          ) : <p className="text-neon/50">Aucune partie. Créez une opération pour commencer.</p>}
          {selectedGame && (
            <p className="text-neon/60">
              Code de partie : <code className="font-bold tracking-widest text-radar">{selectedGame.code}</code>
              {' · '}{selectedGame.teamCount} équipes · {selectedGame.playerCount} joueurs
            </p>
          )}
        </section>

        {selectedGame && (
          <>
            <section className="panel space-y-3 p-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="tracking-widest text-radar">ÉQUIPES & JOUEURS</h2>
                <button
                  className="btn-neon !px-2 !py-1"
                  onClick={() => void refreshRoster().catch(() => undefined)}
                >
                  ACTUALISER
                </button>
              </div>
              <ul className="flex flex-wrap gap-2">
                {teams.map((team) => (
                  <li key={team.id} className="flex items-center gap-1 border border-neon/20 px-2 py-1">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: team.color }} />
                    <span>{team.name}</span>
                    <span className="text-neon/45">({team.playerCount})</span>
                  </li>
                ))}
              </ul>
              {players.length === 0 && <p className="text-neon/50">Aucun joueur n’a encore rejoint cette partie.</p>}
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {players.map((player) => (
                  <li key={player.id} className="border border-neon/20 p-2">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: player.teamColor }} />
                      <span className="flex-1 font-semibold">{player.name}</span>
                      <span className="text-neon/50">{player.teamName}</span>
                      <span className={player.sharingLocation ? 'text-radar' : 'text-neon/35'}>{player.sharingLocation ? 'GPS EN DIRECT' : 'GPS MASQUÉ'}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {player.items.map((item) => (
                        <span key={item.id} className={`inline-flex items-center gap-1 border px-1.5 py-0.5 ${item.kind === 'bonus' ? 'border-radar/40 text-radar' : 'border-alert/40 text-alert'} ${item.active ? '' : 'opacity-40 line-through'}`}>
                          {item.kind.toUpperCase()} · {item.name}
                          {item.active && <button type="button" aria-label={`Retirer ${item.name}`} onClick={() => void removePlayerItem(item.id)}>×</button>}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              <form onSubmit={(event) => void addPlayerItem(event)} className="space-y-2 border-t border-neon/20 pt-3">
                <h3 className="font-semibold tracking-wider">ATTRIBUER UN OBJET</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <select className="field" required value={selectedPlayerId} onChange={(event) => setSelectedPlayerId(event.target.value)}>
                    <option value="">Choisir un joueur</option>
                    {players.map((player) => <option key={player.id} value={player.id}>{player.name} · {player.teamName}</option>)}
                  </select>
                  <select className="field" value={itemKind} onChange={(event) => setItemKind(event.target.value as 'bonus' | 'malus')}>
                    <option value="bonus">Bonus</option>
                    <option value="malus">Malus</option>
                  </select>
                </div>
                <input className="field" maxLength={60} required placeholder="Nom de l’objet / capacité" value={itemName} onChange={(event) => setItemName(event.target.value)} />
                <textarea className="field" rows={2} maxLength={500} placeholder="Description ou consigne" value={itemDescription} onChange={(event) => setItemDescription(event.target.value)} />
                <button className="btn-neon" type="submit" disabled={busy || players.length === 0}>ATTRIBUER</button>
              </form>
            </section>

            <section className="panel space-y-3 p-3">
              <h2 className="tracking-widest text-radar">COMMUNICATIONS</h2>
              <form onSubmit={(event) => void sendMessage(event)} className="space-y-2">
                <select className="field" value={messageAudience} onChange={(event) => setMessageAudience(event.target.value)}>
                  <option value="">Tous les membres de la partie</option>
                  {teams.map((team) => <option key={team.id} value={team.id}>Équipe · {team.name}</option>)}
                </select>
                <input className="field" maxLength={80} required placeholder="Titre" value={messageTitle} onChange={(event) => setMessageTitle(event.target.value)} />
                <textarea className="field" rows={3} maxLength={2000} required placeholder="Message (les joueurs devront l’acquitter)" value={messageBody} onChange={(event) => setMessageBody(event.target.value)} />
                <button className="btn-neon" type="submit" disabled={busy}>ENVOYER LA COMMUNICATION</button>
              </form>
              <ul className="max-h-48 space-y-2 overflow-y-auto border-t border-neon/20 pt-2">
                {adminMessages.map((entry) => (
                  <li key={entry.id} className="border border-neon/15 p-2">
                    <p className="font-semibold">{entry.title} <span className="font-normal text-neon/50">· {entry.teamName ?? 'Tous les membres'}</span></p>
                    <p className="whitespace-pre-wrap text-neon/65">{entry.body}</p>
                    <p className="mt-1 text-[10px] text-radar">{entry.acknowledgedCount} acquittement(s)</p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        <section className="panel space-y-2 p-3">
          <h2 className="tracking-widest text-radar">PARCOURS DE LA PARTIE</h2>
          <p className="text-neon/55">{selectedGame ? `Les modifications suivantes seront enregistrées dans « ${selectedGame.name} ».` : 'Les POI courants serviront de modèle à la prochaine partie créée.'}</p>
        </section>

        <div className="relative h-64 border border-neon/40">
          <MapScreen
            position={null}
            pois={previewPois}
            highlightId={form.id ?? '__draft__'}
            showPoiRadius
            fitToPois
            onSelectPoi={(p) => p.id !== '__draft__' && edit(p)}
            onMapClick={(lat, lon) => setForm((f) => ({ ...f, latitude: lat.toFixed(6), longitude: lon.toFixed(6) }))}
          />
          <div className="pointer-events-none absolute bottom-1 left-1 z-[800] bg-black/70 px-1 text-[10px] text-radar">
            Touchez la carte pour positionner le POI
          </div>
        </div>

        <form onSubmit={submit} className="panel space-y-2 p-3">
          <div className="tracking-widest text-radar">{form.id ? 'MODIFIER LE POI' : 'AJOUTER UN POI'}</div>
          <input className="field" placeholder="Nom" value={form.name} onChange={(e) => set('name', e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className="field" inputMode="decimal" placeholder="Latitude" value={form.latitude} onChange={(e) => set('latitude', e.target.value)} />
            <input className="field" inputMode="decimal" placeholder="Longitude" value={form.longitude} onChange={(e) => set('longitude', e.target.value)} />
          </div>
          <textarea className="field" rows={3} placeholder="Énigme" value={form.riddle} onChange={(e) => set('riddle', e.target.value)} />
          <input className="field" placeholder="Image (URL ou /icons/…)" value={form.icon} onChange={(e) => set('icon', e.target.value)} />
          <input className="field" placeholder="Son (ex. /audio/chateau.mp3, optionnel)" value={form.audio} onChange={(e) => set('audio', e.target.value)} />
          <label className="flex items-center gap-2">
            <span className="whitespace-nowrap">RAYON (m)</span>
            <input className="field" inputMode="numeric" value={form.activationRadius} onChange={(e) => set('activationRadius', e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button className="btn-neon flex-1" type="submit">{form.id ? 'ENREGISTRER' : '+ AJOUTER'}</button>
            {form.id && <button className="btn-neon !border-signal !text-signal" type="button" onClick={() => setForm(emptyForm())}>ANNULER</button>}
          </div>
        </form>

        <div className="flex gap-2">
          <button className="btn-neon flex-1" onClick={exportJson}>⭳ EXPORT JSON</button>
          <button className="btn-neon flex-1" onClick={() => fileRef.current?.click()}>⭱ IMPORT JSON</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void importJson(e.target.files?.[0])} />
        </div>

        <ul className="space-y-1">
          {pois.map((p) => (
            <li key={p.id} className="flex items-center gap-2 border border-neon/30 p-2">
              <img src={asset(p.icon)} alt="" className="h-8 w-8 object-contain" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-neon">{p.name}</div>
                <div className="text-neon/60">{p.latitude.toFixed(5)}, {p.longitude.toFixed(5)} · {p.activationRadius} m</div>
              </div>
              <button className="btn-neon !px-2 !py-1" onClick={() => edit(p)}>✎</button>
              <button className="btn-neon !border-alert !px-2 !py-1 !text-alert" onClick={() => void remove(p)}>🗑</button>
            </li>
          ))}
        </ul>

        <button
          className="btn-neon w-full !border-signal !text-signal"
          onClick={async () => {
            if (window.confirm('Restaurer les 10 POI de démonstration ?')) {
              try {
                await persistPois(await poiService.reset());
                flash(true, 'POI de démonstration restaurés');
              } catch (cause) {
                flash(false, cause instanceof Error ? cause.message : 'Restauration impossible.');
              }
            }
          }}
        >
          RESTAURER LES POI DE DÉMO
        </button>
      </div>
    </div>
  );
}
