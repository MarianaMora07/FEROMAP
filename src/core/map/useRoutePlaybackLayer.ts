import { createEffect, onCleanup } from 'solid-js';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { sliceLineCoordinates } from '../route-playback/routePlaybackMath';
import type { RoutePlaybackModel } from '../route-playback/routePlaybackTypes';
import type { RoutePlaybackRouteState } from '../route-playback/routePlaybackMath';

export const ROUTE_PLAYBACK_BASE_SOURCE_ID = 'route-playback-base';
export const ROUTE_PLAYBACK_PROGRESS_SOURCE_ID = 'route-playback-progress';
export const ROUTE_PLAYBACK_BASE_LAYER_ID = 'route-playback-base-line';
export const ROUTE_PLAYBACK_PROGRESS_GLOW_LAYER_ID = 'route-playback-progress-glow';
export const ROUTE_PLAYBACK_PROGRESS_LAYER_ID = 'route-playback-progress-line';

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
  routeStates: RoutePlaybackRouteState[],
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
  if (!map.getSource(ROUTE_PLAYBACK_BASE_SOURCE_ID)) {
    map.addSource(ROUTE_PLAYBACK_BASE_SOURCE_ID, {
      type: 'geojson',
      data: routesToGeoJson(routes),
    });
    map.addLayer({
      id: ROUTE_PLAYBACK_BASE_LAYER_ID,
      type: 'line',
      source: ROUTE_PLAYBACK_BASE_SOURCE_ID,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 3,
        'line-opacity': 0.55,
        'line-dasharray': [2, 2],
      },
    });
  }

  if (!map.getSource(ROUTE_PLAYBACK_PROGRESS_SOURCE_ID)) {
    map.addSource(ROUTE_PLAYBACK_PROGRESS_SOURCE_ID, {
      type: 'geojson',
      data: progressRoutesGeoJson(routes, []),
    });
    map.addLayer({
      id: ROUTE_PLAYBACK_PROGRESS_GLOW_LAYER_ID,
      type: 'line',
      source: ROUTE_PLAYBACK_PROGRESS_SOURCE_ID,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 12,
        'line-opacity': 0.22,
        'line-blur': 0.6,
      },
    });
    map.addLayer({
      id: ROUTE_PLAYBACK_PROGRESS_LAYER_ID,
      type: 'line',
      source: ROUTE_PLAYBACK_PROGRESS_SOURCE_ID,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 6,
        'line-opacity': 0.98,
      },
    });
  }
}

export function removeRoutePlaybackLayers(map: MapLibreMap) {
  for (const layerId of [
    ROUTE_PLAYBACK_PROGRESS_LAYER_ID,
    ROUTE_PLAYBACK_PROGRESS_GLOW_LAYER_ID,
    ROUTE_PLAYBACK_BASE_LAYER_ID,
  ]) {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  }
  for (const sourceId of [ROUTE_PLAYBACK_PROGRESS_SOURCE_ID, ROUTE_PLAYBACK_BASE_SOURCE_ID]) {
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  }
}

export interface UseRoutePlaybackLayerOptions {
  map: () => MapLibreMap | undefined;
  routes: () => RoutePlaybackModel[];
  routeStates: () => RoutePlaybackRouteState[];
}

export function useRoutePlaybackLayer(options: UseRoutePlaybackLayerOptions) {
  createEffect(() => {
    const map = options.map();
    const routes = options.routes();
    const routeStates = options.routeStates();
    if (!map) return;

    const sync = () => {
      if (!map.isStyleLoaded()) return;
      ensurePlaybackLayers(map, routes);
      (map.getSource(ROUTE_PLAYBACK_BASE_SOURCE_ID) as maplibregl.GeoJSONSource).setData(
        routesToGeoJson(routes),
      );
      (map.getSource(ROUTE_PLAYBACK_PROGRESS_SOURCE_ID) as maplibregl.GeoJSONSource).setData(
        progressRoutesGeoJson(routes, routeStates),
      );
    };

    if (map.isStyleLoaded()) sync();
    else map.once('load', sync);
  });

  onCleanup(() => {
    const map = options.map();
    if (!map?.isStyleLoaded()) return;
    removeRoutePlaybackLayers(map);
  });
}
