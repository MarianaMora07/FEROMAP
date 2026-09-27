import { describe, expect, it } from 'vitest';
import {
  buildOperationalJourneySteps,
  buildOptimizationExperienceSteps,
  deriveOperationalJourneyStep,
  deriveOptimizationExperienceStep,
  parsePlaybackQueryParam,
} from './operationalFlowUx';

describe('operationalFlowUx', () => {
  it('derives configure_week when weekly plan is missing', () => {
    expect(deriveOperationalJourneyStep({ weeklyPlan: null, dailyPlan: null })).toBe('configure_week');
  });

  it('derives simulate_route when day is optimized but not dispatched', () => {
    const step = deriveOperationalJourneyStep({
      weeklyPlan: { id: 1, weekStartDate: '2026-08-10', weekEndDate: '2026-08-16', status: 'approved', daysConfigured: 5, scheduledPoints: 40 },
      dailyPlan: {
        id: 9,
        operationDate: '2026-08-14',
        status: 'optimized',
        pointCount: 12,
        pendingCount: 1,
        dispatched: false,
      },
    });
    expect(step).toBe('simulate_route');
  });

  it('builds chained journey with playback deep link on monitor when dispatched', () => {
    const steps = buildOperationalJourneySteps({
      weeklyPlan: { id: 1, weekStartDate: '2026-08-10', weekEndDate: '2026-08-16', status: 'approved', daysConfigured: 5, scheduledPoints: 40 },
      dailyPlan: {
        id: 9,
        operationDate: '2026-08-14',
        status: 'dispatched',
        pointCount: 12,
        pendingCount: 0,
        dispatched: true,
      },
    });
    const monitor = steps.find((step) => step.id === 'monitor');
    expect(monitor?.href).toContain('playback=1');
    expect(monitor?.status).toBe('current');
  });

  it('derives optimization experience playback step when panel is open', () => {
    expect(
      deriveOptimizationExperienceStep({
        dailyStatus: 'optimized',
        hasResults: true,
        playbackOpen: true,
        weeklyPlanApproved: true,
      }),
    ).toBe('playback');
  });

  it('blocks routes step when weekly plan is not approved', () => {
    const steps = buildOptimizationExperienceSteps({
      dailyStatus: 'draft',
      hasResults: false,
      playbackOpen: false,
      weeklyPlanApproved: false,
    });
    expect(steps.find((step) => step.id === 'routes')?.status).toBe('blocked');
  });

  it('parses playback query param', () => {
    expect(parsePlaybackQueryParam('1')).toBe(true);
    expect(parsePlaybackQueryParam('true')).toBe(true);
    expect(parsePlaybackQueryParam(['1'])).toBe(true);
    expect(parsePlaybackQueryParam(undefined)).toBe(false);
  });
});
