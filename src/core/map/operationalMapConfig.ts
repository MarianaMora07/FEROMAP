import maplibregl, {
  type LngLatBoundsLike,
  type Map as MapLibreMap,
  type MapOptions,
} from 'maplibre-gl';
import type { RouteCollection, SectorCollection } from '../types/geo';
import { UNARE_BBOX_QUERY, UNARE_BOUNDS, UNARE_CENTER, UNARE_ZOOM } from '../types/geo';
import type { MapContextFilters } from '../types/mapContext';

export const OPERATIONAL_MAP_MIN_ZOOM = 12;
export const OPERATIONAL_MAP_MAX_ZOOM = 17;
export const OPERATIONAL_MAP_FIT_PADDING = 48;
export const OPERATIONAL_MAP_FIT_MAX_ZOOM = 15;
/** Zoom máximo al encuadrar el área de estudio (debe quedar ≥ minzoom tiles Unare = 12). */
export const STUDY_AREA_FIT_MAX_ZOOM = 12.5;
export const STUDY_AREA_MIN_ZOOM = OPERATIONAL_MAP_MIN_ZOOM;
export const STUDY_AREA_SQUARE_FIT_PADDING: maplibregl.PaddingOptions = {
  top: 96,
  bottom: 104,
  left: 96,
  right: 96,
};

export interface CreateOperationalMapConfig {
  container: HTMLElement | string;
  style: MapOptions['style'];
  interactive?: boolean;
  minZoom?: number;
  maxZoom?: number;
  zoom?: number;
  maxBounds?: LngLatBoundsLike;
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
    maxBounds: config.maxBounds ?? UNARE_BOUNDS,
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

export function boundsFromSectorCollection(sectors: SectorCollection): maplibregl.LngLatBounds | null {
  const bounds = new maplibregl.LngLatBounds();
  let hasPoints = false;

  for (const feature of sectors.features) {
    if (feature.geometry.type !== 'Polygon') continue;
    for (const ring of feature.geometry.coordinates) {
      for (const coord of ring) {
        if (coord.length >= 2 && Number.isFinite(coord[0]) && Number.isFinite(coord[1])) {
          bounds.extend([coord[0], coord[1]]);
          hasPoints = true;
        }
      }
    }
  }

  return hasPoints ? bounds : null;
}

/** Límites ampliados para que el mapa no recorte polígonos de sectores en el borde. */
export function studyAreaBoundsLike(sectors?: SectorCollection): LngLatBoundsLike {
  const sectorBounds = sectors ? boundsFromSectorCollection(sectors) : null;
  if (!sectorBounds) return UNARE_BOUNDS;

  const sw = sectorBounds.getSouthWest();
  const ne = sectorBounds.getNorthEast();
  const padLng = Math.max((ne.lng - sw.lng) * 0.14, 0.006);
  const padLat = Math.max((ne.lat - sw.lat) * 0.16, 0.005);

  return [
    [sw.lng - padLng, sw.lat - padLat],
    [ne.lng + padLng, ne.lat + padLat],
  ];
}

export function fitMapToStudyArea(
  map: MapLibreMap,
  options: {
    padding?: number | maplibregl.PaddingOptions;
    maxZoom?: number;
    duration?: number;
    sectors?: SectorCollection;
  } = {},
): void {
  const sectorBounds = options.sectors ? boundsFromSectorCollection(options.sectors) : null;
  const bounds = sectorBounds ?? new maplibregl.LngLatBounds(UNARE_BOUNDS[0], UNARE_BOUNDS[1]);

  map.fitBounds(bounds, {
    padding: options.padding ?? OPERATIONAL_MAP_FIT_PADDING,
    maxZoom: options.maxZoom ?? STUDY_AREA_FIT_MAX_ZOOM,
    duration: options.duration ?? 800,
  });
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
