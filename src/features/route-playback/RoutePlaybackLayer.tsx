import { Show, createEffect, onCleanup } from 'solid-js';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { sliceLineCoordinates } from '../../core/route-playback/routePlaybackMath';
import type { RoutePlaybackModel } from '../../core/route-playback/routePlaybackTypes';
import type { RoutePlaybackController } from '../../core/route-playback/useRoutePlayback';
import { RoutePlaybackMarkers } from './RoutePlaybackMarkers';
import { RoutePlaybackControls } from './RoutePlaybackControls';

const BASE_SOURCE_ID = 'route-playback-base';
const PROGRESS_SOURCE_ID = 'route-playback-progress';
const BASE_LAYER_ID = 'route-playback-base-line';
const PROGRESS_LAYER_ID = 'route-playback-progress-line';

function routesToGeoJson(routes: RoutePlaybackModel[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: routes.map((route) => ({
      type: 'Feature',
      properties: {
        routeId: route.routeId,
        color: route.color,
        label: route.vehicleLabel,
      },
      geometry: {
        type: 'LineString',
        coordinates: route.lineCoordinates.map((coord) => [coord[0], coord[1]]),
      },
    })),
  };
}

function progressRoutesGeoJson(
  routes: RoutePlaybackModel[],
  routeStates: ReturnType<RoutePlaybackController['routeStates']>,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: routes
      .map((route) => {
        const state = routeStates.find((item) => item.routeId === route.routeId);
        if (!state) return null;
        const coordinates = sliceLineCoordinates(route.lineCoordinates, state.lineProgress);
        if (coordinates.length < 2) return null;
        return {
          type: 'Feature',
          properties: {
            routeId: route.routeId,
            color: route.color,
          },
          geometry: {
            type: 'LineString',
            coordinates,
          },
        };
      })
      .filter((feature): feature is GeoJSON.Feature<GeoJSON.LineString> => feature !== null),
  };
}

function ensurePlaybackLayers(map: MapLibreMap, routes: RoutePlaybackModel[]) {
  if (!map.getSource(BASE_SOURCE_ID)) {
    map.addSource(BASE_SOURCE_ID, {
      type: 'geojson',
      data: routesToGeoJson(routes),
    });
    map.addLayer({
      id: BASE_LAYER_ID,
      type: 'line',
      source: BASE_SOURCE_ID,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 3,
        'line-opacity': 0.22,
        'line-dasharray': [2, 2],
      },
    });
  }

  if (!map.getSource(PROGRESS_SOURCE_ID)) {
    map.addSource(PROGRESS_SOURCE_ID, {
      type: 'geojson',
      data: progressRoutesGeoJson(routes, []),
    });
    map.addLayer({
      id: PROGRESS_LAYER_ID,
      type: 'line',
      source: PROGRESS_SOURCE_ID,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 5,
        'line-opacity': 0.95,
      },
    });
  }
}

export interface RoutePlaybackLayerProps {
  map: () => MapLibreMap | undefined;
  routes: () => RoutePlaybackModel[];
  playback: RoutePlaybackController;
  showControls?: boolean;
  controlsClass?: string;
}

export function RoutePlaybackLayer(props: RoutePlaybackLayerProps) {
  createEffect(() => {
    const map = props.map();
    const routes = props.routes();
    const routeStates = props.playback.routeStates();
    if (!map) return;

    const sync = () => {
      if (!map.isStyleLoaded()) return;
      ensurePlaybackLayers(map, routes);
      (map.getSource(BASE_SOURCE_ID) as maplibregl.GeoJSONSource).setData(routesToGeoJson(routes));
      (map.getSource(PROGRESS_SOURCE_ID) as maplibregl.GeoJSONSource).setData(
        progressRoutesGeoJson(routes, routeStates),
      );
    };

    if (map.isStyleLoaded()) sync();
    else map.once('load', sync);
  });

  onCleanup(() => {
    const map = props.map();
    if (!map?.isStyleLoaded()) return;
    for (const layerId of [PROGRESS_LAYER_ID, BASE_LAYER_ID]) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    }
    for (const sourceId of [PROGRESS_SOURCE_ID, BASE_SOURCE_ID]) {
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    }
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
