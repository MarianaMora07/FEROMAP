import type { OperatorRouteSnapshot } from '../api/operator';
import type { RoutePlaybackModel } from '../route-playback/routePlaybackTypes';
import type { RoutePlaybackRouteState } from '../route-playback/routePlaybackMath';

export interface OperatorPlaybackSync {
  progress: number;
  nextPoint: string | null;
  nextStopType: 'collection' | 'landfill' | null;
  completedStops: number;
  totalStops: number;
  isPlaying: boolean;
}

export function filterOperatorPlaybackRoute(
  routes: RoutePlaybackModel[],
  vehicleId: string,
  routeId?: number | null,
): RoutePlaybackModel[] {
  const key = vehicleId.trim().toUpperCase();
  const byVehicle = routes.filter(
    (route) =>
      route.vehicleLabel.toUpperCase() === key || String(route.vehicleId) === vehicleId,
  );
  if (byVehicle.length > 0) return byVehicle.slice(0, 1);

  if (routeId != null) {
    const byRoute = routes.filter((route) => route.routeId === routeId);
    if (byRoute.length > 0) return byRoute.slice(0, 1);
  }

  return routes.slice(0, 1);
}

export function deriveOperatorPlaybackSync(
  route: RoutePlaybackModel | undefined,
  routeState: RoutePlaybackRouteState | undefined,
  isPlaying: boolean,
): OperatorPlaybackSync | null {
  if (!route || !routeState) return null;

  const stop =
    route.stops[Math.min(routeState.currentStopIndex, route.stops.length - 1)] ??
    route.stops[routeState.completedStops];

  return {
    progress: Math.round(routeState.progress * 100),
    nextPoint: stop?.code ?? null,
    nextStopType: stop?.stopType ?? null,
    completedStops: routeState.completedStops,
    totalStops: route.stops.length,
    isPlaying,
  };
}

export function operatorPlaybackInitialProgress(
  snapshot: OperatorRouteSnapshot | undefined,
): number {
  if (!snapshot || snapshot.stopsTotal <= 0) return 0;
  return Math.min(1, Math.max(0, snapshot.stopsDone / snapshot.stopsTotal));
}

export function operatorPlaybackCanStart(input: {
  dailyPlanId?: number | null;
  snapshot?: OperatorRouteSnapshot | null;
}): boolean {
  if (!input.dailyPlanId && !input.snapshot?.dailyPlanId) return false;
  return (input.snapshot?.stopsTotal ?? 0) > 0;
}

export function operatorPlaybackPlanId(
  dailyPlanId?: number | null,
  snapshot?: OperatorRouteSnapshot | null,
): number | null {
  return dailyPlanId ?? snapshot?.dailyPlanId ?? null;
}

/** Operador: sin autoplay — el conductor inicia manualmente (ahorro batería). */
export const OPERATOR_PLAYBACK_AUTO_PLAY = false;

export function operatorPlaybackSeedProgress(
  snapshot: OperatorRouteSnapshot | undefined,
  routeProgressPct?: number,
): number {
  const fromSnapshot = operatorPlaybackInitialProgress(snapshot);
  if (fromSnapshot > 0) return fromSnapshot;
  if (routeProgressPct != null) {
    return Math.min(1, Math.max(0, routeProgressPct / 100));
  }
  return 0;
}
