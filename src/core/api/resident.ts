import { apiGet } from './client';

export interface ResidentScheduleDay {
  date: string;
  weekday: number;
  label: string;
}

export interface ResidentSchedule {
  collectionDays: string;
  window: string;
  nextCollection: string;
  nextCollectionAt?: string | null;
  frequency: string;
  isCollectionDay: boolean;
  hasWeeklyPlan: boolean;
  hasSchedule: boolean;
  source: 'weekly_plan' | 'visit_schedules' | 'default' | 'none';
  calendar: ResidentScheduleDay[];
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

export type ResidentProximityStatus =
  | 'approaching'
  | 'in_sector'
  | 'completed'
  | 'not_scheduled'
  | 'no_active_route';

export interface ResidentProximity {
  status: ResidentProximityStatus;
  vehicleCode: string | null;
  routeId: number | null;
  estimatedMinutes: number | null;
  stopsBeforeSector: number;
  nextStopInSector: string | null;
  completedStopsInSector: number;
  totalStopsInSector: number;
  lastUpdatedAt: string;
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
  proximity: ResidentProximity;
  collectionPoints: ResidentCollectionPoint[];
  activeRoutesInSector: ResidentActiveRoute[];
  alerts: Array<{ title: string; detail: string }>;
  stats: {
    totalPoints: number;
    criticalPoints: number;
    atRiskPoints?: number;
    routesServingSector: number;
  };
}

export const RESIDENT_OVERVIEW_CACHE_TTL_MS = 12_000;

let residentOverviewCache: { data: ResidentOverview; at: number } | null = null;

export function fetchResidentOverview(options?: { force?: boolean }): Promise<ResidentOverview> {
  const now = Date.now();
  if (!options?.force && residentOverviewCache && now - residentOverviewCache.at < RESIDENT_OVERVIEW_CACHE_TTL_MS) {
    return Promise.resolve(residentOverviewCache.data);
  }
  return apiGet<ResidentOverview>('/api/v1/resident/overview').then((data) => {
    residentOverviewCache = { data, at: Date.now() };
    return data;
  });
}

export function fetchResidentProximity(): Promise<ResidentProximity> {
  return apiGet<ResidentProximity>('/api/v1/resident/proximity');
}
