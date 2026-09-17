import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_ROUTE_HOURS_TARGET,
  OBJECTIVE_WEIGHT_UI_MAX,
  clampMaxRouteHoursTarget,
  clampObjectiveWeight,
  describeServiceLevel,
  formatObjectiveWeight,
  normalizeEstimatedDurationHours,
  normalizeObjectiveWeights,
} from './optimizationObjectiveUx';

describe('clampObjectiveWeight', () => {
  it('acota al rango visible de la UI (0–3)', () => {
    expect(clampObjectiveWeight(-2)).toBe(0);
    expect(clampObjectiveWeight(1.5)).toBe(1.5);
    expect(clampObjectiveWeight(10)).toBe(OBJECTIVE_WEIGHT_UI_MAX);
  });

  it('trata valores no finitos como 0', () => {
    expect(clampObjectiveWeight(Number.NaN)).toBe(0);
    expect(clampObjectiveWeight(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('clampMaxRouteHoursTarget', () => {
  it('acota la jornada objetivo a 1–18 h con default 8', () => {
    expect(clampMaxRouteHoursTarget(0)).toBe(1);
    expect(clampMaxRouteHoursTarget(30)).toBe(18);
    expect(clampMaxRouteHoursTarget(Number.NaN)).toBe(DEFAULT_MAX_ROUTE_HOURS_TARGET);
  });
});

describe('normalizeObjectiveWeights', () => {
  it('normaliza preferencias viejas o corruptas', () => {
    expect(normalizeObjectiveWeights(undefined)).toEqual({
      workloadBalanceWeight: 0,
      makespanWeight: 0,
    });
    expect(normalizeObjectiveWeights({ workloadBalanceWeight: 99, makespanWeight: -4 })).toEqual({
      workloadBalanceWeight: OBJECTIVE_WEIGHT_UI_MAX,
      makespanWeight: 0,
    });
  });
});

describe('normalizeEstimatedDurationHours', () => {
  it('deja null cuando no se recorta la jornada', () => {
    expect(normalizeEstimatedDurationHours(null)).toBeNull();
    expect(normalizeEstimatedDurationHours(undefined)).toBeNull();
    expect(normalizeEstimatedDurationHours(Number.NaN)).toBeNull();
  });

  it('acepta 1–12 h y descarta fuera de rango', () => {
    expect(normalizeEstimatedDurationHours(8)).toBe(8);
    expect(normalizeEstimatedDurationHours(7.6)).toBe(8);
    expect(normalizeEstimatedDurationHours(0)).toBeNull();
    expect(normalizeEstimatedDurationHours(13)).toBeNull();
  });
});

describe('describeServiceLevel', () => {
  it('distingue los tres niveles del compromiso', () => {
    expect(describeServiceLevel(0, 0).id).toBe('distance');
    expect(describeServiceLevel(0.5, 0.5).id).toBe('balanced');
    expect(describeServiceLevel(3, 3).id).toBe('service');
  });
});

describe('formatObjectiveWeight', () => {
  it('formatea con un decimal en es-VE', () => {
    expect(formatObjectiveWeight(0)).toBe('0,0');
    expect(formatObjectiveWeight(2.5)).toBe('2,5');
  });
});
