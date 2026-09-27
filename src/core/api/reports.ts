import {
  performanceSeries as mockPerformanceSeries,
  periodComparison as mockPeriodComparison,
  reportsKpis as mockReportsKpis,
  routePerformance as mockRoutePerformance,
  savedReports as mockSavedReports,
  wasteTypeDistribution as mockWasteTypeDistribution,
} from '../../data/mock/reports';
import type { ReportsFilters } from '../types/analytics';
import { buildAnalyticsQuery } from '../utils/analyticsFilters';
import { apiDownload, apiGet, withMockFallback } from './client';

export interface ReportsSummary {
  kpis: typeof mockReportsKpis;
  performanceSeries: typeof mockPerformanceSeries;
  wasteTypeDistribution: typeof mockWasteTypeDistribution;
  routePerformance: typeof mockRoutePerformance;
  periodComparison: typeof mockPeriodComparison;
  savedReports: typeof mockSavedReports;
}

export function fetchReportsSummary(filters?: ReportsFilters): Promise<ReportsSummary> {
  const query = buildAnalyticsQuery(filters);
  return withMockFallback(
    'reports-summary',
    () => apiGet<ReportsSummary>(`/api/v1/reports/summary${query}`),
    {
      kpis: mockReportsKpis,
      performanceSeries: mockPerformanceSeries,
      wasteTypeDistribution: mockWasteTypeDistribution,
      routePerformance: mockRoutePerformance,
      periodComparison: mockPeriodComparison,
      savedReports: mockSavedReports,
    },
  );
}

export function downloadReport(format: 'csv' | 'pdf', filters?: ReportsFilters): Promise<void> {
  const ext = format === 'pdf' ? 'pdf' : 'csv';
  const query = buildAnalyticsQuery(filters);
  const separator = query ? '&' : '?';
  return apiDownload(
    `/api/v1/reports/export${query}${separator}format=${format}`,
    `feromap-simulaciones.${ext}`,
  );
}
