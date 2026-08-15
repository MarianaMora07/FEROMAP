import type { DailyPlan } from '../api/planning';
import type { RoutePlaybackModel } from '../route-playback/routePlaybackTypes';
import type { RoutePlaybackRouteState } from '../route-playback/routePlaybackMath';
import type { RoutePlaybackCoordinate } from '../route-playback/routePlaybackTypes';

const PLAYBACK_READY_PLAN_STATUSES = new Set(['optimized', 'dispatched', 'partial', 'closed']);

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

export function canOpenMapGisPlayback(input: {
  residentMode: boolean;
  dailyPlan?: DailyPlan | null;
  playbackRouteCount: number;
}): boolean {
  if (input.residentMode) return false;
  const plan = input.dailyPlan;
  if (!plan?.id) return false;
  if (!PLAYBACK_READY_PLAN_STATUSES.has(plan.status)) return false;
  return input.playbackRouteCount > 0 || plan.status === 'optimized' || plan.status === 'dispatched';
}

export function filterPlaybackRoutesForMapGis(
  routes: RoutePlaybackModel[],
  options: {
    enabledRouteIds: Array<number | string> | null;
    focusVehicleId?: string;
    fieldMode?: boolean;
  },
): RoutePlaybackModel[] {
  let filtered = routes;

  if (options.enabledRouteIds !== null) {
    if (options.enabledRouteIds.length === 0) return [];
    const enabled = new Set(options.enabledRouteIds.map((id) => String(id)));
    filtered = filtered.filter((route) => enabled.has(String(route.routeId)));
  }

  if (!options.focusVehicleId) return filtered;

  const byVehicle = filtered.filter((route) => routeMatchesVehicle(route, options.focusVehicleId!));
  if (byVehicle.length === 0) return filtered;

  if (options.fieldMode) return byVehicle.slice(0, 1);
  return byVehicle;
}

export function resolveFollowTruckPosition(
  routes: RoutePlaybackModel[],
  routeStates: RoutePlaybackRouteState[],
  focusVehicleId?: string,
): RoutePlaybackCoordinate | null {
  if (routes.length === 0 || routeStates.length === 0) return null;

  let targetRoute = routes[0]!;
  if (focusVehicleId) {
    const match = routes.find((route) => routeMatchesVehicle(route, focusVehicleId));
    if (match) targetRoute = match;
  }

  const state = routeStates.find((item) => item.routeId === targetRoute.routeId);
  return state?.position ?? null;
}

export function dailyPlanStatusLabel(status: string): string {
  switch (status) {
    case 'optimized':
      return 'Optimizado';
    case 'dispatched':
      return 'Despachado';
    case 'partial':
      return 'Parcial';
    case 'closed':
      return 'Cerrado';
    case 'open':
      return 'Abierto';
    default:
      return status;
  }
}
