import type { FeatureCollection, Point } from 'geojson';

export type AnalyticsGranularity = 'daily' | 'weekly' | 'monthly';

export interface AnalyticsFilters {
  from?: string;
  to?: string;
  granularity?: AnalyticsGranularity;
  sector?: string;
}

export type ReportsFilters = AnalyticsFilters;

export type AnalyticsHeatmapGeoJson = FeatureCollection<Point, { weight: number; fillLevel?: number; sector?: string }>;
