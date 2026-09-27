import type { RouteProgressItem, LiveVehicle } from '../api/monitoring';
import type { OperatorRouteSnapshot } from '../api/operator';
import type { RoutePlaybackModel } from '../route-playback/routePlaybackTypes';
import type { RoutePlaybackRouteState } from '../route-playback/routePlaybackMath';

export type MonitoringPlaybackMode = 'visual' | 'hybrid';

export function monitoringPlaybackInitialProgress(input: {
  fieldMode: boolean;
  routeSnapshot?: OperatorRouteSnapshot;
  routeProgress: RouteProgressItem[];
  operatorVehicle?: LiveVehicle | null;
}): number {
  if (input.fieldMode) {
    const snapshot = input.routeSnapshot;
    if (snapshot && snapshot.stopsTotal > 0) {
      return Math.min(1, Math.max(0, snapshot.stopsDone / snapshot.stopsTotal));
    }
    const vehicleProgress = input.operatorVehicle?.progress;
    if (vehicleProgress != null) {
      return Math.min(1, Math.max(0, vehicleProgress / 100));
    }
    return 0;
  }

  if (input.routeProgress.length === 0) return 0;
  const average =
    input.routeProgress.reduce((sum, item) => sum + item.pct, 0) / input.routeProgress.length;
  return Math.min(1, Math.max(0, average / 100));
}

export function filterPlaybackRoutesForMonitoring(
  routes: RoutePlaybackModel[],
  fieldMode: boolean,
  operatorVehicle?: LiveVehicle | null,
): RoutePlaybackModel[] {
  if (!fieldMode) return routes;
  const routeId = operatorVehicle?.routeId;
  if (routeId != null) {
    const match = routes.filter((route) => route.routeId === routeId);
    if (match.length > 0) return match;
  }
  const label = operatorVehicle?.id;
  if (!label) return routes.slice(0, 1);
  return routes.filter((route) => route.vehicleLabel === label).slice(0, 1);
}

export function canShowMonitoringRoutePlayback(input: {
  fieldMode: boolean;
  inRouteCount: number;
  operatorVehicle?: LiveVehicle | null;
  routeSnapshot?: OperatorRouteSnapshot;
}): boolean {
  if (input.inRouteCount <= 0 && !input.fieldMode) return false;
  if (input.fieldMode) {
    return (
      input.operatorVehicle?.status === 'en-ruta' ||
      (input.routeSnapshot?.stopsTotal ?? 0) > 0 ||
      input.operatorVehicle?.routeId != null
    );
  }
  return input.inRouteCount > 0;
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ');
}

export function mergeRouteProgressWithPlayback(
  routeProgress: RouteProgressItem[],
  routes: RoutePlaybackModel[],
  routeStates: RoutePlaybackRouteState[],
  playbackActive: boolean,
): RouteProgressItem[] {
  if (!playbackActive || routes.length === 0) return routeProgress;

  return routeProgress.map((item, index) => {
    const route =
      routes.find((row) => normalizeLabel(row.vehicleLabel) === normalizeLabel(item.label)) ??
      routes.find((row) => item.label.includes(row.vehicleLabel)) ??
      routes[index];
    if (!route) return item;

    const state = routeStates.find((row) => row.routeId === route.routeId);
    if (!state) return item;

    const done = Math.min(route.stops.length, state.completedStops);
    const total = route.stops.length || item.total;
    const pct = total > 0 ? Math.round((done / total) * 100) : item.pct;

    return {
      ...item,
      done,
      total,
      pct,
    };
  });
}

export function initialCompletedStopsByRoute(
  routes: RoutePlaybackModel[],
  initialProgress: number,
): Map<number, number> {
  const map = new Map<number, number>();
  for (const route of routes) {
    const stops = Math.min(
      route.stops.length,
      Math.floor(initialProgress * route.stops.length),
    );
    map.set(route.routeId, stops);
  }
  return map;
}
