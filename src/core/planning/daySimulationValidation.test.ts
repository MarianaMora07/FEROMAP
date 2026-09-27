import { describe, expect, it } from 'vitest';
import { mockDaySimulation } from '../../data/mock/daySimulation';
import { isDaySimulation, normalizeDaySimulation } from './daySimulationValidation';

describe('daySimulation validation', () => {
  it('accepts the mock payload', () => {
    const payload = mockDaySimulation(2);
    expect(isDaySimulation(payload)).toBe(true);
    expect(payload.steps).toHaveLength(2);
    payload.steps.forEach((step) => expect(step.alternativeRoutes.length).toBeGreaterThan(0));
  });

  it('allows an empty sequence (day without routes)', () => {
    const payload = { ...mockDaySimulation(2), baseRoutes: [], steps: [] };
    expect(isDaySimulation(payload)).toBe(true);
  });

  it('rejects an unknown resolution', () => {
    const payload = mockDaySimulation(2);
    const broken = { ...payload, steps: [{ ...payload.steps[0], resolution: 'exploded' }] };
    expect(isDaySimulation(broken)).toBe(false);
  });

  it('rejects a target without vehicle or point', () => {
    const payload = mockDaySimulation(2);
    const broken = { ...payload, steps: [{ ...payload.steps[0], target: {} }] };
    expect(isDaySimulation(broken)).toBe(false);
  });

  it('rejects non-numeric atMinutes', () => {
    const payload = mockDaySimulation(2);
    const broken = { ...payload, steps: [{ ...payload.steps[0], atMinutes: 'soon' }] };
    expect(isDaySimulation(broken)).toBe(false);
  });

  it('normalizes by dropping invalid alternative routes and sorting steps', () => {
    const payload = mockDaySimulation(2);
    const raw = {
      ...payload,
      steps: [
        { ...payload.steps[1], atMinutes: 400 },
        { ...payload.steps[0], atMinutes: 120, alternativeRoutes: [{ routeId: 'x' }] },
      ],
    };

    const normalized = normalizeDaySimulation(raw);

    expect(normalized).not.toBeNull();
    expect(normalized?.steps.map((step) => step.atMinutes)).toEqual([120, 400]);
    expect(normalized?.steps[0]?.alternativeRoutes).toEqual([]);
    expect(normalized?.steps[1]?.alternativeRoutes.length).toBeGreaterThan(0);
  });

  it('clamps atMinutes into the operation window', () => {
    const payload = mockDaySimulation(2);
    const normalized = normalizeDaySimulation({
      ...payload,
      steps: [{ ...payload.steps[0], atMinutes: 99_999 }],
    });

    expect(normalized?.steps[0]?.atMinutes).toBe(payload.operationMinutes);
  });

  it('returns null when the base structure is missing', () => {
    expect(normalizeDaySimulation({ operationDate: '2026-09-14' })).toBeNull();
    expect(normalizeDaySimulation('nope')).toBeNull();
    expect(normalizeDaySimulation(null)).toBeNull();
  });

  it('accepts the mock with plan KPIs', () => {
    const payload = mockDaySimulation(2);
    expect(isDaySimulation(payload)).toBe(true);
    expect(payload.steps[0]?.reassignedPoints).toBe(3);
    expect(payload.steps[0]?.stabilityPct).not.toBeNull();
  });

  it('keeps backwards compatibility when the KPIs are absent', () => {
    const payload = mockDaySimulation(2);
    const legacy = {
      ...payload,
      steps: payload.steps.map((step) => {
        const {
          reassignedPoints,
          beforeDistanceKm,
          afterDistanceKm,
          distanceDeltaKm,
          baseStops,
          stabilityPct,
          droppedDetails,
          ...rest
        } = step;
        return rest;
      }),
    };
    expect(isDaySimulation(legacy)).toBe(true);
  });

  it('rejects invalid dropped details', () => {
    const payload = mockDaySimulation(2);
    const broken = {
      ...payload,
      steps: [{ ...payload.steps[0], droppedDetails: [{ code: '' }] }],
    };
    expect(isDaySimulation(broken)).toBe(false);
  });

  it('drops invalid dropped details when normalizing', () => {
    const payload = mockDaySimulation(2);
    const raw = {
      ...payload,
      steps: [
        {
          ...payload.steps[0],
          droppedDetails: [
            { code: 'CNT-1', fillPct: 95, criticality: 'critico', priority: 160 },
            { code: '' },
          ],
        },
      ],
    };

    const normalized = normalizeDaySimulation(raw);

    expect(normalized?.steps[0]?.droppedDetails).toHaveLength(1);
    expect(normalized?.steps[0]?.droppedDetails?.[0]?.code).toBe('CNT-1');
  });
});
