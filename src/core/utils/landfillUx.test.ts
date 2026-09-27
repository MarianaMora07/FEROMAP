import { describe, expect, it } from 'vitest';
import {
  formatNextStopLabel,
  formatShiftUsage,
  isLandfillStop,
  uncoveredAlertMessage,
} from './landfillUx';
import type { KpiMetrics } from '../../data/types/simulation';

describe('landfillUx', () => {
  it('detects landfill stops by code or type', () => {
    expect(isLandfillStop('VERTEDERO', 'landfill')).toBe(true);
    expect(isLandfillStop('CNT-001', 'collection')).toBe(false);
  });

  it('formats next stop label for vertedero', () => {
    expect(formatNextStopLabel('VERTEDERO', 'landfill')).toBe('Vertedero — descarga');
    expect(formatNextStopLabel('CNT-001', 'collection')).toBe('CNT-001');
  });

  it('builds uncovered alert message', () => {
    const kpis = { uncoveredPoints: 3 } as KpiMetrics;
    expect(uncoveredAlertMessage(kpis)).toBe('3 contenedores no caben en la jornada de hoy');
  });

  it('formats shift usage from breakdown', () => {
    const kpis = {
      durationHours: { current: 2, optimized: 5.5 },
      durationBreakdown: {
        optimized: { shiftUsedHours: 5.5, shiftBudgetHours: 12 },
      },
    } as KpiMetrics;
    expect(formatShiftUsage(kpis)).toBe('Jornada utilizada: 5.5 h / 12 h');
  });
});
