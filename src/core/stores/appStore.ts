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
import {
  applyThemeToDocument,
  getStoredThemePreference,
  persistThemePreference,
  resolveDarkMode,
  type ThemePreference,
} from '../theme/themePreference';
import { updateProfilePreferences } from '../api/profile';

interface AppState {
  layers: LayerVisibility;
  selectedContainer: ContainerFeature | null;
  selectedSector: SectorName | null;
  sidebarOpen: boolean;
  darkMode: boolean;
  themePreference: ThemePreference;
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

const bootTheme: ThemePreference =
  typeof window !== 'undefined' ? getStoredThemePreference() : 'system';

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
  darkMode: typeof window !== 'undefined' ? resolveDarkMode(bootTheme) : false,
  themePreference: bootTheme,
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

export function applyThemePreference(theme: ThemePreference) {
  persistThemePreference(theme);
  const prefersDark = applyThemeToDocument(theme);
  setState({ darkMode: prefersDark, themePreference: theme });
}

async function persistThemeToProfile(theme: ThemePreference): Promise<void> {
  try {
    const { isAuthenticated } = await import('./authStore');
    if (!isAuthenticated()) return;
    await updateProfilePreferences({ theme });
  } catch {
    // offline / guest — localStorage already updated
  }
}

/** Sidebar toggle: alterna light ↔ dark y persiste en perfil si hay sesión. */
export async function toggleDarkMode(): Promise<void> {
  const nextTheme: ThemePreference = state.darkMode ? 'light' : 'dark';
  applyThemePreference(nextTheme);
  await persistThemeToProfile(nextTheme);
}

/** Perfil / API — aplica tema y opcionalmente sincroniza backend. */
export async function setThemePreference(
  theme: ThemePreference,
  options: { persistProfile?: boolean } = {},
): Promise<void> {
  applyThemePreference(theme);
  if (options.persistProfile !== false) {
    await persistThemeToProfile(theme);
  }
}

if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.themePreference === 'system') {
      applyThemePreference('system');
    }
  });
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
