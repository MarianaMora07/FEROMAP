import { describe, expect, it } from 'vitest';
import type { KpiMetrics } from '../../data/types/simulation';
import { buildDurationBreakdownDisplay } from './optimizationResults';

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
});
