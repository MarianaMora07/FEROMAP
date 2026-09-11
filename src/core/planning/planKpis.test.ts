import { describe, expect, it } from 'vitest';
import {
  normalizePlanForecast,
  normalizePlanVsReal,
  normalizeWeeklyPlanForecast,
} from './planKpis';

describe('planKpis — contratos previsto/real (Fase 0)', () => {
  it('normaliza un previsto completo', () => {
    const result = normalizePlanForecast({
      distanceKm: 42.5,
      durationHours: 6.2,
      baselineDistanceKm: 58,
      savingPct: 26.7,
      scheduledPoints: 12,
      coveredPoints: 10,
      uncoveredPoints: 2,
      coveragePct: 83.3,
      vehicleCount: 3,
    });
    expect(result).toEqual({
      distanceKm: 42.5,
      durationHours: 6.2,
      baselineDistanceKm: 58,
      savingPct: 26.7,
      scheduledPoints: 12,
      coveredPoints: 10,
      uncoveredPoints: 2,
      coveragePct: 83.3,
      vehicleCount: 3,
    });
  });

  it('coacciona números serializados como string y completa faltantes', () => {
    const result = normalizePlanForecast({ distanceKm: '10.5', scheduledPoints: '4' });
    expect(result?.distanceKm).toBe(10.5);
    expect(result?.scheduledPoints).toBe(4);
    expect(result?.durationHours).toBe(0);
    expect(result?.baselineDistanceKm).toBeNull();
    expect(result?.vehicleCount).toBe(0);
  });

  it('devuelve null si no es objeto o falta distanceKm', () => {
    expect(normalizePlanForecast(null)).toBeNull();
    expect(normalizePlanForecast([1, 2])).toBeNull();
    expect(normalizePlanForecast({ durationHours: 3 })).toBeNull();
  });

  it('normaliza previsto vs. real', () => {
    const result = normalizePlanVsReal({
      plannedDistanceKm: 40,
      actualDistanceKm: null,
      plannedDurationMin: 300,
      actualDurationMin: 330.5,
      scheduledPoints: 12,
      servedPoints: 11,
      collectedKg: '845.4',
      completionPct: 91.7,
    });
    expect(result?.actualDistanceKm).toBeNull();
    expect(result?.actualDurationMin).toBe(330.5);
    expect(result?.collectedKg).toBe(845.4);
    expect(result?.servedPoints).toBe(11);
  });

  it('agrega el previsto semanal con desglose por día', () => {
    const result = normalizeWeeklyPlanForecast({
      weekStartDate: '2026-09-14',
      distanceKm: 120,
      durationHours: 18,
      scheduledPoints: 30,
      coveredPoints: 28,
      uncoveredPoints: 2,
      vehicleCount: 6,
      days: {
        '2026-09-14': { distanceKm: 40, scheduledPoints: 10, coveredPoints: 10 },
        '2026-09-15': { scheduledPoints: 10 },
      },
    });
    expect(result?.weekStartDate).toBe('2026-09-14');
    expect(result?.scheduledPoints).toBe(30);
    expect(result?.days['2026-09-14']?.distanceKm).toBe(40);
    // El día inválido (sin distanceKm) se descarta.
    expect(result?.days['2026-09-15']).toBeUndefined();
  });
});
