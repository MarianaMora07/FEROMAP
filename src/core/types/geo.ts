import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson';

/** Nombre de sector operativo (parroquia Unare). */
export type SectorName = string;

export type ContainerPriority = 'baja' | 'media' | 'alta' | 'critica';

export interface ContainerProperties {
  id: string;
  /** ID numérico en PostgreSQL — requerido para planificación semanal. */
  pointId?: number;
  sector: SectorName;
  fillLevel: number;
  priority: ContainerPriority;
  lastCollection: string;
  capacityKg: number;
}

export type ContainerFeature = Feature<Point, ContainerProperties>;
export type ContainerCollection = FeatureCollection<Point, ContainerProperties>;

export interface SectorProperties {
  name: SectorName;
  population: number;
  avgWasteKg: number;
}

export type SectorFeature = Feature<Polygon, SectorProperties>;
export type SectorCollection = FeatureCollection<Polygon, SectorProperties>;

export interface RouteStopProperties {
  sequence: number;
  lng: number;
  lat: number;
  code: string;
  stopType?: 'collection' | 'landfill';
}

export interface RouteProperties {
  id: string;
  type: 'current' | 'optimized';
  label: string;
  distanceKm: number;
  durationMin: number;
  stops?: RouteStopProperties[];
}

export type RouteFeature = Feature<LineString, RouteProperties>;
export type RouteCollection = FeatureCollection<LineString, RouteProperties>;

export interface LayerVisibility {
  sectors: boolean;
  containers: boolean;
  currentRoute: boolean;
  optimizedRoute: boolean;
}

export interface FleetSummary {
  activeVehicles: number;
  totalVehicles: number;
  driversOnShift: number;
}

/** Centro operativo (depósito) — Parroquia Unare. */
export const UNARE_CENTER: [number, number] = [-62.715, 8.295];
export const UNARE_ZOOM = 13.5;

/**
 * Área de estudio operativa (lon/lat).
 * Debe coincidir con `UNARE_BBOX` en `backend/app/services/graph_service.py`.
 */
export const UNARE_BBOX = {
  minLng: -62.81,
  minLat: 8.24,
  maxLng: -62.69,
  maxLat: 8.31,
} as const;

/** Límites MapLibre `maxBounds`: [[swLng, swLat], [neLng, neLat]]. */
export const UNARE_BOUNDS: [[number, number], [number, number]] = [
  [UNARE_BBOX.minLng, UNARE_BBOX.minLat],
  [UNARE_BBOX.maxLng, UNARE_BBOX.maxLat],
];

/** Query `bbox` para `/api/v1/map/context` (`minLng,minLat,maxLng,maxLat`). */
export const UNARE_BBOX_QUERY = `${UNARE_BBOX.minLng},${UNARE_BBOX.minLat},${UNARE_BBOX.maxLng},${UNARE_BBOX.maxLat}`;
