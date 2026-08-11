import type { RouteCollection } from '../../data/types/geo';

/**
 * Las rutas del API ya incluyen geometría sobre el grafo OSMnx local (build_tour_coordinates).
 * No se re-snapea con OSRM: evita latencia de red y mantiene coherencia con el motor ACO.
 */
export function useRoutesAsComputed(routes: RouteCollection): RouteCollection {
  return routes;
}

/** @deprecated Usar useRoutesAsComputed — conservado por compatibilidad de imports. */
export async function snapRoutesToRoads(routes: RouteCollection): Promise<RouteCollection> {
  return useRoutesAsComputed(routes);
}

/** @deprecated Las rutas del API ya vienen sobre vías; en mock se usan waypoints directos. */
export async function snapWaypointsToRoads(
  waypoints: [number, number][],
): Promise<[number, number][]> {
  return waypoints;
}
