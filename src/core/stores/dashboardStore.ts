import { createStore } from 'solid-js/store';
import { fetchDashboardSummary, type DashboardViewModel } from '../api/dashboard';
import { dashboardSummary as mockSummary } from '../../data/mock/dashboard';

interface DashboardState {
  data: DashboardViewModel | null;
  loading: boolean;
}

const [state, setState] = createStore<DashboardState>({
  data: null,
  loading: false,
});

export async function loadDashboardData(): Promise<void> {
  setState('loading', true);
  try {
    const data = await fetchDashboardSummary();
    setState('data', data);
  } finally {
    setState('loading', false);
  }
}

export function dashboardSummary() {
  return state.data?.summary ?? {
    ...mockSummary,
    metrics: {
      totalContainers: 20,
      criticalContainers: 6,
      fullContainers: 10,
      activeVehicles: 3,
      routesInProgress: 3,
    },
    fleet: { activeVehicles: 3, totalVehicles: 10, driversOnShift: 3 },
    criticalContainerList: [],
    sectorFillLevels: [],
    mapMetrics: [],
  };
}

export function dashboardView() {
  return state.data;
}

export { state as dashboardState };
