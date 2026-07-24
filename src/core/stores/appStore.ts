import { createStore } from 'solid-js/store';
import type { ContainerFeature, FleetSummary, LayerVisibility, RouteCollection, SectorName } from '../../data/types/geo';
import { containersData } from '../../data/mock/containers';
import { sectorsData } from '../../data/mock/sectors';
import { routesMock } from '../../data/mock/routes';
import { snapRoutesToRoads } from '../services/routeSnapping';

interface AppState {
  layers: LayerVisibility;
  selectedContainer: ContainerFeature | null;
  selectedSector: SectorName | null;
  sidebarOpen: boolean;
  darkMode: boolean;
  routes: RouteCollection;
  routesSnapping: boolean;
  routesOnRoads: boolean;
  showOptimizedOnly: boolean;
  fleet: FleetSummary;
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
  sidebarOpen: true,
  darkMode: false,
  routes: routesMock,
  routesSnapping: false,
  routesOnRoads: false,
  showOptimizedOnly: false,
  fleet: {
    activeVehicles: 3,
    totalVehicles: 5,
    driversOnShift: 3,
  },
});

export const containers = containersData;
export const sectors = sectorsData;

export function toggleLayer(key: keyof LayerVisibility) {
  setState('layers', key, (v) => !v);
}

export function setSelectedContainer(container: ContainerFeature | null) {
  setState('selectedContainer', container);
}

export function setSelectedSector(sector: SectorName | null) {
  setState('selectedSector', sector);
}

export function toggleSidebar() {
  setState('sidebarOpen', (v) => !v);
}

export function toggleDarkMode() {
  setState('darkMode', (v) => {
    const next = !v;
    document.documentElement.classList.toggle('dark', next);
    return next;
  });
}

export function setRoutes(routes: RouteCollection) {
  setState('routes', routes);
}

/** Ajusta las polilíneas a la red vial usando OSRM (OpenStreetMap). */
export async function loadRoutesWithRoadSnapping(routes: RouteCollection) {
  setState('routesSnapping', true);
  try {
    const snapped = await snapRoutesToRoads(routes);
    setState('routes', snapped);
    setState('routesOnRoads', true);
  } finally {
    setState('routesSnapping', false);
  }
}

export function initRoadSnappedRoutes() {
  void loadRoutesWithRoadSnapping(routesMock);
}

export function showOptimizedRoute(show: boolean) {
  setState('layers', 'optimizedRoute', show);
  setState('showOptimizedOnly', show);
}

export function criticalContainers() {
  return containers.features.filter((f) => f.properties.fillLevel >= 80);
}

export { state as appState, setState as setAppState };
