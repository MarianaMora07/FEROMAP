import { describe, expect, it } from 'vitest';
import { computeCatalogKpis } from './collectionPointsUtils';
import type { CollectionPoint } from '../types/collectionPoint';

function point(overrides: Partial<CollectionPoint>): CollectionPoint {
  return {
    id: 'CNT-000',
    label: 'Punto',
    address: 'Unare I',
    sector: 'Unare I',
    fillLevel: 40,
    status: 'normal',
    active: true,
    containerType: 'Estándar',
    capacityL: 1000,
    lastCollection: '—',
    frequency: 'Diaria',
    lng: -62.7,
    lat: 8.3,
    ...overrides,
  };
}

describe('computeCatalogKpis', () => {
  it('agrega la capacidad total de los contenedores', () => {
    const kpis = computeCatalogKpis([
      point({ id: 'CNT-001', capacityL: 1100 }),
      point({ id: 'CNT-002', capacityL: 900 }),
    ]);

    const capacity = kpis.find((kpi) => kpi.id === 'capacity');
    expect(capacity?.value).toBe(2000);
    expect(capacity?.unit).toBe('kg');
  });

  it('omite la capacidad cuando no hay contenedores', () => {
    const kpis = computeCatalogKpis([]);
    expect(kpis.find((kpi) => kpi.id === 'capacity')).toBeUndefined();
  });
});
