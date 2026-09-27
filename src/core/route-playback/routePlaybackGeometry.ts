import {
  along,
  bearing,
  length,
  lineSlice,
  lineString,
  nearestPointOnLine,
} from '@turf/turf';
import { point } from '@turf/helpers';
import type { Feature, LineString } from 'geojson';
import type { RoutePlaybackCoordinate, RoutePlaybackStop } from './routePlaybackTypes';

const LENGTH_UNITS = 'kilometers' as const;

export interface RouteLineMetrics {
  coordinates: readonly RoutePlaybackCoordinate[];
  line: Feature<LineString>;
  totalLengthKm: number;
  /** Distancia acumulada desde el origen hasta cada vértice (misma longitud que `coordinates`). */
  cumulativeDistancesKm: readonly number[];
}

const metricsCache = new WeakMap<readonly RoutePlaybackCoordinate[], RouteLineMetrics>();

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toPosition(coordinates: RoutePlaybackCoordinate): [number, number] {
  return [coordinates[0], coordinates[1]];
}

/** Precomputa longitud total y distancias acumuladas por vértice (Fase 10.1). */
export function getRouteLineMetrics(
  coordinates: readonly RoutePlaybackCoordinate[],
): RouteLineMetrics | null {
  if (coordinates.length < 2) return null;

  const cached = metricsCache.get(coordinates);
  if (cached) return cached;

  const positions = coordinates.map(toPosition);
  const line = lineString(positions);
  const totalLengthKm = length(line, { units: LENGTH_UNITS });

  const cumulativeDistancesKm: number[] = [0];
  for (let index = 1; index < positions.length; index += 1) {
    const segment = lineString([positions[index - 1]!, positions[index]!]);
    cumulativeDistancesKm.push(
      cumulativeDistancesKm[index - 1]! + length(segment, { units: LENGTH_UNITS }),
    );
  }

  const metrics: RouteLineMetrics = {
    coordinates,
    line,
    totalLengthKm,
    cumulativeDistancesKm,
  };
  metricsCache.set(coordinates, metrics);
  return metrics;
}

function distanceKmForProgress(metrics: RouteLineMetrics, progress: number): number {
  if (metrics.totalLengthKm <= 0) return 0;
  return clamp01(progress) * metrics.totalLengthKm;
}

/** Devuelve la porción recorrida de la polilínea hasta `progress` normalizado [0, 1]. */
export function sliceLineCoordinates(
  coordinates: readonly RoutePlaybackCoordinate[],
  progress: number,
): RoutePlaybackCoordinate[] {
  if (coordinates.length < 2) return [...coordinates];
  if (progress <= 0) return [coordinates[0]!];
  if (progress >= 1) return [...coordinates];

  const metrics = getRouteLineMetrics(coordinates);
  if (!metrics || metrics.totalLengthKm <= 0) return [coordinates[0]!];

  const end = along(metrics.line, distanceKmForProgress(metrics, progress), {
    units: LENGTH_UNITS,
  });
  const sliced = lineSlice(point(positionsStart(coordinates)), end, metrics.line);
  return sliced.geometry.coordinates.map(
    (pair) => [pair[0], pair[1]] as RoutePlaybackCoordinate,
  );
}

function positionsStart(coordinates: readonly RoutePlaybackCoordinate[]): [number, number] {
  const first = coordinates[0]!;
  return [first[0], first[1]];
}

/** Posición [lng, lat] a `progress` normalizado a lo largo de la polilínea (por distancia). */
export function interpolateAlongLine(
  coordinates: readonly RoutePlaybackCoordinate[],
  progress: number,
): RoutePlaybackCoordinate {
  if (coordinates.length === 0) return [0, 0];
  if (coordinates.length === 1) return coordinates[0]!;
  if (progress <= 0) return coordinates[0]!;
  if (progress >= 1) return coordinates[coordinates.length - 1]!;

  const metrics = getRouteLineMetrics(coordinates);
  if (!metrics || metrics.totalLengthKm <= 0) return coordinates[0]!;

  const snapped = along(metrics.line, distanceKmForProgress(metrics, progress), {
    units: LENGTH_UNITS,
  });
  const [lng, lat] = snapped.geometry.coordinates;
  return [lng, lat];
}

/** Rumbo geográfico (grados desde el norte) en `progress` a lo largo de la polilínea. */
export function bearingAlongLine(
  coordinates: readonly RoutePlaybackCoordinate[],
  progress: number,
  lookAhead = 0.003,
): number {
  if (coordinates.length < 2) return 0;
  const from = interpolateAlongLine(coordinates, progress);
  const to = interpolateAlongLine(coordinates, Math.min(1, progress + lookAhead));
  if (from[0] === to[0] && from[1] === to[1]) {
    return bearingAlongLine(coordinates, Math.max(0, progress - lookAhead), lookAhead);
  }
  return bearing(point(from), point(to));
}

/** Proyecta una parada sobre la polilínea y devuelve progreso normalizado [0, 1] por distancia. */
export function stopLineProgress(
  coordinates: readonly RoutePlaybackCoordinate[],
  stop: RoutePlaybackStop,
): number {
  const metrics = getRouteLineMetrics(coordinates);
  if (!metrics || metrics.totalLengthKm <= 0) return 0;

  const nearest = nearestPointOnLine(metrics.line, point([stop.lng, stop.lat]), {
    units: LENGTH_UNITS,
  });
  const locationKm = nearest.properties.location ?? 0;
  return clamp01(locationKm / metrics.totalLengthKm);
}

/** Genera `count` vértices equiespaciados por distancia entre `start` y `end` (tests / utilidades). */
export function densifyLineByDistance(
  start: RoutePlaybackCoordinate,
  end: RoutePlaybackCoordinate,
  count: number,
): RoutePlaybackCoordinate[] {
  if (count < 2) return [start, end];
  const line = lineString([toPosition(start), toPosition(end)]);
  const totalKm = length(line, { units: LENGTH_UNITS });
  const coordinates: RoutePlaybackCoordinate[] = [start];
  for (let index = 1; index < count - 1; index += 1) {
    const snapped = along(line, (totalKm * index) / (count - 1), { units: LENGTH_UNITS });
    const [lng, lat] = snapped.geometry.coordinates;
    coordinates.push([lng, lat]);
  }
  coordinates.push(end);
  return coordinates;
}
