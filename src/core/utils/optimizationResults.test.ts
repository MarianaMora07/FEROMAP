import { describe, expect, it } from 'vitest';
import type { KpiMetrics } from '../../data/types/simulation';
import {
  buildComparisonRows,
  buildDurationBreakdownDisplay,
  isPlausibleDailyOptimizationKpis,
} from './optimizationResults';

describe('buildDurationBreakdownDisplay', () => {
  it('formats viaje, paradas and total from durationBreakdown', () => {
    const kpis: KpiMetrics = {
      distanceKm: { current: 30, optimized: 20 },
      durationHours: { current: 2, optimized: 1.5 },
      durationBreakdown: {
        current: {
          travelHours: 1.2,
          serviceHours: 0.8,
          crewLabel: '6/6 (conductor + 5 operarios)',
          crewAssignment: '6/6',
        },
        optimized: {
          travelHours: 0.9,
          serviceHours: 0.6,
          crewLabel: '4/6 (conductor + 3 operarios)',
          crewAssignment: '4/6',
        },
      },
      fuelLiters: { current: 10, optimized: 7 },
      co2KgAvoided: 2,
      criticalCoveragePct: { current: 50, optimized: 90 },
      containersServed: 12,
    };

    const display = buildDurationBreakdownDisplay(kpis);
    expect(display.optimized.travel).toBe('54 min');
    expect(display.optimized.service).toBe('36 min');
    expect(display.optimized.crewAssignment).toBe('4/6');
    expect(display.optimized.total).toBe('1 h 30 min');
  });

  it('exposes unload hours and landfill trips when present', () => {
    const kpis: KpiMetrics = {
      distanceKm: { current: 30, optimized: 22 },
      durationHours: { current: 5.5, optimized: 5.5 },
      durationBreakdown: {
        optimized: {
          travelHours: 3.2,
          serviceHours: 1.8,
          unloadHours: 0.5,
          landfillTrips: 2,
          shiftBudgetHours: 12,
          shiftUsedHours: 5.5,
          shiftUtilizationPct: 45.8,
          uncoveredPoints: 0,
          crewLabel: '6/6',
          crewAssignment: '6/6',
        },
      },
      fuelLiters: { current: 10, optimized: 8 },
      co2KgAvoided: 1,
      criticalCoveragePct: { current: 80, optimized: 95 },
      containersServed: 18,
      landfillTrips: 2,
      uncoveredPoints: 0,
    };

    const display = buildDurationBreakdownDisplay(kpis);
    expect(display.optimized.unload).toBe('30 min');
    expect(display.optimized.landfillTrips).toBe('2');
  });
});

describe('buildComparisonRows', () => {
  it('includes landfill trips and uncovered points rows', () => {
    const kpis: KpiMetrics = {
      distanceKm: { current: 28, optimized: 20 },
      durationHours: { current: 6, optimized: 5.5 },
      fuelLiters: { current: 40, optimized: 30 },
      co2KgAvoided: 5,
      criticalCoveragePct: { current: 70, optimized: 90 },
      containersServed: 15,
      landfillTrips: 2,
      uncoveredPoints: 3,
      uncoveredPointCodes: ['C001', 'C002', 'C003'],
    };

    const rows = buildComparisonRows(kpis);
    expect(rows.some((row) => row.metric === 'Viajes al vertedero' && row.optimized === '2')).toBe(true);
    expect(rows.some((row) => row.metric === 'Puntos no cubiertos' && row.optimized === '3')).toBe(true);
  });
});

describe('isPlausibleDailyOptimizationKpis', () => {
  const base: KpiMetrics = {
    distanceKm: { current: 30, optimized: 22 },
    durationHours: { current: 3, optimized: 2 },
    fuelLiters: { current: 10, optimized: 7 },
    co2KgAvoided: 2,
    criticalCoveragePct: { current: 50, optimized: 90 },
    containersServed: 12,
  };

  it('acepta métricas razonables para el día', () => {
    expect(isPlausibleDailyOptimizationKpis(base, 3)).toBe(true);
  });

  it('rechaza KPIs de validación semanal desproporcionados', () => {
    expect(
      isPlausibleDailyOptimizationKpis(
        {
          ...base,
          distanceKm: { current: 19771, optimized: 19771 },
          durationHours: { current: 791, optimized: 791 },
        },
        3,
      ),
    ).toBe(false);
  });
});
