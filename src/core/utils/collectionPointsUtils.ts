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

const KPI_STATUS_ORDER: FillStatus[] = ['normal', 'critico', 'lleno', 'parcial', 'fuera-de-servicio'];

const KPI_TONES: Record<FillStatus, CollectionPointKpiTone> = {
  normal: 'green',
  critico: 'amber',
  lleno: 'red',
  parcial: 'slate',
  'fuera-de-servicio': 'slate',
};

function countByStatus(points: CollectionPoint[], status: FillStatus): number {
  return points.filter((p) => p.status === status).length;
}

function relativePct(count: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.round((count / total) * 100)}%`;
}

export function computeCollectionPointsKpis(points: CollectionPoint[]): CollectionPointKpi[] {
  const total = points.length;

  const kpis: CollectionPointKpi[] = [
    {
      id: 'total',
      title: 'Total de puntos',
      value: total,
      unit: 'Unidades',
      iconTone: 'green',
    },
  ];

  for (const status of KPI_STATUS_ORDER) {
    const count = countByStatus(points, status);
    if (status === 'fuera-de-servicio' && count === 0) continue;

    kpis.push({
      id: status,
      title:
        status === 'normal'
          ? 'Puntos normales'
          : status === 'critico'
            ? 'Puntos críticos'
            : status === 'lleno'
              ? 'Puntos llenos'
              : status === 'parcial'
                ? 'Parcialmente llenos'
                : 'Fuera de servicio',
      value: count,
      unit: relativePct(count, total),
      iconTone: KPI_TONES[status],
    });
  }

  return kpis;
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

export function summaryKpisToCards(kpis: CollectionPointsSummaryKpis): CollectionPointKpi[] {
  const total = kpis.total;
  const pctLabel = (count: number) => relativePct(count, total);

  const cards: CollectionPointKpi[] = [
    {
      id: 'total',
      title: 'Total de puntos',
      value: total,
      unit: 'Unidades',
      iconTone: 'green',
    },
  ];

  const entries: Array<{ key: keyof CollectionPointsSummaryKpis; title: string; tone: CollectionPointKpiTone }> = [
    { key: 'normal', title: 'Puntos normales', tone: 'green' },
    { key: 'critico', title: 'Puntos críticos', tone: 'amber' },
    { key: 'lleno', title: 'Puntos llenos', tone: 'red' },
    { key: 'parcial', title: 'Parcialmente llenos', tone: 'slate' },
    { key: 'fueraDeServicio', title: 'Fuera de servicio', tone: 'slate' },
  ];

  for (const entry of entries) {
    const count = kpis[entry.key];
    if (entry.key === 'fueraDeServicio' && count === 0) continue;
    cards.push({
      id: entry.key === 'fueraDeServicio' ? 'fuera-de-servicio' : entry.key,
      title: entry.title,
      value: count,
      unit: pctLabel(count),
      iconTone: entry.tone,
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
