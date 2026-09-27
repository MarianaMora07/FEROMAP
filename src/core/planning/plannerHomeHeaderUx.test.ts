import { describe, expect, it } from 'vitest';
import {
  formatSpanishShortDate,
  plannerHomeHeaderSubtitle,
  plannerHomeJourneySubtitle,
} from './plannerHomeHeaderUx';

describe('plannerHomeHeaderUx', () => {
  it('formats short spanish date', () => {
    const label = formatSpanishShortDate('2026-08-14');
    expect(label).toContain('14');
    expect(label).toMatch(/ago/i);
  });

  it('builds journey subtitle with date', () => {
    expect(plannerHomeJourneySubtitle('2026-08-14')).toContain('Tu jornada de planificación —');
  });

  it('prioritizes next action label when snapshot is available', () => {
    const subtitle = plannerHomeHeaderSubtitle({
      weeklyPlan: {
        id: 1,
        weekStartDate: '2026-08-10',
        weekEndDate: '2026-08-16',
        status: 'approved',
        daysConfigured: 5,
        scheduledPoints: 40,
      },
      dailyPlan: {
        id: 9,
        operationDate: '2026-08-14',
        status: 'optimized',
        pointCount: 12,
        pendingCount: 1,
        dispatched: false,
      },
      openIncidents: 0,
      openPendingVisits: 0,
    });
    expect(subtitle).toBe('Siguiente paso: simular recorrido');
  });
});
