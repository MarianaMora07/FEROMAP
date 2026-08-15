import { Show } from 'solid-js';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useRoutePlaybackLayer } from '../../core/map/useRoutePlaybackLayer';
import type { RoutePlaybackModel } from '../../core/route-playback/routePlaybackTypes';
import type { RoutePlaybackController } from '../../core/route-playback/useRoutePlayback';
import { RoutePlaybackMarkers } from './RoutePlaybackMarkers';
import { RoutePlaybackControls } from './RoutePlaybackControls';

export interface RoutePlaybackLayerProps {
  map: () => MapLibreMap | undefined;
  routes: () => RoutePlaybackModel[];
  playback: RoutePlaybackController;
  showControls?: boolean;
  controlsClass?: string;
}

export function RoutePlaybackLayer(props: RoutePlaybackLayerProps) {
  useRoutePlaybackLayer({
    map: props.map,
    routes: props.routes,
    routeStates: () => props.playback.routeStates(),
  });

  return (
    <>
      <RoutePlaybackMarkers
        map={props.map}
        routes={props.routes}
        routeStates={() => props.playback.routeStates()}
      />
      <Show when={props.showControls !== false}>
        <RoutePlaybackControls
          playback={props.playback}
          routes={props.routes()}
          class={props.controlsClass}
        />
      </Show>
    </>
  );
}
