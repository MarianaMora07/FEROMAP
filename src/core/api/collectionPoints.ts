import type { ContainerCollection } from '../../data/types/geo';
import {
  collectionPointsList,
  fillStatusFromLevel,
  type CollectionPoint,
} from '../../data/mock/collectionPoints';
import { containersData } from '../../data/mock/containers';
import { apiGet, withMockFallback } from './client';

export interface CollectionPointFilters {
  sector?: string;
  minFill?: number;
}

function buildQuery(filters?: CollectionPointFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.sector) params.set('sector', filters.sector);
  if (filters.minFill != null) params.set('minFill', String(filters.minFill));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function fetchCollectionPoints(
  filters?: CollectionPointFilters,
): Promise<ContainerCollection> {
  const path = `/api/v1/collection-points${buildQuery(filters)}`;
  return withMockFallback(
    'collection-points',
    () => apiGet<ContainerCollection>(path),
    filters?.sector
      ? {
          ...containersData,
          features: containersData.features.filter(
            (f) => f.properties.sector === filters.sector,
          ),
        }
      : filters?.minFill != null
        ? {
            ...containersData,
            features: containersData.features.filter(
              (f) => f.properties.fillLevel >= (filters.minFill ?? 0),
            ),
          }
        :     containersData,
  );
}

function geoToCollectionPoints(geo: ContainerCollection): CollectionPoint[] {
  return geo.features.map((feature) => ({
    id: feature.properties.id,
    label: feature.properties.id,
    address: feature.properties.sector,
    sector: feature.properties.sector,
    fillLevel: feature.properties.fillLevel,
    status: fillStatusFromLevel(feature.properties.fillLevel),
    active: true,
    containerType: 'Estándar',
    capacityL: feature.properties.capacityKg,
    lastCollection: feature.properties.lastCollection,
    frequency: 'Diaria',
    lng: feature.geometry.coordinates[0],
    lat: feature.geometry.coordinates[1],
  }));
}

export function fetchCollectionPointsList(): Promise<CollectionPoint[]> {
  return withMockFallback(
    'collection-points-list',
    () => fetchCollectionPoints().then(geoToCollectionPoints),
    collectionPointsList,
  );
}
