import { describe, expect, it } from 'vitest';
import {
  activeCaseStudyPointIds,
  caseStudyContextForSimulation,
  normalizeCaseStudyCode,
  normalizeCaseStudyStatus,
  normalizeDefaultScenarioId,
  resolveOptimizationPointSource,
  resolvePointDemandKg,
} from './caseStudy';

describe('caseStudy contract', () => {
  it('normaliza código CE-', () => {
    expect(normalizeCaseStudyCode(' ce unare norte ')).toBe('CE-UNARE-NORTE');
    expect(normalizeCaseStudyCode('ce_multi_viaje')).toBe('CE-MULTI-VIAJE');
  });

  it('rechaza status y scenario inválidos', () => {
    expect(normalizeCaseStudyStatus('active')).toBe('active');
    expect(normalizeDefaultScenarioId('rain')).toBe('rain');
    expect(() => normalizeCaseStudyStatus('deleted')).toThrow(/status inválido/);
    expect(() => normalizeDefaultScenarioId('hurricane')).toThrow(/scenario_id inválido/);
  });

  it('prioridad: caso → request → all_active', () => {
    expect(
      resolveOptimizationPointSource({
        caseStudyId: 1,
        caseStudyPointIds: [3, 1, 2],
      }),
    ).toEqual({ source: 'case_study', collectionPointIds: [1, 2, 3] });

    expect(
      resolveOptimizationPointSource({
        requestCollectionPointIds: [5, 4],
      }),
    ).toEqual({ source: 'collection_point_ids', collectionPointIds: [4, 5] });

    expect(resolveOptimizationPointSource({})).toEqual({
      source: 'all_active',
      collectionPointIds: null,
    });
  });

  it('intersección caso ∩ request ids', () => {
    expect(
      resolveOptimizationPointSource({
        caseStudyId: 1,
        caseStudyPointIds: [1, 2, 3],
        requestCollectionPointIds: [2, 4],
      }),
    ).toEqual({ source: 'case_study', collectionPointIds: [2] });

    expect(() =>
      resolveOptimizationPointSource({
        caseStudyId: 1,
        caseStudyPointIds: [1],
        requestCollectionPointIds: [9],
      }),
    ).toThrow(/intersección vacía/);
  });

  it('resuelve demanda: override > catálogo', () => {
    const catalog = {
      collectionPointId: 10,
      maxCapacityKg: 1000,
      currentFillLevelKg: 400,
    };
    expect(resolvePointDemandKg(catalog, null).source).toBe('catalog');
    expect(
      resolvePointDemandKg(catalog, { collectionPointId: 10, fillLevelKgOverride: 900 }).source,
    ).toBe('fill_override');
    expect(
      resolvePointDemandKg(catalog, { collectionPointId: 10, demandKgOverride: 750 }).source,
    ).toBe('demand_override');
  });

  it('activeCaseStudyPointIds excluye inactivos', () => {
    expect(
      activeCaseStudyPointIds([
        { collectionPointId: 1, activeInStudy: true },
        { collectionPointId: 2, activeInStudy: false },
        { collectionPointId: 3 },
      ]),
    ).toEqual([1, 3]);
  });

  it('caseStudyContextForSimulation', () => {
    const ctx = caseStudyContextForSimulation({
      id: 7,
      code: 'CE-UNARE-NORTE',
      name: 'Unare Norte',
      pointMemberships: [
        { collectionPointId: 1 },
        { collectionPointId: 2, activeInStudy: false },
      ],
    });
    expect(ctx.caseStudyCode).toBe('CE-UNARE-NORTE');
    expect(ctx.activePointCount).toBe(1);
  });
});
