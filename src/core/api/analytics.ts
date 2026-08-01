import {
  analyticsEfficiencyIndicators,
  analyticsInsights,
  analyticsKpis,
  analyticsRoutePerformance,
  analyticsWasteTypes,
  evolutionSeries,
  hourlyDistribution,
} from '../../data/mock/analytics';
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

export function fetchAnalyticsSummary(): Promise<AnalyticsSummary> {
  return withMockFallback(
    'analytics-summary',
    async () => mapAnalyticsSummary(await apiGet<AnalyticsSummary>('/api/v1/analytics/summary')),
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
