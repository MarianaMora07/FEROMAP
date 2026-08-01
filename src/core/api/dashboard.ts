import {
  activeRoutes,
  dashboardKpis,
  dashboardSummary as mockDashboardSummary,
  fleetStatus,
  recentAlerts,
  sectorFillLevels,
  weeklyTons,
} from '../../data/mock/dashboard';
import { apiGet, withMockFallback } from './client';

export interface DashboardMapMetric {
  id: string;
  label: string;
  value: number;
  tone: string;
  icon: string;
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
}

export interface DashboardViewModel {
  summary: DashboardSummary;
  kpis: typeof dashboardKpis;
  fleetStatus: typeof fleetStatus;
  sectorFillLevels: typeof sectorFillLevels;
  recentAlerts: typeof recentAlerts;
  activeRoutes: typeof activeRoutes;
  weeklyTons: typeof weeklyTons;
}

function mapSummaryToViewModel(summary: DashboardSummary): DashboardViewModel {
  const total = summary.metrics.totalContainers || 1;
  const critical = summary.metrics.criticalContainers;
  const full = summary.metrics.fullContainers;

  return {
    summary,
    kpis: {
      wasteTons: { value: '28.45', unit: 'toneladas', trend: 12 },
      routes: {
        done: summary.metrics.routesInProgress,
        total: Math.max(summary.metrics.routesInProgress + 6, 24),
      },
      vehicles: {
        active: summary.fleet.activeVehicles,
        total: summary.fleet.totalVehicles,
      },
      alerts: { count: summary.notifications },
    },
    fleetStatus: {
      total: summary.fleet.totalVehicles,
      items: [
        {
          label: 'Activos',
          count: summary.fleet.activeVehicles,
          pct: Math.round((summary.fleet.activeVehicles / summary.fleet.totalVehicles) * 100) || 0,
          color: '#34D634',
        },
        {
          label: 'En mantenimiento',
          count: Math.max(1, Math.floor(summary.fleet.totalVehicles * 0.1)),
          pct: 11,
          color: '#1143F3',
        },
        {
          label: 'Fuera de servicio',
          count: Math.max(
            0,
            summary.fleet.totalVehicles - summary.fleet.activeVehicles - 1,
          ),
          pct: 6,
          color: '#f59e0b',
        },
        {
          label: 'Inactivos',
          count: 1,
          pct: 5,
          color: '#94a3b8',
        },
      ],
    },
    sectorFillLevels: summary.sectorFillLevels,
    recentAlerts: summary.criticalContainerList.slice(0, 3).map((item, index) => ({
      title: 'Contenedor crítico de llenado',
      detail: `${item.id} · ${item.sector} · ${item.fillLevel}%`,
      time: ['10:15 AM', '09:42 AM', '09:10 AM'][index] ?? '09:00 AM',
      tone: (index === 0 ? 'danger' : index === 1 ? 'warning' : 'info') as
        | 'danger'
        | 'warning'
        | 'info',
    })),
    activeRoutes,
    weeklyTons,
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
    } as DashboardSummary),
  );
}
