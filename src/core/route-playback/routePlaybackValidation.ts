import type {
  DailyRoutePlaybackResponse,
  RoutePlaybackCoordinate,
  RoutePlaybackModel,
  RoutePlaybackStop,
} from './routePlaybackTypes';
import { ROUTE_PLAYBACK_MAX_ROUTES } from './routePlaybackTypes';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCoordinatePair(value: unknown): value is RoutePlaybackCoordinate {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1])
  );
}

export function isRoutePlaybackStop(value: unknown): value is RoutePlaybackStop {
  if (!value || typeof value !== 'object') return false;
  const stop = value as RoutePlaybackStop;
  return (
    isFiniteNumber(stop.sequence) &&
    isFiniteNumber(stop.lng) &&
    isFiniteNumber(stop.lat) &&
    typeof stop.code === 'string' &&
    stop.code.length > 0 &&
    isFiniteNumber(stop.serviceMinutes) &&
    stop.serviceMinutes > 0
  );
}

export function isRoutePlaybackModel(value: unknown): value is RoutePlaybackModel {
  if (!value || typeof value !== 'object') return false;
  const route = value as RoutePlaybackModel;
  return (
    isFiniteNumber(route.routeId) &&
    isFiniteNumber(route.vehicleId) &&
    typeof route.vehicleLabel === 'string' &&
    route.vehicleLabel.length > 0 &&
    typeof route.color === 'string' &&
    Array.isArray(route.lineCoordinates) &&
    route.lineCoordinates.length >= 2 &&
    route.lineCoordinates.every(isCoordinatePair) &&
    Array.isArray(route.stops) &&
    route.stops.length > 0 &&
    route.stops.every(isRoutePlaybackStop) &&
    isFiniteNumber(route.totalDurationMinutes) &&
    route.totalDurationMinutes > 0 &&
    (route.startTime === undefined ||
      route.startTime === null ||
      typeof route.startTime === 'string')
  );
}

export function isDailyRoutePlaybackResponse(
  value: unknown,
): value is DailyRoutePlaybackResponse {
  if (!value || typeof value !== 'object') return false;
  const payload = value as DailyRoutePlaybackResponse;
  return (
    isFiniteNumber(payload.dailyPlanId) &&
    typeof payload.operationDate === 'string' &&
    typeof payload.previewMode === 'boolean' &&
    Array.isArray(payload.routes) &&
    payload.routes.length <= ROUTE_PLAYBACK_MAX_ROUTES &&
    payload.routes.every(isRoutePlaybackModel)
  );
}

export function assertPlaybackRouteCount(routes: RoutePlaybackModel[]): void {
  if (routes.length === 0) {
    throw new Error('Playback requiere al menos una ruta optimizada.');
  }
  if (routes.length > ROUTE_PLAYBACK_MAX_ROUTES) {
    throw new Error(`Playback admite como máximo ${ROUTE_PLAYBACK_MAX_ROUTES} rutas simultáneas.`);
  }
}
