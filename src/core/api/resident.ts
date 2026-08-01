import { apiGet } from './client';

export interface ResidentSchedule {
  collectionDays: string;
  window: string;
  nextCollection: string;
  frequency: string;
}

export interface ResidentCollectionPoint {
  id: string;
  address: string;
  fillLevel: number;
  status: string;
  lastEmptiedAt?: string | null;
  lng: number;
  lat: number;
}

export interface ResidentActiveRoute {
  routeId: number;
  vehicle: string;
  status: string;
  stopsInSector: number;
  pendingStops: number;
  nextStop?: string | null;
}

export interface ResidentOverview {
  sectorName: string;
  schedule: ResidentSchedule;
  collectionPoints: ResidentCollectionPoint[];
  activeRoutesInSector: ResidentActiveRoute[];
  alerts: Array<{ title: string; detail: string }>;
  stats: {
    totalPoints: number;
    criticalPoints: number;
    routesServingSector: number;
  };
}

export function fetchResidentOverview(): Promise<ResidentOverview> {
  return apiGet<ResidentOverview>('/api/v1/resident/overview');
}
