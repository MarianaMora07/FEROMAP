import type { AnalyticsFilters } from '../types/analytics';

export type ReportPeriodPreset = 'week' | 'month' | 'quarter' | 'custom';

export function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function defaultDateRange(days = 30): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: formatIsoDate(from), to: formatIsoDate(to) };
}

export function resolvePeriodRange(
  period: ReportPeriodPreset,
  start?: string,
  end?: string,
): { from: string; to: string } {
  if (period === 'custom' && start && end) {
    return { from: start, to: end };
  }

  const to = new Date();
  const from = new Date();

  switch (period) {
    case 'week':
      from.setDate(to.getDate() - 7);
      break;
    case 'month':
      from.setMonth(to.getMonth() - 1);
      break;
    case 'quarter':
      from.setMonth(to.getMonth() - 3);
      break;
    default:
      return defaultDateRange();
  }

  return { from: formatIsoDate(from), to: formatIsoDate(to) };
}

export function buildAnalyticsQuery(filters?: AnalyticsFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.granularity) params.set('granularity', filters.granularity);
  if (filters.sector) params.set('sector', filters.sector);
  const query = params.toString();
  return query ? `?${query}` : '';
}
