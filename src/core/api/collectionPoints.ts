import type { ContainerCollection } from '../types/geo';
import { collectionPointsList, fillStatusFromLevel } from '../../data/mock/collectionPoints';
import type { CollectionPoint } from '../types/collectionPoint';
import { containersData } from '../../data/mock/containers';
import { apiDownload, apiGet, apiPatch, apiPost, apiDelete, withMockFallback } from './client';
import {
  buildCollectionPointsSummary,
  detailToCollectionPoint,
  simulateFillHistoryForPoint,
  type CollectionPointDetail,
  type CollectionPointFillHistory,
  type CollectionPointsSummary,
  type CollectionPointOptimizationContext,
} from '../utils/collectionPointsUtils';
import {
  readLastOptimizedCodes,
  readLocalPriorityBoostCodes,
} from '../utils/collectionPointsOptimization';
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
    numericId: feature.properties.numericId,
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

export interface PlanningCollectionPointRef {
  id: number;
  code: string;
  sectorName?: string | null;
}

function resolvePlanningCollectionPointId(
  properties: ContainerCollection['features'][number]['properties'],
  fallbackIndex: number,
): number | null {
  const explicit = properties.pointId ?? properties.numericId;
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  const parsed = Number(properties.id);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  // Mocks sin pointId (p. ej. CNT-001): índice estable para desarrollo local.
  return fallbackIndex + 1;
}

export function fetchCollectionPointsForPlanning(): Promise<PlanningCollectionPointRef[]> {
  return fetchCollectionPoints().then((geo) =>
    geo.features
      .map((feature, index) => {
        const id = resolvePlanningCollectionPointId(feature.properties, index);
        if (id == null) return null;
        return {
          id,
          code: String(feature.properties.id),
          sectorName: feature.properties.sector,
        };
      })
      .filter((row): row is PlanningCollectionPointRef => row != null),
  );
}

export interface SectorOption {
  id: number;
  name: string;
}

export interface CollectionPointWritePayload {
  sectorId: number;
  code?: string;
  latitude: number;
  longitude: number;
  maxCapacityKg: number;
  currentFillLevelKg?: number;
  status?: string;
}

export interface CollectionPointUpdatePayload {
  sectorId?: number;
  latitude?: number;
  longitude?: number;
  maxCapacityKg?: number;
  currentFillLevelKg?: number;
  status?: string;
  priorityBoost?: boolean;
}

export interface CollectionPointOptimizationContext {
  lastOptimizedCodes: string[];
  lastOptimizedAt: string | null;
  priorityBoostCodes: string[];
  criticalCount: number;
}

const MOCK_SECTOR_OPTIONS: SectorOption[] = [
  { id: 1, name: 'Terrazas del caroni A-B-C' },
  { id: 2, name: 'Terrazas del aluminio' },
  { id: 3, name: 'Villa Betania' },
  { id: 4, name: 'Mini fincas' },
  { id: 5, name: 'Villa Ikabaru' },
  { id: 6, name: 'Rio negro' },
  { id: 7, name: 'Los Bucares' },
  { id: 8, name: 'La Pastoreña' },
  { id: 9, name: 'Altos de Caroní' },
  { id: 10, name: 'Manuelita Saenz' },
  { id: 11, name: 'Las Mercedes' },
  { id: 12, name: 'Rio Aro' },
  { id: 13, name: 'Res Caroni plaza A-B-C-D' },
  { id: 14, name: 'Paratepuy' },
  { id: 15, name: 'Las Garzas' },
  { id: 16, name: 'Las Peonias' },
  { id: 17, name: 'Sierra Parima' },
  { id: 18, name: 'Unare I' },
  { id: 19, name: 'Villa Caroni' },
  { id: 20, name: 'El tiamo Country Club' },
  { id: 21, name: 'Isla Dorada' },
  { id: 22, name: 'Isla Coral' },
  { id: 23, name: 'Isla Bonita' },
  { id: 24, name: 'Villa Guayana' },
  { id: 25, name: 'Yuruani' },
  { id: 26, name: 'Rio Yocoima' },
  { id: 27, name: 'Uchire' },
  { id: 28, name: 'Curagua B' },
  { id: 29, name: 'Don Guillermo' },
  { id: 30, name: 'Caujaro' },
  { id: 31, name: 'Bloques de Curagua' },
  { id: 32, name: 'Villa Apso' },
  { id: 33, name: 'Las palmeras I y II' },
  { id: 34, name: 'Yara Yara I y II' },
  { id: 35, name: 'Guamo A-B-C' },
  { id: 36, name: 'Barrio Guayana' },
  { id: 37, name: 'El caimito 1-2-3-4' },
  { id: 38, name: 'Urb. Villa del Caroní' },
  { id: 39, name: 'Unare II' },
  { id: 40, name: 'UD 292' },
  { id: 41, name: 'Rio Cuyuní' },
  { id: 42, name: 'Ventuari' },
  { id: 43, name: 'Villa Yenisha' },
  { id: 44, name: 'Res. Atlantico Plaza' },
  { id: 45, name: 'Camino Real' },
  { id: 46, name: 'Lomas del caroni' },
  { id: 47, name: 'Los Rosales' },
  { id: 48, name: 'Villa Victoria' },
  { id: 49, name: 'Colegio Integral Guayana' },
  { id: 50, name: 'Urb. Sur Aeropuerto' },
  { id: 51, name: 'Res. Prasanthy country' },
  { id: 52, name: 'Rio Caura' },
];

export function fetchSectorOptions(): Promise<SectorOption[]> {
  return withMockFallback(
    'collection-point-sector-options',
    () => apiGet<SectorOption[]>('/api/v1/collection-points/sector-options'),
    MOCK_SECTOR_OPTIONS,
  );
}

export function createCollectionPoint(
  payload: CollectionPointWritePayload & { code: string },
): Promise<CollectionPointDetail> {
  return apiPost<CollectionPointDetail>('/api/v1/collection-points', payload);
}

export function updateCollectionPoint(
  code: string,
  payload: CollectionPointUpdatePayload,
): Promise<CollectionPointDetail> {
  return apiPatch<CollectionPointDetail>(
    `/api/v1/collection-points/${encodeURIComponent(code)}`,
    payload,
  );
}

export function deleteCollectionPoint(code: string): Promise<{ code: string; deleted: boolean }> {
  return apiDelete<{ code: string; deleted: boolean }>(
    `/api/v1/collection-points/${encodeURIComponent(code)}`,
  );
}

export interface CollectionPointExportFilters {
  sector?: string;
  status?: string;
}

export function downloadCollectionPointsExport(
  filters?: CollectionPointExportFilters,
  filename = 'feromap-puntos-recoleccion.csv',
): Promise<void> {
  const params = new URLSearchParams({ format: 'csv' });
  if (filters?.sector) params.set('sector', filters.sector);
  if (filters?.status) params.set('status', filters.status);
  return apiDownload(
    `/api/v1/collection-points/export?${params.toString()}`,
    filename,
  );
}

function buildMockOptimizationContext(points: CollectionPoint[]): CollectionPointOptimizationContext {
  const lastOptimizedCodes = readLastOptimizedCodes();
  const fallbackCodes =
    lastOptimizedCodes.length > 0
      ? lastOptimizedCodes
      : points.filter((point) => point.fillLevel >= 70).slice(0, 8).map((point) => point.id);
  const priorityBoostCodes =
    readLocalPriorityBoostCodes().length > 0
      ? readLocalPriorityBoostCodes()
      : points.filter((point) => point.priorityBoost).map((point) => point.id);

  return {
    lastOptimizedCodes: fallbackCodes,
    lastOptimizedAt: null,
    priorityBoostCodes,
    criticalCount: points.filter((point) => point.status === 'critico').length,
  };
}

export function fetchCollectionPointsOptimizationContext(
  points: CollectionPoint[] = [],
): Promise<CollectionPointOptimizationContext> {
  return withMockFallback(
    'collection-points-optimization-context',
    () => apiGet<CollectionPointOptimizationContext>('/api/v1/collection-points/optimization-context'),
    buildMockOptimizationContext(points),
  );
}

export function fetchCollectionPointsSummary(): Promise<CollectionPointsSummary> {
  return withMockFallback(
    'collection-points-summary',
    () => apiGet<CollectionPointsSummary>('/api/v1/collection-points/summary'),
    buildCollectionPointsSummary(collectionPointsList),
  );
}

function findMockPoint(code: string): CollectionPoint | undefined {
  return collectionPointsList.find((point) => point.id === code);
}

export function fetchCollectionPointDetail(code: string): Promise<CollectionPointDetail> {
  return withMockFallback(
    `collection-point-detail-${code}`,
    () => apiGet<CollectionPointDetail>(`/api/v1/collection-points/${encodeURIComponent(code)}`),
    (() => {
      const point = findMockPoint(code);
      if (!point) throw new Error(`Punto no encontrado: ${code}`);
      return {
        code: point.id,
        id: point.id,
        label: point.label,
        address: point.address,
        sector: point.sector,
        sectorId: 0,
        fillLevel: point.fillLevel,
        status: point.status,
        active: point.active,
        containerType: point.containerType,
        capacityKg: point.capacityL,
        capacityL: point.capacityL,
        currentFillLevelKg: Math.round((point.fillLevel / 100) * point.capacityL),
        lastEmptiedAt: null,
        lastCollection: point.lastCollection,
        frequency: point.frequency,
        latitude: point.lat,
        longitude: point.lng,
        priorityBoost: readLocalPriorityBoostCodes().includes(point.id),
      } satisfies CollectionPointDetail;
    })(),
  );
}

export function fetchCollectionPointFillHistory(
  code: string,
  days = 7,
): Promise<CollectionPointFillHistory> {
  return withMockFallback(
    `collection-point-fill-history-${code}`,
    () =>
      apiGet<CollectionPointFillHistory>(
        `/api/v1/collection-points/${encodeURIComponent(code)}/fill-history?days=${days}`,
      ),
    simulateFillHistoryForPoint(
      findMockPoint(code) ?? { id: code, fillLevel: 50 },
      days,
    ),
  );
}

export {
  apiDistributionToFillDistribution,
  buildAnalyticsHref,
  buildCollectionPointsCsv,
  buildCollectionPointsSummary,
  buildSectorFilterOptions,
  computeCollectionPointsKpis,
  computeFillDistribution,
  detailToCollectionPoint,
  downloadCollectionPointsCsv,
  downloadCsvContent,
  enrichCollectionPointsWithOptimization,
  simulateFillHistoryForPoint,
  summaryKpisToCards,
  type CollectionPointOptimizationContext,
  type CollectionPointDetail,
  type CollectionPointFillHistory,
  type CollectionPointKpi,
  type CollectionPointOptimizationContext,
  type CollectionPointsSummary,
  type FillDistribution,
  type FillDistributionItem,
} from '../utils/collectionPointsUtils';
