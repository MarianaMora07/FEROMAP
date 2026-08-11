import length from '@turf/length';
import { lineString } from '@turf/helpers';
import type { RouteCollection } from '../../data/types/geo';

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

type LngLat = [number, number];

interface OsrmRouteResponse {
  code: string;
  routes?: Array<{
    geometry: { coordinates: LngLat[] };
    distance: number;
    duration: number;
  }>;
}

function coordsToOsrmString(coords: LngLat[]): string {
  return coords.map(([lng, lat]) => `${lng},${lat}`).join(';');
}

async function fetchOsrmRoute(waypoints: LngLat[]): Promise<LngLat[] | null> {
  if (waypoints.length < 2) return waypoints;

  const url = `${OSRM_BASE}/${coordsToOsrmString(waypoints)}?overview=full&geometries=geojson&steps=false`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as OsrmRouteResponse;
    if (data.code !== 'Ok' || !data.routes?.[0]?.geometry?.coordinates?.length) {
      return null;
    }
    return data.routes[0].geometry.coordinates;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Ruta segmento a segmento si falla la petición multi-parada. */
async function fetchOsrmRouteSegmented(waypoints: LngLat[]): Promise<LngLat[]> {
  const merged: LngLat[] = [];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const segment = await fetchOsrmRoute([waypoints[i], waypoints[i + 1]]);
    if (segment && segment.length >= 2) {
      merged.push(...(i === 0 ? segment : segment.slice(1)));
    } else {
      if (i === 0) merged.push(waypoints[i]);
      merged.push(waypoints[i + 1]);
    }
  }

  return merged;
}

export async function snapWaypointsToRoads(waypoints: LngLat[]): Promise<LngLat[]> {
  const full = await fetchOsrmRoute(waypoints);
  if (full && full.length >= 2) return full;
  return fetchOsrmRouteSegmented(waypoints);
}

export function distanceKmFromCoords(coords: LngLat[]): number {
  if (coords.length < 2) return 0;
  return Math.round(length(lineString(coords), { units: 'kilometers' }) * 10) / 10;
}

const snappedCache = new Map<string, LngLat[]>();

export async function snapRoutesToRoads(routes: RouteCollection): Promise<RouteCollection> {
  const features = await Promise.all(
    routes.features.map(async (feature) => {
      const waypoints = feature.geometry.coordinates as LngLat[];
      const cacheKey = feature.properties.id;
      const cached = snappedCache.get(cacheKey);
      const snapped = cached ?? (await snapWaypointsToRoads(waypoints));
      if (!cached) snappedCache.set(cacheKey, snapped);
      const distanceKm = distanceKmFromCoords(snapped);

      return {
        ...feature,
        properties: {
          ...feature.properties,
          distanceKm: distanceKm || feature.properties.distanceKm,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: snapped,
        },
      };
    })
  );

  return { type: 'FeatureCollection', features };
}
