import { describe, expect, it } from 'vitest';
import type { WeeklyPlan, WeeklyPlanDay } from '../../core/api/planning';
import {
  buildDaySimulationPayload,
  daySimKm,
  dayStatusMeta,
  hasDayPoints,
  resolveDayPointIds,
} from './optimizationLevelsUx';

const DAY: WeeklyPlanDay = {
  operationDate: '2026-09-07',
  weekday: 0,
  sectorIds: [],
  collectionPointIds: [3, 7, 9],
  expectedVehicleCount: 2,
};

function plan(overrides: Partial<WeeklyPlan> = {}): WeeklyPlan {
  return {
    id: 12,
    weekStartDate: '2026-09-07',
    weekEndDate: '2026-09-12',
    status: 'approved',
    scenarioId: 'normal',
    days: [DAY],
    ...overrides,
  };
}

describe('mapeo semana → día → collectionPointIds', () => {
  it('resuelve los ids del día', () => {
    expect(resolveDayPointIds(plan(), '2026-09-07')).toEqual([3, 7, 9]);
  });

  it('devuelve [] para un día inexistente o plan vacío', () => {
    expect(resolveDayPointIds(plan(), '2026-09-01')).toEqual([]);
    expect(resolveDayPointIds(undefined, '2026-09-07')).toEqual([]);
  });

  it('construye el payload de N3 con los puntos del día', () => {
    const payload = buildDaySimulationPayload(plan(), '2026-09-07', {
      scenarioId: 'rain',
      departureHour: 7,
      durationHours: 8,
      acoAnts: 12,
      acoIterations: 20,
    });
    expect(payload.collectionPointIds).toEqual([3, 7, 9]);
    expect(payload.departureHour).toBe(7);
    expect(payload.estimatedDurationHours).toBe(8);
  });
});

describe('estado y km del día desde el preflight', () => {
  it('marca sobrecapacidad cuando el pre-flight heurístico la detecta', () => {
    const overloaded = plan({
      preflight: {
        feasible: false,
        rows: [
          { operationDate: '2026-09-07', overloaded: true, insufficientFleet: false, demandKg: 3000, capacityKg: 2900 },
        ],
      },
    });
    expect(dayStatusMeta(DAY, overloaded).label).toContain('Sobrecapacidad');
  });

  it('marca Revisar cuando la simulación por día es infeasible', () => {
    const bad = plan({
      preflight: {
        feasible: false,
        rows: [],
        simulation: { feasible: false, rows: [{ operationDate: '2026-09-07', feasible: false }] },
      },
    });
    expect(dayStatusMeta(DAY, bad).label).toBe('Revisar');
  });

  it('estado OK sin alertas y muestra km de la validación', () => {
    const good = plan({
      preflight: {
        feasible: true,
        rows: [{ operationDate: '2026-09-07', overloaded: false }],
        simulation: { feasible: true, rows: [{ operationDate: '2026-09-07', distanceKm: 42.3, feasible: true }] },
      },
    });
    expect(dayStatusMeta(DAY, good).label).toBe('OK');
    expect(daySimKm(good, '2026-09-07')).toBe('42.3 km');
  });

  it('daySimKm devuelve "—" sin validación', () => {
    expect(daySimKm(plan(), '2026-09-07')).toBe('—');
  });
});

describe('día con/sin puntos', () => {
  it('detecta puntos del día', () => {
    expect(hasDayPoints({ points: [{ id: 1, code: 'CNT-001' }] })).toBe(true);
    expect(hasDayPoints({ points: [] })).toBe(false);
    expect(hasDayPoints(undefined)).toBe(false);
  });
});
