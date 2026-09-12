import { createStore } from 'solid-js/store';
import {
  fetchDashboardSummary,
  type DashboardSummary,
  type DashboardViewModel,
} from '../api/dashboard';

interface DashboardState {
  data: DashboardViewModel | null;
  loading: boolean;
  error: boolean;
}

/** Resumen neutral mientras cargan los datos (no inventar métricas). */
const EMPTY_SUMMARY: DashboardSummary = {
  greeting: '',
  subtitle: '',
  dateLabel: '',
  notifications: 0,
  user: { name: '', role: '', initials: '' },
  roleKpis: [],
  metrics: {
    totalContainers: 0,
    criticalContainers: 0,
    atRiskContainers: 0,
    fullContainers: 0,
    activeVehicles: 0,
    routesInProgress: 0,
    routesCompleted: 0,
    routesPlanned: 0,
  },
  fleet: { activeVehicles: 0, totalVehicles: 0, driversOnShift: 0 },
  criticalContainerList: [],
  atRiskContainers: [],
  sectorFillLevels: [],
  mapMetrics: [],
  fleetStatus: { total: 0, items: [] },
  activeRoutes: [],
  weeklyTons: { labels: [], values: [] },
  recentAlerts: [],
};

const [state, setState] = createStore<DashboardState>({
  data: null,
  loading: false,
  error: false,
});

export async function loadDashboardData(): Promise<void> {
  setState('loading', true);
  try {
    const data = await fetchDashboardSummary();
    setState({ data, error: false });
  } catch {
    // Sin mocks, un fallo de API deja el resumen neutral (no datos demo).
    setState({ data: null, error: true });
  } finally {
    setState('loading', false);
  }
}

export function dashboardSummary() {
  return state.data?.summary ?? EMPTY_SUMMARY;
}

export function dashboardView() {
  return state.data;
}

export { state as dashboardState };
