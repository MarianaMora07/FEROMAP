import type { SectorCollection } from '../../data/types/geo';
import { sectorsData } from '../../data/mock/sectors';
import { apiGet, withMockFallback } from './client';

export function fetchSectors(): Promise<SectorCollection> {
  return withMockFallback(
    'sectors',
    () => apiGet<SectorCollection>('/api/v1/sectors'),
    sectorsData,
  );
}
