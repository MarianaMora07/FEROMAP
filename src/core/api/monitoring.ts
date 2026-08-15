import {
  monitoringAlerts,
  monitoringKpis,
  liveFleet,
  liveActivities,
  monitoringBins,
  monitoringMapRoutes,
  routeProgress,
  type FleetLiveStatus,
  type LiveVehicle,
} from '../../data/mock/monitoring';
import { mapGisMetrics } from '../../data/mock/mapGis';
import { apiGet, apiPost, withMockFallback } from './client';

import type { ContainerCollection, RouteCollection } from '../types/geo';
import type { MapMetric, LiveActivity } from '../types/mapContext';

export interface MonitoringKpi {
  id: string;
  title: string;
  value: string;
  progress?: number;
  linkLabel?: string;
  iconTone: 'blue' | 'green' | 'red';
  icon: 'truck' | 'trash' | 'scale' | 'shield' | 'user';
}

export interface RouteProgressItem {
  label: string;
  done: number;
  total: number;
  pct: number;
  color: 'green' | 'blue' | 'purple' | 'amber';
}

export interface MonitoringAlertItem {
  title: string;
  detail: string;
  time: string;
  tone: 'danger' | 'warning';
}

export interface MonitoringStatus {
  kpis: MonitoringKpi[];
  liveFleet: LiveVehicle[];
  routeProgress: RouteProgressItem[];
  monitoringAlerts: MonitoringAlertItem[];
  fleetCounts: {
    total: number;
    inRoute: number;
    available: number;
    maintenance: number;
    inactive: number;
  };
  routes?: RouteCollection;
  containers?: ContainerCollection;
  mapMetrics?: MapMetric[];
  liveActivities?: LiveActivity[];
  updatedAt?: string;
  facilities?: import('../utils/landfillUx').MapFacilities;
}

export function fetchMonitoringStatus(): Promise<MonitoringStatus> {
  return withMockFallback(
    'monitoring-status',
    () => apiGet<MonitoringStatus>('/api/v1/monitoring/status'),
    {
      kpis: monitoringKpis,
      liveFleet,
      routeProgress,
      monitoringAlerts,
      routes: monitoringMapRoutes,
      containers: {
        type: 'FeatureCollection',
        features: monitoringBins.map((bin) => ({
          type: 'Feature',
          properties: {
            id: bin.id,
            sector: 'Unare I',
            fillLevel: bin.status === 'critical' ? 92 : bin.status === 'full' ? 75 : 45,
            priority: 'media',
            lastCollection: '25/06/2026',
            capacityKg: 1200,
            bucket: bin.status,
          },
          geometry: {
            type: 'Point',
            coordinates: [bin.lng, bin.lat],
          },
        })),
      },
      mapMetrics: mapGisMetrics,
      liveActivities,
      fleetCounts: {
        total: 18,
        inRoute: 12,
        available: 4,
        maintenance: 1,
        inactive: 1,
      },
      updatedAt: new Date().toISOString(),
    },
  );
}

export function advanceActiveRoutes(): Promise<{ advanced: number; routes: unknown[] }> {
  return apiPost('/api/v1/routes/advance', {});
}

export function advanceRouteById(
  routeId: number,
): Promise<{ routeId: number; progress: number; routeCompleted: boolean }> {
  return apiPost(`/api/v1/routes/${routeId}/advance`, {});
}

export type { FleetLiveStatus, LiveVehicle };
