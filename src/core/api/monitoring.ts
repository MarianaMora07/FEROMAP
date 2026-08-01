import {
  monitoringAlerts,
  monitoringKpis,
  liveFleet,
  routeProgress,
  type FleetLiveStatus,
  type LiveVehicle,
} from '../../data/mock/monitoring';
import { apiGet, apiPost, withMockFallback } from './client';

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
      fleetCounts: {
        total: 18,
        inRoute: 12,
        available: 4,
        maintenance: 1,
        inactive: 1,
      },
    },
  );
}

export function advanceActiveRoutes(): Promise<{ advanced: number; routes: unknown[] }> {
  return apiPost('/api/v1/routes/advance', {});
}

export type { FleetLiveStatus, LiveVehicle };
