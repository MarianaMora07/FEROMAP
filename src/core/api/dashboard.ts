import {
  activeRoutes,
  dashboardKpis,
  dashboardSummary as mockDashboardSummary,
  fleetStatus,
  recentAlerts,
  sectorFillLevels,
  weeklyTons,
} from '../../data/mock/dashboard';
import type { KpiMetrics } from '../../data/types/simulation';
import { apiGet, withMockFallback } from './client';

export interface DashboardMapMetric {
  id: string;
  label: string;
  value: number;
  tone: string;
  icon: string;
}

export interface DashboardFleetStatus {
  total: number;
  items: Array<{ label: string; count: number; pct: number; color: string }>;
}

export interface DashboardActiveRoute {
  id: string;
  driver: string;
  vehicle: string;
  progress: number;
  tone: string;
  routeId?: number;
}

export interface DashboardRecentAlert {
  title: string;
  detail: string;
  time: string;
  tone: 'danger' | 'warning' | 'info';
}

export interface DashboardWeeklyTons {
  labels: string[];
  values: number[];
}

export interface DashboardSummary {
  greeting: string;
  subtitle: string;
  dateLabel: string;
  notifications: number;
  operatorsOnline: number;
  user: { name: string; role: string; initials: string };
  metrics: {
    totalContainers: number;
    criticalContainers: number;
    fullContainers: number;
    activeVehicles: number;
    routesInProgress: number;
  };
  fleet: {
    activeVehicles: number;
    totalVehicles: number;
    driversOnShift: number;
  };
  criticalContainerList: Array<{
    id: string;
    sector: string;
    fillLevel: number;
    priority: string;
  }>;
  sectorFillLevels: Array<{ name: string; pct: number }>;
  mapMetrics: DashboardMapMetric[];
  lastOptimization?: {
    simulationId: number;
    scenarioName: string;
    savingPercentage: number;
    executedAt: string | null;
    kpis: KpiMetrics;
  } | null;
  residentSchedule?: {
    sectorName: string;
    collectionDays: string;
    nextCollection: string;
    message: string;
  } | null;
  fleetStatus?: DashboardFleetStatus;
  activeRoutes?: DashboardActiveRoute[];
  weeklyTons?: DashboardWeeklyTons;
  recentAlerts?: DashboardRecentAlert[];
  planningSnapshot?: import('./planningAnalytics').PlanningDashboardSnapshot;
}

export interface DashboardViewModel {
  summary: DashboardSummary;
  kpis: typeof dashboardKpis;
  fleetStatus: typeof fleetStatus;
  sectorFillLevels: typeof sectorFillLevels;
  recentAlerts: typeof recentAlerts;
  activeRoutes: typeof activeRoutes;
  weeklyTons: typeof weeklyTons;
  lastOptimization: DashboardSummary['lastOptimization'];
}

function mapSummaryToViewModel(summary: DashboardSummary): DashboardViewModel {
  const lastOpt = summary.lastOptimization ?? null;
  const optKpis = lastOpt?.kpis;
  const alertCount = summary.recentAlerts?.length ?? summary.notifications;

  return {
    summary,
    lastOptimization: lastOpt,
    kpis: {
      wasteTons: {
        value: optKpis
          ? String((optKpis.distanceKm.current * 0.12).toFixed(2))
          : String((summary.weeklyTons?.values.at(-1) ?? 28.45).toFixed(2)),
        unit: 'toneladas',
        trend: lastOpt ? Math.max(0, Math.round(lastOpt.savingPercentage)) : 12,
      },
      routes: {
        done: summary.metrics.routesInProgress,
        total: Math.max(summary.metrics.routesInProgress + 6, 24),
      },
      vehicles: {
        active: summary.fleet.activeVehicles,
        total: summary.fleet.totalVehicles,
      },
      alerts: { count: alertCount },
    },
    fleetStatus: summary.fleetStatus ?? {
      total: summary.fleet.totalVehicles,
      items: [
        {
          label: 'Activos',
          count: summary.fleet.activeVehicles,
          pct: Math.round((summary.fleet.activeVehicles / summary.fleet.totalVehicles) * 100) || 0,
          color: '#34D634',
        },
      ],
    },
    sectorFillLevels: summary.sectorFillLevels,
    recentAlerts: summary.recentAlerts?.length
      ? summary.recentAlerts
      : summary.criticalContainerList.slice(0, 3).map((item, index) => ({
          title: 'Contenedor crítico de llenado',
          detail: `${item.id} · ${item.sector} · ${item.fillLevel}%`,
          time: ['10:15 AM', '09:42 AM', '09:10 AM'][index] ?? '09:00 AM',
          tone: (index === 0 ? 'danger' : index === 1 ? 'warning' : 'info') as
            | 'danger'
            | 'warning'
            | 'info',
        })),
    activeRoutes: summary.activeRoutes?.length ? summary.activeRoutes : activeRoutes,
    weeklyTons: summary.weeklyTons ?? weeklyTons,
  };
}

export function fetchDashboardSummary(): Promise<DashboardViewModel> {
  return withMockFallback(
    'dashboard-summary',
    async () => {
      const summary = await apiGet<DashboardSummary>('/api/v1/dashboard/summary');
      return mapSummaryToViewModel(summary);
    },
    mapSummaryToViewModel({
      ...mockDashboardSummary,
      metrics: {
        totalContainers: 20,
        criticalContainers: 6,
        fullContainers: 10,
        activeVehicles: 3,
        routesInProgress: 3,
      },
      fleet: { activeVehicles: 3, totalVehicles: 10, driversOnShift: 3 },
      criticalContainerList: [],
      sectorFillLevels,
      mapMetrics: [
        { id: 'total', label: 'Contenedores totales', value: 20, tone: 'green', icon: 'trash' },
        { id: 'critical', label: 'Contenedores críticos', value: 6, tone: 'red', icon: 'trash' },
        { id: 'full', label: 'Contenedores llenos', value: 10, tone: 'amber', icon: 'trash' },
        { id: 'vehicles', label: 'Vehículos activos', value: 3, tone: 'blue', icon: 'truck' },
        { id: 'routes', label: 'Rutas en ejecución', value: 3, tone: 'green', icon: 'route' },
      ],
      fleetStatus,
      activeRoutes,
      weeklyTons,
      recentAlerts,
    } as DashboardSummary),
  );
}
