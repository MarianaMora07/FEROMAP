import type {
  DailyRoutePlaybackResponse,
  RoutePlaybackCoordinate,
  RoutePlaybackModel,
  RoutePlaybackStop,
  RoutePlaybackStopType,
  SimulationRoutePlaybackResponse,
} from './routePlaybackTypes';
import {
  ROUTE_PLAYBACK_LANDFILL_CODE,
  ROUTE_PLAYBACK_MAX_ROUTES,
  ROUTE_PLAYBACK_STOP_TYPES,
} from './routePlaybackTypes';

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

export function isRoutePlaybackStopType(value: unknown): value is RoutePlaybackStopType {
  return (
    typeof value === 'string' &&
    (ROUTE_PLAYBACK_STOP_TYPES as readonly string[]).includes(value)
  );
}

/** Infiere el tipo de parada cuando el payload legacy no trae `stopType`. */
export function inferRoutePlaybackStopType(
  code: string,
  stopType?: unknown,
): RoutePlaybackStopType {
  if (stopType === 'landfill') return 'landfill';
  if (stopType === 'collection') return 'collection';
  return code.toUpperCase() === ROUTE_PLAYBACK_LANDFILL_CODE ? 'landfill' : 'collection';
}

export function isLandfillPlaybackStop(stop: Pick<RoutePlaybackStop, 'code' | 'stopType'>): boolean {
  return stop.stopType === 'landfill';
}

/** Normaliza paradas crudas de API/map-context al contrato Fase 10. */
export function normalizeRoutePlaybackStop(value: unknown): RoutePlaybackStop | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<RoutePlaybackStop> & { stopType?: unknown };
  if (
    !isFiniteNumber(raw.sequence) ||
    !isFiniteNumber(raw.lng) ||
    !isFiniteNumber(raw.lat) ||
    typeof raw.code !== 'string' ||
    raw.code.length === 0 ||
    !isFiniteNumber(raw.serviceMinutes) ||
    raw.serviceMinutes <= 0
  ) {
    return null;
  }
  return {
    sequence: raw.sequence,
    lng: raw.lng,
    lat: raw.lat,
    code: raw.code,
    serviceMinutes: raw.serviceMinutes,
    stopType: inferRoutePlaybackStopType(raw.code, raw.stopType),
  };
}

export function isRoutePlaybackStop(value: unknown): value is RoutePlaybackStop {
  const normalized = normalizeRoutePlaybackStop(value);
  if (!normalized) return false;
  if (!value || typeof value !== 'object') return false;
  const stop = value as RoutePlaybackStop;
  if (stop.stopType !== undefined && !isRoutePlaybackStopType(stop.stopType)) {
    return false;
  }
  return true;
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
  const hasPlanId = typeof payload.dailyPlanId === 'number' && payload.dailyPlanId > 0;
  const hasSimulationId = typeof payload.simulationId === 'number' && payload.simulationId > 0;
  return (
    (hasPlanId || hasSimulationId) &&
    typeof payload.operationDate === 'string' &&
    typeof payload.previewMode === 'boolean' &&
    Array.isArray(payload.routes) &&
    payload.routes.length <= ROUTE_PLAYBACK_MAX_ROUTES &&
    payload.routes.every(isRoutePlaybackModel)
  );
}

export function isSimulationRoutePlaybackResponse(
  value: unknown,
): value is SimulationRoutePlaybackResponse {
  return (
    typeof payload.simulationId === 'number' &&
    payload.simulationId > 0 &&
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
