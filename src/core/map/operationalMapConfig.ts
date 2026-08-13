import maplibregl, {
  type LngLatBoundsLike,
  type Map as MapLibreMap,
  type MapOptions,
} from 'maplibre-gl';
import type { RouteCollection } from '../types/geo';
import { UNARE_BBOX_QUERY, UNARE_BOUNDS, UNARE_CENTER, UNARE_ZOOM } from '../types/geo';
import type { MapContextFilters } from '../types/mapContext';

export const OPERATIONAL_MAP_MIN_ZOOM = 12;
export const OPERATIONAL_MAP_MAX_ZOOM = 17;
export const OPERATIONAL_MAP_FIT_PADDING = 48;
export const OPERATIONAL_MAP_FIT_MAX_ZOOM = 15;

export interface CreateOperationalMapConfig {
  container: HTMLElement | string;
  style: MapOptions['style'];
  interactive?: boolean;
  minZoom?: number;
  maxZoom?: number;
  zoom?: number;
  attributionControl?: MapOptions['attributionControl'];
}

export interface OperationalMapFitInput {
  vehicles?: Array<{ lng: number; lat: number }>;
  routes?: RouteCollection;
  points?: Array<{ lng: number; lat: number }>;
  padding?: number;
  maxZoom?: number;
  duration?: number;
}

export function createOperationalMapOptions(config: CreateOperationalMapConfig): MapOptions {
  return {
    container: config.container,
    style: config.style,
    center: UNARE_CENTER,
    zoom: config.zoom ?? UNARE_ZOOM,
    minZoom: config.minZoom ?? OPERATIONAL_MAP_MIN_ZOOM,
    maxZoom: config.maxZoom ?? OPERATIONAL_MAP_MAX_ZOOM,
    maxBounds: UNARE_BOUNDS,
    attributionControl: config.attributionControl ?? false,
    interactive: config.interactive ?? true,
  };
}

export function operationalMapContextFilters(extra?: MapContextFilters): MapContextFilters {
  return { bbox: UNARE_BBOX_QUERY, ...extra };
}

function collectOperationalCoordinates(input: OperationalMapFitInput): Array<[number, number]> {
  const coords: Array<[number, number]> = [];

  for (const vehicle of input.vehicles ?? []) {
    if (Number.isFinite(vehicle.lng) && Number.isFinite(vehicle.lat)) {
      coords.push([vehicle.lng, vehicle.lat]);
    }
  }

  for (const feature of input.routes?.features ?? []) {
    if (feature.geometry.type !== 'LineString') continue;
    for (const pair of feature.geometry.coordinates) {
      if (pair.length >= 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1])) {
        coords.push([pair[0], pair[1]]);
      }
    }
  }

  for (const point of input.points ?? []) {
    if (Number.isFinite(point.lng) && Number.isFinite(point.lat)) {
      coords.push([point.lng, point.lat]);
    }
  }

  return coords;
}

export function fitMapToOperationalData(map: MapLibreMap, input: OperationalMapFitInput = {}): void {
  const padding = input.padding ?? OPERATIONAL_MAP_FIT_PADDING;
  const maxZoom = input.maxZoom ?? OPERATIONAL_MAP_FIT_MAX_ZOOM;
  const duration = input.duration ?? 800;
  const coords = collectOperationalCoordinates(input);

  if (coords.length === 0) {
    map.flyTo({
      center: UNARE_CENTER,
      zoom: UNARE_ZOOM,
      essential: true,
      duration,
    });
    return;
  }

  if (coords.length === 1) {
    map.flyTo({
      center: coords[0],
      zoom: Math.max(map.getZoom(), 14),
      essential: true,
      duration,
    });
    return;
  }

  const bounds = coords.reduce(
    (acc, coord) => acc.extend(coord),
    new maplibregl.LngLatBounds(coords[0], coords[0]),
  );

  map.fitBounds(bounds as LngLatBoundsLike, { padding, maxZoom, duration });
}
