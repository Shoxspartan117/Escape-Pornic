import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GeoPosition, PointOfInterest } from '../types/PointOfInterest';
import { DEFAULT_ACTIVATION_RADIUS } from '../types/PointOfInterest';
import { asset } from '../utils/asset';
import type { GamePlayer, GameSession } from '../services/gameService';

interface MapScreenProps {
  position: GeoPosition | null;
  heading?: number | null;
  /** POI à afficher (visibles en jeu, tous en administration). */
  pois: PointOfInterest[];
  players?: GamePlayer[];
  currentPlayerId?: string | null;
  currentPlayer?: Pick<GameSession, 'playerName' | 'teamName' | 'teamColor'> | null;
  now?: number;
  onSelectPoi?: (poi: PointOfInterest) => void;
  onMapClick?: (latitude: number, longitude: number) => void;
  follow?: boolean;
  onFollowChange?: (follow: boolean) => void;
  /** Rayon du cercle de détection autour de l'utilisateur (m). */
  detectionRadius?: number;
  /** Affiche le rayon d'activation de chaque POI (administration). */
  showPoiRadius?: boolean;
  /** Cadre la carte sur les POI à l'ouverture (si aucune position). */
  fitToPois?: boolean;
  highlightId?: string | null;
}

const PORNIC: L.LatLngTuple = [47.1132, -2.1044];
const PLAYER_POSITION_STALE_MS = 90_000;

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function playerIcon(player: GamePlayer): L.DivIcon {
  const color = /^#[\da-f]{6}$/i.test(player.teamColor) ? player.teamColor : '#00ffff';
  return L.divIcon({
    className: '',
    iconSize: [154, 50],
    iconAnchor: [77, 25],
    html: `<div class="team-map-marker" style="--team-color:${color}"><span class="team-map-dot"><span></span></span><span class="team-map-name">${escapeHtml(player.name)}<small>${escapeHtml(player.teamName)}</small></span></div>`,
  });
}

function userIcon(currentPlayer: MapScreenProps['currentPlayer']): L.DivIcon {
  if (!currentPlayer) {
    return L.divIcon({
      className: '',
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      html: '<div class="user-marker"><div class="user-cone"></div><div class="user-pulse"></div><div class="user-dot"></div></div>',
    });
  }
  const color = /^#[\da-f]{6}$/i.test(currentPlayer.teamColor) ? currentPlayer.teamColor : '#00ffff';
  return L.divIcon({
    className: '',
    iconSize: [154, 50],
    iconAnchor: [77, 25],
    html: `<div class="own-player-marker" style="--team-color:${color}"><div class="user-cone"></div><div class="user-pulse"></div><div class="user-dot"></div><span class="own-player-label">${escapeHtml(currentPlayer.playerName)}<small>${escapeHtml(currentPlayer.teamName)}</small></span></div>`,
  });
}

function poiIcon(poi: PointOfInterest, highlighted: boolean): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    html: `<div class="poi-marker poi-arrive ${highlighted ? 'poi-highlight' : ''}"><span class="poi-ring"></span><img src="${escapeAttr(asset(poi.icon))}" alt="" onerror="this.onerror=null;this.src='${escapeAttr(asset('/icons/target.svg'))}'" /></div>`,
  });
}

/** Carte Leaflet / OpenStreetMap plein écran avec suivi de l'utilisateur et marqueurs de POI. */
export default function MapScreen({
  position,
  heading = null,
  pois,
  players = [],
  currentPlayerId = null,
  currentPlayer = null,
  now = Date.now(),
  onSelectPoi,
  onMapClick,
  follow = false,
  onFollowChange,
  detectionRadius = DEFAULT_ACTIVATION_RADIUS,
  showPoiRadius = false,
  fitToPois = false,
  highlightId = null,
}: MapScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const userCircleRef = useRef<L.Circle | null>(null);
  const poiMarkersRef = useRef(new Map<string, { marker: L.Marker; highlighted: boolean }>());
  const playerMarkersRef = useRef(new Map<string, { marker: L.Marker; signature: string }>());
  const radiusLayerRef = useRef<L.LayerGroup | null>(null);

  // Callbacks / données toujours à jour, sans recréer les écouteurs Leaflet.
  const latest = useRef({ pois, onSelectPoi, onMapClick, onFollowChange });
  latest.current = { pois, onSelectPoi, onMapClick, onFollowChange };

  // Initialisation unique de la carte
  useEffect(() => {
    if (!containerRef.current) return;
    const start: L.LatLngTuple = position ? [position.latitude, position.longitude] : PORNIC;
    const map = L.map(containerRef.current, { center: start, zoom: 17, zoomControl: false, maxZoom: 19 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);
    radiusLayerRef.current = L.layerGroup().addTo(map);

    map.on('dragstart', () => latest.current.onFollowChange?.(false));
    map.on('click', (e: L.LeafletMouseEvent) => latest.current.onMapClick?.(e.latlng.lat, e.latlng.lng));
    mapRef.current = map;

    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(containerRef.current);
    const markers = poiMarkersRef.current;

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
      userCircleRef.current = null;
      markers.clear();
      for (const { marker } of playerMarkersRef.current.values()) marker.remove();
      playerMarkersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marqueur utilisateur + cercle de détection + suivi automatique
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position) return;
    const latlng: L.LatLngTuple = [position.latitude, position.longitude];
    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker(latlng, { icon: userIcon(currentPlayer), interactive: false, zIndexOffset: 1000 }).addTo(map);
      userCircleRef.current = L.circle(latlng, {
        radius: detectionRadius,
        color: '#00FFFF',
        weight: 1,
        fillColor: '#00FFFF',
        fillOpacity: 0.06,
        dashArray: '4 6',
        interactive: false,
        className: 'detect-circle',
      }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng(latlng);
      userMarkerRef.current.setIcon(userIcon(currentPlayer));
      userCircleRef.current?.setLatLng(latlng).setRadius(detectionRadius);
    }
    if (follow) map.panTo(latlng, { animate: true, duration: 0.8 });
  }, [position, follow, detectionRadius, currentPlayer]);

  // Orientation du cône du marqueur utilisateur
  useEffect(() => {
    const cone = userMarkerRef.current?.getElement()?.querySelector<HTMLElement>('.user-cone');
    if (cone) {
      cone.style.display = heading === null ? 'none' : 'block';
      cone.style.transform = `rotate(${heading ?? 0}deg)`;
    }
  }, [heading, position]);

  // Recentrage immédiat quand le suivi est réactivé
  useEffect(() => {
    if (follow && position && mapRef.current) mapRef.current.setView([position.latitude, position.longitude], Math.max(mapRef.current.getZoom(), 17));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow]);

  // Synchronisation des marqueurs de POI (l'animation d'arrivée joue à la création)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = poiMarkersRef.current;
    const ids = new Set(pois.map((p) => p.id));

    for (const [id, entry] of markers) {
      if (!ids.has(id)) {
        entry.marker.remove();
        markers.delete(id);
      }
    }
    for (const poi of pois) {
      const highlighted = poi.id === highlightId;
      const existing = markers.get(poi.id);
      if (existing) {
        existing.marker.setLatLng([poi.latitude, poi.longitude]);
        if (existing.highlighted !== highlighted) {
          existing.marker.setIcon(poiIcon(poi, highlighted));
          existing.highlighted = highlighted;
        }
      } else {
        const marker = L.marker([poi.latitude, poi.longitude], { icon: poiIcon(poi, highlighted), title: poi.name }).addTo(map);
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e.originalEvent);
          const current = latest.current.pois.find((p) => p.id === poi.id);
          if (current) latest.current.onSelectPoi?.(current);
        });
        markers.set(poi.id, { marker, highlighted });
      }
    }

    // Rayons d'activation (administration)
    const layer = radiusLayerRef.current;
    layer?.clearLayers();
    if (showPoiRadius) {
      for (const poi of pois) {
        L.circle([poi.latitude, poi.longitude], {
          radius: poi.activationRadius,
          color: '#FF9500',
          weight: 1,
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(layer!);
      }
    }
  }, [pois, highlightId, showPoiRadius]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const activePlayers = players.filter(
      (player) =>
        player.id !== currentPlayerId &&
        now - player.location.updatedAt <= PLAYER_POSITION_STALE_MS,
    );
    const activeIds = new Set(activePlayers.map((player) => player.id));

    for (const [id, entry] of playerMarkersRef.current) {
      if (!activeIds.has(id)) {
        entry.marker.remove();
        playerMarkersRef.current.delete(id);
      }
    }

    for (const player of activePlayers) {
      const { location } = player;
      const signature = `${player.name}:${player.teamName}:${player.teamColor}`;
      const existing = playerMarkersRef.current.get(player.id);
      if (existing) {
        existing.marker.setLatLng([location.latitude, location.longitude]);
        if (existing.signature !== signature) {
          existing.marker.setIcon(playerIcon(player));
          existing.marker.setTooltipContent(`${escapeHtml(player.name)} · ${escapeHtml(player.teamName)}`);
          existing.signature = signature;
        }
      } else {
        const marker = L.marker([location.latitude, location.longitude], {
          icon: playerIcon(player),
          title: `${player.name} · ${player.teamName}`,
          zIndexOffset: 500,
        }).addTo(map);
        marker.bindTooltip(`${escapeHtml(player.name)} · ${escapeHtml(player.teamName)}`, { direction: 'top', offset: [0, -18], opacity: 0.95 });
        playerMarkersRef.current.set(player.id, { marker, signature });
      }
    }
  }, [players, currentPlayerId, now]);

  // Cadrage initial sur les POI (aperçu admin)
  const fitted = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitToPois || fitted.current || pois.length === 0 || position) return;
    fitted.current = true;
    map.fitBounds(L.latLngBounds(pois.map((p) => [p.latitude, p.longitude] as L.LatLngTuple)), { padding: [30, 30], maxZoom: 16 });
  }, [pois, fitToPois, position]);

  return (
    <div className="relative isolate h-full w-full">
      <div ref={containerRef} className="h-full w-full bg-void" />
      {onFollowChange && !follow && position && (
        <button
          className="btn-neon absolute right-3 top-[calc(190px+env(safe-area-inset-top))] z-[800] !px-3 !py-2 text-xs"
          onClick={() => onFollowChange(true)}
        >
          ⌖ RECENTRER
        </button>
      )}
    </div>
  );
}
