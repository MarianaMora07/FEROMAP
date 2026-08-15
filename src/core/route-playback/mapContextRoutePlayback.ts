import type { Feature, LineString } from 'geojson';
import type { RoutePlaybackModel, RoutePlaybackStop } from './routePlaybackTypes';
import { assertPlaybackRouteCount } from './routePlaybackValidation';

/** Propiedades extendidas de ruta en `GET /map/context?playbackDetails=true`. */
export interface MapContextPlaybackRouteProperties {
  id: string;
  routeId: number;
  label: string;
  color: string;
  vehicleId: string;
  vehicleDbId?: number | null;
  status: string;
  routeKind: string;
  waypointsTotal: number;
  waypointsDone: number;
  stops?: RoutePlaybackStop[];
  totalDurationMinutes?: number;
  startTime?: string | null;
}

export type MapContextPlaybackRouteFeature = Feature<
  LineString,
  MapContextPlaybackRouteProperties
>;

function parseStops(raw: unknown): RoutePlaybackStop[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is RoutePlaybackStop => {
    if (!item || typeof item !== 'object') return false;
    const stop = item as RoutePlaybackStop;
    return (
      typeof stop.sequence === 'number' &&
      typeof stop.lng === 'number' &&
      typeof stop.lat === 'number' &&
      typeof stop.code === 'string' &&
      typeof stop.serviceMinutes === 'number'
    );
  });
}

export function mapContextFeatureToPlaybackModel(
  feature: MapContextPlaybackRouteFeature,
): RoutePlaybackModel | null {
  const props = feature.properties;
  const geometry = feature.geometry;
  if (!geometry || geometry.type !== 'LineString') return null;

  const coordinates = geometry.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const stops = parseStops(props.stops);
  if (stops.length === 0) return null;

  const totalDurationMinutes =
    typeof props.totalDurationMinutes === 'number' && props.totalDurationMinutes > 0
      ? props.totalDurationMinutes
      : Math.max(1, stops.reduce((sum, stop) => sum + stop.serviceMinutes, 0));

  const vehicleDbId = props.vehicleDbId;
  const routeId = props.routeId;

  return {
    routeId,
    vehicleId: typeof vehicleDbId === 'number' && vehicleDbId > 0 ? vehicleDbId : routeId,
    vehicleLabel: props.vehicleId || props.label,
    color: props.color,
    lineCoordinates: coordinates.map(
      (pair) => [pair[0], pair[1]] as RoutePlaybackModel['lineCoordinates'][number],
    ),
    stops,
    totalDurationMinutes,
    startTime: props.startTime ?? null,
  };
}

export function mapContextRoutesToPlaybackModels(
  features: MapContextPlaybackRouteFeature[],
): RoutePlaybackModel[] {
  const routes = features
    .map(mapContextFeatureToPlaybackModel)
    .filter((route): route is RoutePlaybackModel => route !== null);
  assertPlaybackRouteCount(routes);
  return routes;
}
