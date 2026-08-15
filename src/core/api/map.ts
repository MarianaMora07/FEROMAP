import type { MapOperationalContext, MapContextFilters } from '../types/mapContext';
import { UNARE_BBOX_QUERY } from '../types/geo';
import {
  liveActivities,
  liveFleet,
  monitoringBins,
  monitoringMapRoutes,
} from '../../data/mock/monitoring';
import { mapGisMetrics, mapVehicles } from '../../data/mock/mapGis';
import { apiGet, withMockFallback } from './client';
import type { MonitoringStatus } from './monitoring';

export const MAP_CONTEXT_POLL_MS = 20_000;

function buildMockMapContext(): MapOperationalContext {
  return {
    vehicles: liveFleet,
    routes: monitoringMapRoutes,
    containers: {
      type: 'FeatureCollection',
      features: monitoringBins.map((bin) => ({
        type: 'Feature',
        properties: {
          id: bin.id,
          sector: 'Unare I',
          fillLevel: bin.status === 'critical' ? 92 : bin.status === 'full' ? 75 : 45,
          priority: 'media',
          lastCollection: '25/06/2026',
          capacityKg: 1200,
          bucket: bin.status,
        },
        geometry: {
          type: 'Point',
          coordinates: [bin.lng, bin.lat],
        },
      })),
    },
    mapMetrics: mapGisMetrics,
    liveActivities,
    updatedAt: new Date().toISOString(),
  };
}

function buildQuery(filters?: MapContextFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.sector) params.set('sector', filters.sector);
  if (filters.bbox) params.set('bbox', filters.bbox);
  if (filters.dailyPlanId != null) params.set('dailyPlanId', String(filters.dailyPlanId));
  if (filters.playbackDetails) params.set('playbackDetails', 'true');
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function fetchMapContext(filters?: MapContextFilters): Promise<MapOperationalContext> {
  const merged: MapContextFilters = { bbox: UNARE_BBOX_QUERY, ...filters };
  return withMockFallback(
    'map-context',
    () => apiGet<MapOperationalContext>(`/api/v1/map/context${buildQuery(merged)}`),
    buildMockMapContext(),
  );
}

export function mapContextFromMonitoring(status: MonitoringStatus): MapOperationalContext {
  return {
    vehicles: status.liveFleet,
    routes: status.routes ?? { type: 'FeatureCollection', features: [] },
    containers: status.containers ?? { type: 'FeatureCollection', features: [] },
    mapMetrics: status.mapMetrics ?? mapGisMetrics,
    liveActivities: status.liveActivities ?? liveActivities,
    updatedAt: status.updatedAt ?? new Date().toISOString(),
  };
}

export function vehiclesToGeoJson(vehicles: MapOperationalContext['vehicles']) {
  return {
    type: 'FeatureCollection' as const,
    features: vehicles.map((vehicle) => ({
      type: 'Feature' as const,
      properties: {
        id: vehicle.id,
        status: vehicle.status.replace('-', '_'),
        color: vehicle.color,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [vehicle.lng, vehicle.lat] as [number, number],
      },
    })),
  };
}

export type { MapOperationalContext, MapContextFilters };
