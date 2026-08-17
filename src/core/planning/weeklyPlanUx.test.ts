import { describe, expect, it } from 'vitest';
import type { WeeklyPlan } from '../api/planning';
import {
  canReachWeeklyPlanStep,
  deriveWeeklyPlanFlowStep,
  deriveWeeklyPlanNextAction,
  weeklyPlanApproveBlockReason,
  weeklyPlanHasScheduledPoints,
  weeklyPlanScheduledPointCount,
  weeklyPlanStepGuideText,
  weeklyPlanValidationWorkdayWarning,
} from './weeklyPlanUx';

const draftPlan: WeeklyPlan = {
  id: 1,
  weekStartDate: '2026-08-17',
  weekEndDate: '2026-08-23',
  status: 'draft',
  scenarioId: 'normal',
  days: [
    {
      operationDate: '2026-08-17',
      weekday: 0,
      sectorIds: [],
      collectionPointIds: [1, 2, 3],
    },
  ],
};

describe('weeklyPlanUx', () => {
  it('detects scheduled points', () => {
    expect(weeklyPlanHasScheduledPoints(draftPlan)).toBe(true);
    expect(weeklyPlanHasScheduledPoints({ ...draftPlan, days: [{ ...draftPlan.days[0]!, collectionPointIds: [] }] })).toBe(
      false,
    );
  });

  it('advances flow step when days have points', () => {
    expect(
      deriveWeeklyPlanFlowStep({
        plan: draftPlan,
        isValidating: false,
        validationCompleted: false,
      }),
    ).toBe(2);
  });

  it('suggests validate as primary action on step 2', () => {
    const action = deriveWeeklyPlanNextAction({ plan: draftPlan, flowStep: 2 });
    expect(action?.primaryActionId).toBe('validate');
    expect(action?.primaryLabel).toBe('Validar con simulación');
  });

  it('suggests approve after validation', () => {
    const action = deriveWeeklyPlanNextAction({
      plan: draftPlan,
      flowStep: 3,
    });
    expect(action?.primaryActionId).toBe('approve');
  });

  it('links to daily plan when approved', () => {
    const action = deriveWeeklyPlanNextAction({
      plan: { ...draftPlan, status: 'approved' },
      flowStep: 4,
    });
    expect(action?.primaryActionId).toBe('goToDay');
    expect(action?.primaryHref).toContain('/optimization');
  });

  it('counts unique scheduled points across the week', () => {
    expect(weeklyPlanScheduledPointCount(draftPlan)).toBe(3);
  });

  it('allows previewing approve step before validation when points exist', () => {
    expect(canReachWeeklyPlanStep(3, 2)).toBe(true);
    expect(canReachWeeklyPlanStep(4, 2)).toBe(false);
  });

  it('builds step guide text', () => {
    expect(weeklyPlanStepGuideText(2)).toContain('Paso 2 de 4');
    expect(weeklyPlanStepGuideText(2)).toContain('simulación rápida');
  });

  it('blocks approve until validation completes', () => {
    expect(weeklyPlanApproveBlockReason(false)).toBe('Falta validar');
    expect(weeklyPlanApproveBlockReason(true)).toBeNull();
  });

  it('warns when validation exceeds workday', () => {
    const warning = weeklyPlanValidationWorkdayWarning({
      distanceKm: 20,
      durationHours: 13,
      scheduledPoints: 10,
      coveredPoints: 10,
      uncoveredPoints: 0,
      exceedsWorkday: true,
      workdayHours: 12,
      simulationId: 1,
    });
    expect(warning).toContain('jornada');
  });
});
