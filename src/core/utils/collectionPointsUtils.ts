import {
  fillStatusColor,
  type CollectionPoint,
  type FillStatus,
} from '../types/collectionPoint';

export type CollectionPointKpiTone = 'green' | 'amber' | 'red' | 'slate';

export interface CollectionPointKpi {
  id: string;
  title: string;
  value: number;
  unit: string;
  iconTone: CollectionPointKpiTone;
}

export interface FillDistributionItem {
  status: FillStatus;
  label: string;
  count: number;
  pct: number;
  color: string;
}

export interface FillDistribution {
  total: number;
  items: FillDistributionItem[];
}

const STATUS_LABELS: Record<FillStatus, string> = {
  critico: 'Crítico',
  lleno: 'Lleno',
  normal: 'Normal',
  parcial: 'Parcial',
  'fuera-de-servicio': 'Fuera de servicio',
};

function countByStatus(points: CollectionPoint[], status: FillStatus): number {
  return points.filter((p) => p.status === status).length;
}

function relativePct(count: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.round((count / total) * 100)}%`;
}

export function computeCatalogKpis(
  points: CollectionPoint[],
  sectorsFromSummary?: string[],
): CollectionPointKpi[] {
  const total = points.length;
  const active = points.filter((point) => point.active).length;
  const inactive = total - active;
  const sectorCount =
    sectorsFromSummary?.length ??
    new Set(points.map((point) => point.sector).filter(Boolean)).size;

  const kpis: CollectionPointKpi[] = [
    {
      id: 'total',
      title: 'Total de puntos',
      value: total,
      unit: 'contenedores',
      iconTone: 'green',
    },
    {
      id: 'sectors',
      title: 'Sectores cubiertos',
      value: sectorCount,
      unit: sectorCount === 1 ? 'sector' : 'sectores',
      iconTone: 'green',
    },
    {
      id: 'active',
      title: 'Puntos activos',
      value: active,
      unit: relativePct(active, total),
      iconTone: 'green',
    },
  ];

  if (inactive > 0) {
    kpis.push({
      id: 'inactive',
      title: 'Fuera de servicio',
      value: inactive,
      unit: relativePct(inactive, total),
      iconTone: 'slate',
    });
  }

  return kpis;
}

/** @deprecated Usar computeCatalogKpis para la franja superior de la vista. */
export function computeCollectionPointsKpis(points: CollectionPoint[]): CollectionPointKpi[] {
  return computeCatalogKpis(points);
}

export function computeFillDistribution(points: CollectionPoint[]): FillDistribution {
  const total = points.length;
  const statuses: FillStatus[] = ['critico', 'lleno', 'normal', 'parcial', 'fuera-de-servicio'];

  const items = statuses
    .map((status) => {
      const count = countByStatus(points, status);
      return {
        status,
        label: STATUS_LABELS[status],
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
        color: fillStatusColor(status),
      };
    })
    .filter((item) => item.count > 0);

  return { total, items };
}

export function buildSectorFilterOptions(sectorNames: string[]) {
  const unique = [...new Set(sectorNames.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  return [
    { value: '', label: 'Sector: Todos' },
    ...unique.map((name) => ({ value: name, label: name })),
  ];
}

export interface CollectionPointsSummaryKpis {
  total: number;
  critico: number;
  lleno: number;
  normal: number;
  parcial: number;
  fueraDeServicio: number;
}

export interface CollectionPointsSummaryDistributionItem {
  status: string;
  label: string;
  count: number;
  pct: number;
}

export interface CollectionPointsSummaryDistributionItem {
  status: string;
  label: string;
  count: number;
  pct: number;
}

export interface CollectionPointsSummary {
  kpis: CollectionPointsSummaryKpis;
  distribution: CollectionPointsSummaryDistributionItem[];
  sectors: string[];
}

export interface CollectionPointDetail {
  code: string;
  id: string;
  label: string;
  address: string;
  sector: string;
  sectorId: number;
  fillLevel: number;
  status: FillStatus;
  active: boolean;
  containerType: string;
  capacityKg: number;
  capacityL: number;
  currentFillLevelKg: number;
  lastEmptiedAt: string | null;
  lastCollection: string;
  frequency: string;
  latitude: number;
  longitude: number;
  priority?: string;
  priorityBoost?: boolean;
  fillRateFactorOverride?: number | null;
  /** Factor efectivo (override del punto o del sector). */
  fillRateFactor?: number;
}

export interface CollectionPointFillHistory {
  code: string;
  days: number;
  source: 'simulated' | 'waypoints';
  labels: string[];
  values: number[];
}

function apiStatusToFillStatus(status: string): FillStatus {
  if (status === 'fueraDeServicio') return 'fuera-de-servicio';
  if (status === 'critico' || status === 'lleno' || status === 'normal' || status === 'parcial') {
    return status;
  }
  return 'normal';
}

export function detailToCollectionPoint(detail: CollectionPointDetail): CollectionPoint {
  return {
    id: detail.id,
    label: detail.label,
    address: detail.address,
    sector: detail.sector,
    fillLevel: detail.fillLevel,
    status: detail.status,
    active: detail.active,
    containerType: detail.containerType,
    capacityL: detail.capacityL,
    lastCollection: detail.lastCollection,
    frequency: detail.frequency,
    lng: detail.longitude,
    lat: detail.latitude,
    priorityBoost: detail.priorityBoost,
  };
}

export function simulateFillHistoryForPoint(
  point: Pick<CollectionPoint, 'id' | 'fillLevel'>,
  days = 7,
): CollectionPointFillHistory {
  let seed = 0;
  for (const char of point.id) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  const random = (index: number) => {
    const x = Math.sin(seed + index * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  const current = point.fillLevel;
  const start = Math.max(5, current - Math.floor(18 + random(0) * 24));
  const values: number[] = [];

  for (let index = 0; index < days; index += 1) {
    const progress = index / Math.max(days - 1, 1);
    const noise = Math.floor(random(index + 1) * 9) - 4;
    const value = Math.round(start + (current - start) * progress + noise);
    values.push(Math.max(0, Math.min(100, value)));
  }

  if (values.length > 0) values[values.length - 1] = current;

  const labels = Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - index));
    return date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }).replace('.', '');
  });

  return {
    code: point.id,
    days,
    source: 'simulated',
    labels,
    values,
  };
}

export function summaryKpisToCards(
  kpis: CollectionPointsSummaryKpis,
  sectors: string[] = [],
  points: CollectionPoint[] = [],
): CollectionPointKpi[] {
  if (points.length > 0) {
    return computeCatalogKpis(points, sectors);
  }

  const total = kpis.total;
  const inactive = kpis.fueraDeServicio;
  const active = Math.max(total - inactive, 0);
  const sectorCount = sectors.length;

  const cards: CollectionPointKpi[] = [
    {
      id: 'total',
      title: 'Total de puntos',
      value: total,
      unit: 'contenedores',
      iconTone: 'green',
    },
    {
      id: 'sectors',
      title: 'Sectores cubiertos',
      value: sectorCount,
      unit: sectorCount === 1 ? 'sector' : 'sectores',
      iconTone: 'green',
    },
    {
      id: 'active',
      title: 'Puntos activos',
      value: active,
      unit: relativePct(active, total),
      iconTone: 'green',
    },
  ];

  if (inactive > 0) {
    cards.push({
      id: 'inactive',
      title: 'Fuera de servicio',
      value: inactive,
      unit: relativePct(inactive, total),
      iconTone: 'slate',
    });
  }

  return cards;
}

export function apiDistributionToFillDistribution(
  summary: CollectionPointsSummary,
): FillDistribution {
  return {
    total: summary.kpis.total,
    items: summary.distribution.map((item) => ({
      status: apiStatusToFillStatus(item.status),
      label: item.label,
      count: item.count,
      pct: item.pct,
      color: fillStatusColor(apiStatusToFillStatus(item.status)),
    })),
  };
}

export function buildCollectionPointsSummary(points: CollectionPoint[]): CollectionPointsSummary {
  const distribution = computeFillDistribution(points);
  const kpis: CollectionPointsSummaryKpis = {
    total: points.length,
    critico: countByStatus(points, 'critico'),
    lleno: countByStatus(points, 'lleno'),
    normal: countByStatus(points, 'normal'),
    parcial: countByStatus(points, 'parcial'),
    fueraDeServicio: countByStatus(points, 'fuera-de-servicio'),
  };

  return {
    kpis,
    distribution: distribution.items.map((item) => ({
      status: item.status === 'fuera-de-servicio' ? 'fueraDeServicio' : item.status,
      label: item.label,
      count: item.count,
      pct: item.pct,
    })),
    sectors: [...new Set(points.map((p) => p.sector).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'es'),
    ),
  };
}

const EXPORT_STATUS_LABELS: Record<FillStatus, string> = {
  critico: 'Crítico',
  lleno: 'Lleno',
  normal: 'Normal',
  parcial: 'Parcial',
  'fuera-de-servicio': 'Fuera de servicio',
};

function escapeCsvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCollectionPointsCsv(points: CollectionPoint[]): string {
  const headers = [
    'ID',
    'Sector',
    'Llenado %',
    'Estado',
    'Latitud',
    'Longitud',
    'Última recolección',
  ];
  const rows = points.map((point) => [
    point.id,
    point.sector,
    point.fillLevel,
    EXPORT_STATUS_LABELS[point.status],
    point.lat,
    point.lng,
    point.lastCollection,
  ]);

  return [headers, ...rows]
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
    .join('\n');
}

export function downloadCsvContent(content: string, filename: string): void {
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadCollectionPointsCsv(
  points: CollectionPoint[],
  filename = 'feromap-puntos-recoleccion.csv',
): void {
  downloadCsvContent(buildCollectionPointsCsv(points), filename);
}

export function buildAnalyticsHref(options?: { sector?: string }): string {
  const params = new URLSearchParams({ focus: 'collection-points' });
  if (options?.sector) params.set('sector', options.sector);
  return `/analytics?${params.toString()}`;
}

export interface CollectionPointOptimizationContext {
  lastOptimizedCodes: string[];
  lastOptimizedAt: string | null;
  priorityBoostCodes: string[];
  criticalCount: number;
  overloadedCodes: string[];
}

export function enrichCollectionPointsWithOptimization(
  points: CollectionPoint[],
  context: CollectionPointOptimizationContext,
): CollectionPoint[] {
  const lastOptimized = new Set(context.lastOptimizedCodes);
  const boosted = new Set(context.priorityBoostCodes);
  return points.map((point) => ({
    ...point,
    usedInLastOptimization: lastOptimized.has(point.id),
    priorityBoost: boosted.has(point.id) || Boolean(point.priorityBoost),
  }));
}
