import {
  analyticsEfficiencyIndicators,
  analyticsInsights,
  analyticsKpis,
  analyticsRoutePerformance,
  analyticsWasteTypes,
  evolutionSeries,
  heatmapPoints,
  hourlyDistribution,
} from '../../data/mock/analytics';
import type { AnalyticsFilters, AnalyticsHeatmapGeoJson } from '../types/analytics';
import { buildAnalyticsQuery } from '../utils/analyticsFilters';
import { apiGet, withMockFallback } from './client';

export interface AnalyticsSummary {
  kpis: Array<(typeof analyticsKpis)[number] & { sparkline: number[] }>;
  evolutionSeries: typeof evolutionSeries;
  wasteTypes: typeof analyticsWasteTypes;
  routePerformance: typeof analyticsRoutePerformance;
  hourlyDistribution: typeof hourlyDistribution;
  efficiencyIndicators: typeof analyticsEfficiencyIndicators;
  insights: typeof analyticsInsights;
}

function mapAnalyticsSummary(raw: AnalyticsSummary): AnalyticsSummary {
  return {
    ...raw,
    kpis: raw.kpis.map((kpi) => ({
      ...kpi,
      trend: kpi.sparkline?.at(-1) ?? 0,
      iconTone:
        kpi.iconTone === 'red'
          ? ('amber' as const)
          : (kpi.iconTone as (typeof analyticsKpis)[number]['iconTone']),
    })),
  };
}

export function fetchAnalyticsSummary(filters?: AnalyticsFilters): Promise<AnalyticsSummary> {
  const query = buildAnalyticsQuery(filters);
  return withMockFallback(
    'analytics-summary',
    async () => mapAnalyticsSummary(await apiGet<AnalyticsSummary>(`/api/v1/analytics/summary${query}`)),
    mapAnalyticsSummary({
      kpis: analyticsKpis,
      evolutionSeries,
      wasteTypes: analyticsWasteTypes,
      routePerformance: analyticsRoutePerformance,
      hourlyDistribution,
      efficiencyIndicators: analyticsEfficiencyIndicators,
      insights: analyticsInsights,
    }),
  );
}

export function fetchAnalyticsHeatmap(filters?: AnalyticsFilters): Promise<AnalyticsHeatmapGeoJson> {
  const heatmapFilters: AnalyticsFilters = {
    from: filters?.from,
    to: filters?.to,
    sector: filters?.sector,
  };
  const query = buildAnalyticsQuery(heatmapFilters);
  return withMockFallback(
    'analytics-heatmap',
    () => apiGet<AnalyticsHeatmapGeoJson>(`/api/v1/analytics/heatmap${query}`),
    heatmapPoints,
  );
}
