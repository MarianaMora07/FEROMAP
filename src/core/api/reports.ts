import {
  performanceSeries as mockPerformanceSeries,
  periodComparison as mockPeriodComparison,
  reportsKpis as mockReportsKpis,
  routePerformance as mockRoutePerformance,
  savedReports as mockSavedReports,
  wasteTypeDistribution as mockWasteTypeDistribution,
} from '../../data/mock/reports';
import { apiDownload, apiGet, withMockFallback } from './client';

export interface ReportsSummary {
  kpis: typeof mockReportsKpis;
  performanceSeries: typeof mockPerformanceSeries;
  wasteTypeDistribution: typeof mockWasteTypeDistribution;
  routePerformance: typeof mockRoutePerformance;
  periodComparison: typeof mockPeriodComparison;
  savedReports: typeof mockSavedReports;
}

export function fetchReportsSummary(): Promise<ReportsSummary> {
  return withMockFallback(
    'reports-summary',
    () => apiGet<ReportsSummary>('/api/v1/reports/summary'),
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

export function downloadReport(format: 'csv' | 'pdf'): Promise<void> {
  const ext = format === 'pdf' ? 'pdf' : 'csv';
  return apiDownload(`/api/v1/reports/export?format=${format}`, `feromap-simulaciones.${ext}`);
}
