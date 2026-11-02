import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { getAudioContext } from '../utils/feedback';
import { readJson, writeJson } from '../services/storage';

export interface AudioTrack {
  id: string;
  title: string;
  /** URL MP3 / OGG / AAC / flux distant, ou "synth" pour l'ambiance générée. */
  url: string;
  custom?: boolean;
}

const SYNTH_URL = 'synth';
const BUILTIN_TRACKS: AudioTrack[] = [{ id: 'synth-drone', title: 'DRONE TACTIQUE (synthétique)', url: SYNTH_URL }];
const TRACKS_KEY = 'nantes-ops:audio-tracks';
const VOLUME_KEY = 'nantes-ops:audio-volume';

interface AudioContextValue {
  tracks: AudioTrack[];
  current: AudioTrack;
  playing: boolean;
  volume: number;
  error: string | null;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  selectTrack: (id: string) => void;
  setVolume: (v: number) => void;
  addTrack: (title: string, url: string) => void;
  removeTrack: (id: string) => void;
}

const Ctx = createContext<AudioContextValue | null>(null);

export function useAudio(): AudioContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAudio doit être utilisé dans <AudioProvider>');
  return v;
}

/** Ambiance synthétique : drone grave + pulsation lente (aucun fichier requis). */
function startDrone(volume: number) {
  const ctx = getAudioContext();
  const master = ctx.createGain();
  master.gain.value = volume * 0.5;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  filter.connect(master).connect(ctx.destination);

  const oscillators = [55, 55.4, 82.4, 110.3].map((f, i) => {
    const o = ctx.createOscillator();
    o.type = i % 2 ? 'triangle' : 'sawtooth';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = i < 2 ? 0.35 : 0.15;
    o.connect(g).connect(filter);
    o.start();
    return o;
  });

  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.12;
  lfoGain.gain.value = 220;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();

  return {
    setVolume: (v: number) => (master.gain.value = v * 0.5),
    stop: () => {
      [...oscillators, lfo].forEach((o) => {
        try {
          o.stop();
        } catch {
          /* déjà arrêté */
        }
      });
      master.disconnect();
    },
  };
}

/**
 * Fournisseur audio persistant : monté une seule fois à la racine de l'app,
 * la lecture continue donc lors des changements d'écran.
 */
export function AudioProvider({ children }: { children: ReactNode }) {
  const [customTracks, setCustomTracks] = useState<AudioTrack[]>(() => readJson<AudioTrack[]>(TRACKS_KEY, []));
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(() => readJson<number>(VOLUME_KEY, 0.6));
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const droneRef = useRef<ReturnType<typeof startDrone> | null>(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const tracks = useMemo(() => [...BUILTIN_TRACKS, ...customTracks], [customTracks]);
  const current = tracks[Math.min(index, tracks.length - 1)];

  const stopDrone = () => {
    droneRef.current?.stop();
    droneRef.current = null;
  };

  // Lecture / pause / changement de piste
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    setError(null);
    if (!playing) {
      el.pause();
      stopDrone();
      return;
    }
    if (current.url === SYNTH_URL) {
      el.pause();
      stopDrone();
      droneRef.current = startDrone(volumeRef.current);
    } else {
      stopDrone();
      if (el.getAttribute('src') !== current.url) el.src = current.url;
      el.volume = volumeRef.current;
      el.play().catch(() => {
        setError('Lecture impossible (format ou URL non supporté)');
        setPlaying(false);
      });
    }
    return stopDrone;
  }, [playing, current.url]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    droneRef.current?.setVolume(volume);
    writeJson(VOLUME_KEY, volume);
  }, [volume]);

  const play = useCallback(() => setPlaying(true), []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => setPlaying((p) => !p), []);
  const next = useCallback(() => setIndex((i) => (i + 1) % tracks.length), [tracks.length]);
  const previous = useCallback(() => setIndex((i) => (i - 1 + tracks.length) % tracks.length), [tracks.length]);
  const selectTrack = useCallback(
    (id: string) => {
      const i = tracks.findIndex((t) => t.id === id);
      if (i >= 0) setIndex(i);
    },
    [tracks],
  );
  const setVolume = useCallback((v: number) => setVolumeState(Math.min(1, Math.max(0, v))), []);

  const addTrack = useCallback((title: string, url: string) => {
    const track: AudioTrack = { id: `track-${Date.now()}`, title: title.trim() || url, url: url.trim(), custom: true };
    setCustomTracks((list) => {
      const updated = [...list, track];
      writeJson(TRACKS_KEY, updated);
      return updated;
    });
  }, []);

  const removeTrack = useCallback((id: string) => {
    setCustomTracks((list) => {
      const updated = list.filter((t) => t.id !== id);
      writeJson(TRACKS_KEY, updated);
      return updated;
    });
    setIndex(0);
  }, []);

  const value: AudioContextValue = {
    tracks, current, playing, volume, error,
    play, pause, toggle, next, previous, selectTrack, setVolume, addTrack, removeTrack,
  };

  return (
    <Ctx.Provider value={value}>
      <audio ref={audioRef} loop={tracks.length === 1} onEnded={next} onError={() => current.url !== SYNTH_URL && setError('Erreur de chargement de la piste')} preload="none" />
      {children}
    </Ctx.Provider>
  );
}

/** Panneau de contrôle audio : lecture, pause, volume, pistes. */
export function AudioPanel() {
  const a = useAudio();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    a.addTrack(title, url);
    setTitle('');
    setUrl('');
  };

  return (
    <div className="space-y-3 text-xs">
      <div className="border border-neon/40 p-2">
        <div className="text-radar">♪ {a.current.title}</div>
        <div className="mt-2 flex items-center gap-2">
          <button className="btn-neon" onClick={a.previous} aria-label="Piste précédente">⏮</button>
          <button className="btn-neon flex-1" onClick={a.toggle}>{a.playing ? '❚❚ PAUSE' : '▶ LECTURE'}</button>
          <button className="btn-neon" onClick={a.next} aria-label="Piste suivante">⏭</button>
        </div>
        <label className="mt-3 flex items-center gap-2">
          <span>VOL</span>
          <input
            type="range" min={0} max={1} step={0.01} value={a.volume}
            onChange={(e) => a.setVolume(Number(e.target.value))}
            className="h-1 flex-1 accent-cyan-300"
          />
          <span className="w-8 text-right">{Math.round(a.volume * 100)}</span>
        </label>
        {a.error && <div className="mt-2 text-alert">⚠ {a.error}</div>}
      </div>

      <ul className="space-y-1">
        {a.tracks.map((t) => (
          <li key={t.id} className={`flex items-center gap-2 border px-2 py-1 ${t.id === a.current.id ? 'border-radar text-radar' : 'border-neon/20'}`}>
            <button className="flex-1 truncate text-left" onClick={() => a.selectTrack(t.id)}>{t.title}</button>
            {t.custom && <button className="text-alert" onClick={() => a.removeTrack(t.id)} aria-label="Supprimer">✕</button>}
          </li>
        ))}
      </ul>

      <form onSubmit={submit} className="space-y-1 border border-neon/20 p-2">
        <div className="text-neon/70">AJOUTER UNE PISTE (MP3 / OGG / AAC / flux)</div>
        <input className="field" placeholder="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="field" placeholder="https://…/ambiance.mp3" value={url} onChange={(e) => setUrl(e.target.value)} type="url" />
        <button className="btn-neon w-full" type="submit">+ AJOUTER</button>
      </form>
    </div>
  );
}
