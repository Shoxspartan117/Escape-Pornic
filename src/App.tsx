import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeoPosition, PointOfInterest } from './types/PointOfInterest';
import { poiService } from './services/poiService';
import { calculateDistance } from './utils/calculateDistance';
import { useGeolocation } from './hooks/useGeolocation';
import { useCompass } from './hooks/useCompass';
import { useBattery } from './hooks/useBattery';
import { usePoiTracking } from './hooks/usePoiTracking';
import { requestNotificationPermission, unlockAudio } from './utils/feedback';
import { AudioPanel, AudioProvider, useAudio } from './components/AudioManager';
import HudOverlay from './components/HudOverlay';
import RadarPanel from './components/RadarPanel';
import PoiPopup from './components/PoiPopup';
import SignalBanner from './components/SignalBanner';
import JournalPanel from './components/JournalPanel';
import ArView from './components/ArView';
import BootScreen from './components/BootScreen';
import Sheet from './components/Sheet';
import NavBar, { type PanelId } from './components/NavBar';
import MapScreen from './pages/MapScreen';
import AdminPage from './pages/AdminPage';
import TeamSetup from './components/TeamSetup';
import TeamInfoPanel from './components/TeamInfoPanel';
import { clearMyPlayerPosition, setMyPlayerPosition, type GameSession } from './services/gameService';
import { useGameTeams } from './hooks/useGameTeams';
import { getGamePois } from './services/adminService';
import { useGameMessages } from './hooks/useGameMessages';
import GameMessageOverlay from './components/GameMessageOverlay';

const PLAYER_LOCATION_MIN_INTERVAL_MS = 15_000;
const PLAYER_LOCATION_MIN_DISTANCE_M = 20;
const PLAYER_LOCATION_MAX_ACCURACY_M = 100;
const PLAYER_LOCATION_MAX_AGE_MS = 30_000;

function Game() {
  const audio = useAudio();
  const [booted, setBooted] = useState(false);
  const [page, setPage] = useState<'game' | 'admin'>(() =>
    window.location.pathname.replace(/\/+$/, '').endsWith('/admin') ? 'admin' : 'game',
  );
  const [adminSession, setAdminSession] = useState(false);
  const [mode, setMode] = useState<'setup' | 'team' | 'solo'>('setup');
  const [teamSession, setTeamSession] = useState<GameSession | null>(null);
  const [teamPanelOpen, setTeamPanelOpen] = useState(false);
  const [sharePlayerLocation, setSharePlayerLocation] = useState(false);
  const [playerLocationError, setPlayerLocationError] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [follow, setFollow] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pois, setPois] = useState<PointOfInterest[]>([]);
  const [gamePoisError, setGamePoisError] = useState<string | null>(null);
  const [simulated, setSimulated] = useState<GeoPosition | null>(null);

  const geo = useGeolocation(booted);
  const compass = useCompass();
  const battery = useBattery();

  const position = simulated ?? geo.position;
  const tracking = usePoiTracking(position, pois);
  const roster = useGameTeams(mode === 'team' ? teamSession : null);
  const gameMessages = useGameMessages(mode === 'team' ? teamSession?.gameId ?? null : null);
  const lastSharedPosition = useRef<{ latitude: number; longitude: number; sentAt: number } | null>(null);
  const sharingLocationRef = useRef(false);

  const handleTeamReady = useCallback((session: GameSession) => {
    setPois([]);
    setGamePoisError(null);
    setTeamSession(session);
    setMode('team');
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setPage(window.location.pathname.replace(/\/+$/, '').endsWith('/admin') ? 'admin' : 'game');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    let active = true;
    if (teamSession) {
      setPois([]);
      setGamePoisError(null);
    }
    const loadPois = async () => {
      try {
        const nextPois = teamSession
          ? await getGamePois(teamSession.gameId)
          : await poiService.getAll();
        if (active) {
          setPois(nextPois);
          setGamePoisError(null);
        }
      } catch (cause) {
        if (active) setGamePoisError(cause instanceof Error ? cause.message : 'Impossible de charger le parcours de la partie.');
      }
    };
    void loadPois();
    return () => {
      active = false;
    };
  }, [teamSession]);

  useEffect(() => {
    sharingLocationRef.current = sharePlayerLocation;
    if (!teamSession || !sharePlayerLocation) {
      const hadSharedPosition = lastSharedPosition.current !== null;
      lastSharedPosition.current = null;
      if (hadSharedPosition) {
        void clearMyPlayerPosition()
          .then(() => setPlayerLocationError(null))
          .catch((cause: unknown) =>
            setPlayerLocationError(cause instanceof Error ? cause.message : 'Impossible d’effacer la position partagée.'),
          );
      }
      return;
    }

    if (
      !position ||
      position.simulated ||
      position.accuracy > PLAYER_LOCATION_MAX_ACCURACY_M ||
      Date.now() - position.timestamp > PLAYER_LOCATION_MAX_AGE_MS ||
      document.visibilityState === 'hidden'
    ) {
      return;
    }

    const last = lastSharedPosition.current;
    const now = Date.now();
    const moved = last
      ? calculateDistance(last.latitude, last.longitude, position.latitude, position.longitude)
      : Number.POSITIVE_INFINITY;
    if (last && now - last.sentAt < PLAYER_LOCATION_MIN_INTERVAL_MS && moved < PLAYER_LOCATION_MIN_DISTANCE_M) return;

    lastSharedPosition.current = {
      latitude: position.latitude,
      longitude: position.longitude,
      sentAt: now,
    };
    void setMyPlayerPosition(position.latitude, position.longitude)
      .then(() => setPlayerLocationError(null))
      .catch((cause: unknown) => {
        lastSharedPosition.current = null;
        setPlayerLocationError(cause instanceof Error ? cause.message : 'Impossible de partager la position.');
      });
  }, [position, sharePlayerLocation, teamSession]);

  useEffect(
    () => () => {
      if (sharingLocationRef.current && lastSharedPosition.current) {
        void clearMyPlayerPosition();
      }
    },
    [],
  );

  const start = useCallback(async () => {
    unlockAudio();
    setBooted(true);
    audio.play();
    void requestNotificationPermission();
    void compass.request();
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      /* plein écran refusé (iOS Safari) : mode PWA standalone à la place */
    }
  }, [audio, compass]);

  const simulate = useCallback((poi: PointOfInterest | null) => {
    if (!poi) return setSimulated(null);
    // ~15 m au sud du POI pour déclencher l'entrée de zone
    setSimulated({
      latitude: poi.latitude - 0.000135,
      longitude: poi.longitude,
      accuracy: 5,
      speed: null,
      heading: null,
      timestamp: Date.now(),
      simulated: true,
    });
    setFollow(true);
    setPanel(null);
  }, []);

  const selected = useMemo(() => pois.find((p) => p.id === selectedId) ?? null, [pois, selectedId]);
  const discoveredCount = useMemo(() => {
    const ids = new Set(pois.map((p) => p.id));
    return tracking.discovered.filter((d) => ids.has(d.poiId)).length;
  }, [pois, tracking.discovered]);

  const selectPoi = useCallback((poi: PointOfInterest) => {
    setSelectedId(poi.id);
    setPanel((p) => (p === 'ar' ? p : null));
  }, []);

  if (page === 'admin') {
    return (
      <AdminPage
        pois={pois}
        onChange={setPois}
        onAdminSessionChange={setAdminSession}
        onExit={() => {
          const basePath = window.location.pathname.replace(/\/admin\/?$/, '') || '/';
          window.history.pushState({}, '', basePath);
          setPage('game');
        }}
      />
    );
  }

  if (mode === 'setup') {
    return <TeamSetup onReady={handleTeamReady} onPlaySolo={() => setMode('solo')} />;
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-void">
      <div className="absolute inset-x-0 top-0 bottom-[calc(64px+env(safe-area-inset-bottom))]">
        <MapScreen
          position={position}
          heading={compass.heading ?? position?.heading ?? null}
          pois={tracking.visible}
          players={roster.players}
          currentPlayerId={teamSession?.playerId ?? null}
          currentPlayer={teamSession}
          now={roster.now}
          onSelectPoi={selectPoi}
          follow={follow}
          onFollowChange={setFollow}
        />
      </div>

      <div className="scanlines pointer-events-none absolute inset-0 z-[850]" />
      <div className="noise pointer-events-none absolute inset-0 z-[851]" />
      <div className="scan-line pointer-events-none absolute inset-x-0 z-[852] h-px" />

      <HudOverlay
        position={position}
        status={geo.status}
        error={geo.error}
        heading={compass.heading}
        targets={discoveredCount}
        totalTargets={pois.length}
        battery={battery}
        simulated={!!simulated}
      />
      {gamePoisError && (
        <p role="alert" className="panel absolute inset-x-4 top-[270px] z-[900] p-3 text-xs text-alert">
          {gamePoisError}
        </p>
      )}

      <button
        className="absolute inset-x-3 top-[calc(196px+env(safe-area-inset-top))] z-[900] flex min-h-11 items-center gap-2 border border-neon/60 bg-black/90 px-3 py-2 text-left text-sm text-neon shadow-neon backdrop-blur"
        onClick={() => teamSession ? setTeamPanelOpen(true) : setMode('setup')}
      >
        <span className="h-4 w-4 shrink-0 rounded-full border border-white shadow-neon" style={{ backgroundColor: teamSession?.teamColor ?? '#64748b' }} />
        <span className="min-w-0 flex-1 truncate font-semibold tracking-wider">
          {teamSession ? `Vous jouez avec : ${teamSession.teamName}` : 'Créer ou rejoindre une équipe'}
        </span>
        {teamSession && <span className="text-[10px] text-radar">{roster.players.filter((player) => player.id !== teamSession.playerId && roster.now - player.location.updatedAt <= 90_000).length} SUR CARTE</span>}
        <span aria-hidden="true">›</span>
      </button>

      {geo.status === 'denied' && !simulated && (
        <div className="panel absolute inset-x-4 top-[260px] z-[900] p-3 text-center text-xs text-alert">
          Autorisation GPS refusée. Activez la localisation pour ce site puis{' '}
          <button className="underline" onClick={geo.retry}>réessayez</button>.
        </div>
      )}
      {compass.permission === 'denied' && (
        <div className="absolute bottom-[80px] left-2 z-[900] text-[10px] text-signal">⚠ Boussole indisponible</div>
      )}

      <SignalBanner banner={tracking.banner} onDone={tracking.dismissBanner} />

      {panel === 'radar' && (
        <RadarPanel
          position={position}
          heading={compass.heading}
          pois={tracking.visible}
          distances={tracking.distances}
          onSelect={selectPoi}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'journal' && (
        <JournalPanel
          pois={pois}
          discovered={tracking.discovered}
          stats={tracking.stats}
          isAdmin={adminSession}
          simulating={!!simulated}
          onSelect={selectPoi}
          onSimulate={simulate}
          onReset={tracking.reset}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'audio' && (
        <Sheet title="AUDIO D'AMBIANCE" onClose={() => setPanel(null)}>
          <AudioPanel />
        </Sheet>
      )}
      {panel === 'ar' && (
        <ArView
          position={position}
          heading={compass.heading}
          pois={tracking.visible}
          distances={tracking.distances}
          onSelect={selectPoi}
          onClose={() => setPanel(null)}
        />
      )}

      {selected && <PoiPopup poi={selected} distance={tracking.distances.get(selected.id)} onClose={() => setSelectedId(null)} />}

      <NavBar active={panel} audioPlaying={audio.playing} onSelect={setPanel} />
      {teamPanelOpen && teamSession && (
        <TeamInfoPanel
          session={teamSession}
          teams={roster.teams}
          players={roster.players}
          loadingTeams={roster.loading}
          teamsError={roster.error}
          connection={roster.connection}
          connectionError={roster.connectionError}
          onRetryConnection={roster.retry}
          sharePlayerLocation={sharePlayerLocation}
          onSharePlayerLocationChange={setSharePlayerLocation}
          playerLocationError={playerLocationError}
          gpsReady={Boolean(geo.position && geo.status === 'active' && geo.position.accuracy <= PLAYER_LOCATION_MAX_ACCURACY_M)}
          now={roster.now}
          onPlayerNameChange={(playerName) =>
            setTeamSession((current) => current ? { ...current, playerName } : current)
          }
          onClose={() => setTeamPanelOpen(false)}
        />
      )}
      {teamSession && gameMessages.messages.length > 0 && (
        <GameMessageOverlay
          messages={gameMessages.messages}
          error={gameMessages.error}
          onAcknowledge={gameMessages.acknowledge}
        />
      )}

      {!booted && <BootScreen onStart={() => void start()} />}
    </div>
  );
}

export default function App() {
  return (
    <AudioProvider>
      <Game />
    </AudioProvider>
  );
}
