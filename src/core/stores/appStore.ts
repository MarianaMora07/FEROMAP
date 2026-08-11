import { createStore } from 'solid-js/store';
import type {
  ContainerCollection,
  ContainerFeature,
  FleetSummary,
  LayerVisibility,
  RouteCollection,
  SectorCollection,
  SectorName,
} from '../../data/types/geo';
import { containersData } from '../../data/mock/containers';
import { sectorsData } from '../../data/mock/sectors';
import { routesMock } from '../../data/mock/routes';
import { fetchCollectionPoints } from '../api/collectionPoints';
import { fetchSectors } from '../api/sectors';
import { fetchAllRoutes } from '../api/routes';
import { loadDashboardData } from './dashboardStore';
import { useRoutesAsComputed } from '../services/routeSnapping';

interface AppState {
  layers: LayerVisibility;
  selectedContainer: ContainerFeature | null;
  selectedSector: SectorName | null;
  sidebarOpen: boolean;
  darkMode: boolean;
  containers: ContainerCollection;
  sectors: SectorCollection;
  routes: RouteCollection;
  routesSnapping: boolean;
  routesOnRoads: boolean;
  showOptimizedOnly: boolean;
  fleet: FleetSummary;
  dataReady: boolean;
  dataLoading: boolean;
}

const LG_MIN_WIDTH_MQ = '(min-width: 1024px)';

function initialSidebarOpen(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia(LG_MIN_WIDTH_MQ).matches;
}

const [state, setState] = createStore<AppState>({
  layers: {
    sectors: true,
    containers: true,
    currentRoute: true,
    optimizedRoute: false,
  },
  selectedContainer: null,
  selectedSector: null,
  sidebarOpen: initialSidebarOpen(),
  darkMode: false,
  containers: containersData,
  sectors: sectorsData,
  routes: routesMock,
  routesSnapping: false,
  routesOnRoads: false,
  showOptimizedOnly: false,
  fleet: {
    activeVehicles: 3,
    totalVehicles: 5,
    driversOnShift: 3,
  },
  dataReady: false,
  dataLoading: false,
});

let initPromise: Promise<void> | null = null;

export async function initAppData(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    setState('dataLoading', true);
    try {
      const [containers, sectors, routes] = await Promise.all([
        fetchCollectionPoints(),
        fetchSectors(),
        fetchAllRoutes(),
      ]);
      setState({
        containers,
        sectors,
        routes,
        dataReady: true,
      });
      await loadDashboardData();
      const view = (await import('./dashboardStore')).dashboardView();
      if (view?.summary.fleet) {
        setState('fleet', view.summary.fleet);
      }
    } finally {
      setState('dataLoading', false);
    }
  })();

  return initPromise;
}

export function toggleLayer(key: keyof LayerVisibility) {
  setState('layers', key, (v) => !v);
}

export function setSelectedContainer(container: ContainerFeature | null) {
  setState('selectedContainer', container);
}

export function setSelectedSector(sector: SectorName | null) {
  setState('selectedSector', sector);
}

export function setSidebarOpen(open: boolean) {
  setState('sidebarOpen', open);
}

export function toggleSidebar() {
  setState('sidebarOpen', (v) => !v);
}

/** Close overlay sidebar on viewports below the `lg` breakpoint. */
export function closeSidebarIfMobile() {
  if (typeof window === 'undefined') return;
  if (!window.matchMedia(LG_MIN_WIDTH_MQ).matches) {
    setState('sidebarOpen', false);
  }
}

export function toggleDarkMode() {
  setState('darkMode', (v) => {
    const next = !v;
    document.documentElement.classList.toggle('dark', next);
    return next;
  });
}

export function applyThemePreference(theme: 'light' | 'dark' | 'system') {
  const prefersDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  setState('darkMode', prefersDark);
  document.documentElement.classList.toggle('dark', prefersDark);
}

export async function refreshAppRoutes(): Promise<void> {
  const routes = await fetchAllRoutes();
  setState('routes', routes);
}

export function setRoutes(routes: RouteCollection) {
  setState('routes', routes);
}

export async function loadRoutesOnMap(routes: RouteCollection) {
  setState({
    routes: useRoutesAsComputed(routes),
    routesOnRoads: true,
    routesSnapping: false,
  });
}

/** @deprecated Usar loadRoutesOnMap — las rutas del API ya vienen sobre el grafo OSMnx. */
export async function loadRoutesWithRoadSnapping(routes: RouteCollection) {
  await loadRoutesOnMap(routes);
}

export async function initRoadSnappedRoutes() {
  await initAppData();
  await loadRoutesOnMap(state.routes);
}

export function showOptimizedRoute(show: boolean) {
  setState('layers', 'optimizedRoute', show);
  setState('showOptimizedOnly', show);
}

export function criticalContainers() {
  return state.containers.features.filter((f) => f.properties.fillLevel >= 80);
}

export { state as appState, setState as setAppState };
