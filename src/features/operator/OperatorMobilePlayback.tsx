import { Show, createEffect, createMemo, createResource, createSignal } from 'solid-js';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { OperationalMap } from '../../core/map/OperationalMap';
import { fitMapToOperationalData } from '../../core/map/operationalMapConfig';
import { applyPlaybackCamera } from '../../core/route-playback/playbackCameraUx';
import { fetchDailyRoutePlayback } from '../../core/api/routePlayback';
import type { OperatorRouteSnapshot } from '../../core/api/operator';
import {
  deriveOperatorPlaybackSync,
  filterOperatorPlaybackRoute,
  operatorPlaybackPlanId,
  operatorPlaybackSeedProgress,
  OPERATOR_PLAYBACK_AUTO_PLAY,
  type OperatorPlaybackSync,
} from '../../core/operator/operatorPlaybackUx';
import { useRoutePlayback } from '../../core/route-playback/useRoutePlayback';
import { RoutePlaybackLayer } from '../route-playback/RoutePlaybackLayer';
import { OperatorMobilePlaybackControls } from './OperatorMobilePlaybackControls';
import { mockDailyRoutePlayback } from '../../data/mock/routePlayback';

export interface OperatorMobilePlaybackProps {
  dailyPlanId?: number | null;
  vehicleId: string;
  routeSnapshot?: OperatorRouteSnapshot | null;
  class?: string;
  onSync?: (sync: OperatorPlaybackSync | null) => void;
}

export function OperatorMobilePlayback(props: OperatorMobilePlaybackProps) {
  const mapRef: { current?: MapLibreMap } = {};
  const [mapInstance, setMapInstance] = createSignal<MapLibreMap | undefined>();

  const planId = () => operatorPlaybackPlanId(props.dailyPlanId, props.routeSnapshot);

  const [playbackPayload] = createResource(planId, async (id) => {
    if (!id) return mockDailyRoutePlayback(0);
    return fetchDailyRoutePlayback(id);
  });

  const playbackRoutes = createMemo(() =>
    filterOperatorPlaybackRoute(
      playbackPayload()?.routes ?? [],
      props.vehicleId,
      props.routeSnapshot?.routeId,
    ),
  );

  const playback = useRoutePlayback(() => playbackRoutes(), {
    pauseAtStops: true,
    autoPlay: OPERATOR_PLAYBACK_AUTO_PLAY,
  });

  let seeded = false;

  createEffect(() => {
    if (seeded || playbackRoutes().length === 0) return;
    const initial = operatorPlaybackSeedProgress(
      props.routeSnapshot ?? undefined,
      props.routeSnapshot?.progress,
    );
    playback.setProgress(initial);
    seeded = true;
  });

  createEffect(() => {
    playback.routeStates();
    playback.isPlaying();
    const sync = deriveOperatorPlaybackSync(
      playbackRoutes()[0],
      playback.routeStates()[0],
      playback.isPlaying(),
    );
    props.onSync?.(sync);
  });

  createEffect(() => {
    if (!playback.isPlaying() || playbackRoutes().length === 0) return;
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    playback.routeStates();
    applyPlaybackCamera(
      map,
      'follow',
      playbackRoutes(),
      playback.routeStates(),
      props.vehicleId,
    );
  });

  const handleMapReady = (map: MapLibreMap) => {
    mapRef.current = map;
    setMapInstance(map);
    if (playbackRoutes().length > 0) {
      fitMapToOperationalData(map, {
        routes: {
          type: 'FeatureCollection',
          features: playbackRoutes().map((route) => ({
            type: 'Feature',
            properties: { type: 'optimized' },
            geometry: {
              type: 'LineString',
              coordinates: route.lineCoordinates.map((coord) => [coord[0], coord[1]]),
            },
          })),
        },
      });
    }
  };

  return (
    <div
      class={`relative overflow-hidden rounded-lg border border-default bg-app ${props.class ?? 'h-56 sm:h-64'}`}
      data-testid="operator-mobile-playback"
    >
      <Show
        when={!playbackPayload.loading && playbackRoutes().length > 0}
        fallback={
          <div class="flex h-full items-center justify-center px-4 text-center text-sm text-text-muted">
            {playbackPayload.loading
              ? 'Cargando ruta…'
              : 'Sin geometría de ruta para reproducir.'}
          </div>
        }
      >
        <OperationalMap onMapReady={handleMapReady} onStyleRestored={handleMapReady}>
          <RoutePlaybackLayer
            map={mapInstance}
            routes={playbackRoutes}
            playback={playback}
            showControls={false}
          />
          <OperatorMobilePlaybackControls playback={playback} />
        </OperationalMap>
      </Show>
    </div>
  );
}
