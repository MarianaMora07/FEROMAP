import type { Map as MapLibreMap } from 'maplibre-gl';
import type { RoutePlaybackModel } from './routePlaybackTypes';
import type { RoutePlaybackRouteState } from './routePlaybackMath';
import { resolveFollowTruckPosition } from '../map/mapPlaybackUx';

export type PlaybackCameraMode = 'free' | 'follow' | 'fit-all';

function normalizeVehicleKey(value: string): string {
  return value.trim().toUpperCase();
}

function routeMatchesVehicle(route: RoutePlaybackModel, vehicleId: string): boolean {
  const key = normalizeVehicleKey(vehicleId);
  return (
    normalizeVehicleKey(route.vehicleLabel) === key ||
    String(route.vehicleId) === vehicleId ||
    normalizeVehicleKey(String(route.vehicleId)) === key
  );
}

export function fitMapToPlaybackRoutes(
  map: MapLibreMap,
  routes: RoutePlaybackModel[],
  padding = 72,
): void {
  const coordinates = routes.flatMap((route) =>
    route.lineCoordinates.map((coord) => [coord[0], coord[1]] as [number, number]),
  );
  if (coordinates.length < 2) return;

  const lngs = coordinates.map(([lng]) => lng);
  const lats = coordinates.map(([, lat]) => lat);
  map.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    { padding, duration: 600, maxZoom: 15 },
  );
}

export function applyPlaybackCamera(
  map: MapLibreMap,
  mode: PlaybackCameraMode,
  routes: RoutePlaybackModel[],
  routeStates: RoutePlaybackRouteState[],
  focusVehicleId?: string,
): void {
  if (mode === 'free' || routes.length === 0) return;

  if (mode === 'fit-all') {
    fitMapToPlaybackRoutes(map, routes);
    return;
  }

  const position = resolveFollowTruckPosition(routes, routeStates, focusVehicleId);
  if (!position) return;

  map.easeTo({
    center: [position[0], position[1]],
    zoom: Math.max(map.getZoom(), 15),
    duration: 450,
    essential: true,
  });
}

export function resolveFollowRoute(
  routes: RoutePlaybackModel[],
  focusVehicleId?: string,
): RoutePlaybackModel | null {
  if (routes.length === 0) return null;
  if (!focusVehicleId) return routes[0]!;
  return routes.find((route) => routeMatchesVehicle(route, focusVehicleId)) ?? routes[0]!;
}
