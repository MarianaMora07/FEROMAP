import { describe, expect, it } from 'vitest';
import {
  OPERATIONAL_ROUTE_MAP_STYLES,
  OPERATIONAL_ROUTE_STATUSES_ON_MAP,
  operationalRouteShownOnMap,
} from './operationalRoute';
import { UNARE_BBOX, UNARE_BBOX_QUERY, UNARE_BOUNDS, UNARE_CENTER } from './geo';

/** Espejo de `UNARE_BBOX` en backend/app/services/graph_service.py */
const BACKEND_UNARE_BBOX = [-62.81, 8.24, -62.69, 8.31] as const;

describe('UNARE geo constants', () => {
  it('aligns bbox with backend graph_service.UNARE_BBOX', () => {
    expect(UNARE_BBOX.minLng).toBe(BACKEND_UNARE_BBOX[0]);
    expect(UNARE_BBOX.minLat).toBe(BACKEND_UNARE_BBOX[1]);
    expect(UNARE_BBOX.maxLng).toBe(BACKEND_UNARE_BBOX[2]);
    expect(UNARE_BBOX.maxLat).toBe(BACKEND_UNARE_BBOX[3]);
  });

  it('builds maxBounds from bbox corners', () => {
    expect(UNARE_BOUNDS).toEqual([
      [UNARE_BBOX.minLng, UNARE_BBOX.minLat],
      [UNARE_BBOX.maxLng, UNARE_BBOX.maxLat],
    ]);
  });

  it('formats bbox query for map context API', () => {
    expect(UNARE_BBOX_QUERY).toBe('-62.81,8.24,-62.69,8.31');
  });

  it('keeps depot center inside bbox', () => {
    const [lng, lat] = UNARE_CENTER;
    expect(lng).toBeGreaterThanOrEqual(UNARE_BBOX.minLng);
    expect(lng).toBeLessThanOrEqual(UNARE_BBOX.maxLng);
    expect(lat).toBeGreaterThanOrEqual(UNARE_BBOX.minLat);
    expect(lat).toBeLessThanOrEqual(UNARE_BBOX.maxLat);
  });
});

describe('operational route map visibility', () => {
  it('includes pending and in_progress by default', () => {
    expect(OPERATIONAL_ROUTE_STATUSES_ON_MAP).toEqual(['pending', 'in_progress']);
  });

  it('styles pending as dashed and in_progress as solid', () => {
    expect(OPERATIONAL_ROUTE_MAP_STYLES.pending.linePattern).toBe('dashed');
    expect(OPERATIONAL_ROUTE_MAP_STYLES.in_progress.linePattern).toBe('solid');
  });

  it('shows completed as muted optional layer', () => {
    expect(OPERATIONAL_ROUTE_MAP_STYLES.completed.visibility).toBe('muted');
    expect(operationalRouteShownOnMap('completed')).toBe(true);
  });
});
