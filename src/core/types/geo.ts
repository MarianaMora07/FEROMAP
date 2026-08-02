import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson';

export type SectorName =
  | 'Unare I'
  | 'Unare II'
  | 'Unare III'
  | 'Río Caura'
  | 'Ventuari'
  | 'Curagua'
  | 'El Caimito'
  | 'Villa Ikabarú';

export type ContainerPriority = 'baja' | 'media' | 'alta' | 'critica';

export interface ContainerProperties {
  id: string;
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

export interface RouteProperties {
  id: string;
  type: 'current' | 'optimized';
  label: string;
  distanceKm: number;
  durationMin: number;
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

export const UNARE_CENTER: [number, number] = [-62.715, 8.295];
export const UNARE_ZOOM = 13.5;
