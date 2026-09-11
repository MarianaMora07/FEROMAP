import { describe, expect, it } from 'vitest';
import type { WeeklyPlan, WeeklyPlanPreflight } from '../api/planning';
import {
  buildWeeklyPlanForecastFromValidation,
  canReachWeeklyPlanStep,
  deriveWeeklyPlanFlowStep,
  deriveWeeklyPlanNextAction,
  weeklyPlanApproveBlockReason,
  weeklyPlanHasScheduledPoints,
  weeklyPlanPreflightIssues,
  weeklyPlanSavingPct,
  weeklyPlanScheduledPointCount,
  weeklyPlanStepGuideText,
  weeklyPlanValidationWorkdayWarning,
  type WeeklyPlanValidationDay,
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
      days: [],
    });
    expect(warning).toContain('jornada');
  });

  it('builds the weekly forecast from the validation preview', () => {
    const days: WeeklyPlanValidationDay[] = [
      {
        operationDate: '2026-08-17',
        skipped: false,
        feasible: true,
        distanceKm: 40,
        baselineDistanceKm: 50,
        durationHours: 6,
        coveragePct: 100,
        servedPoints: 10,
        uncoveredPoints: 0,
        vehicles: [{ vehicleCode: 'V-1', distanceKm: 40, durationMin: 360, stops: 10 }],
      },
      {
        operationDate: '2026-08-18',
        skipped: false,
        feasible: true,
        distanceKm: 20,
        baselineDistanceKm: 25,
        durationHours: 3,
        coveragePct: 80,
        servedPoints: 8,
        uncoveredPoints: 2,
        vehicles: [{ vehicleCode: 'V-2', distanceKm: 20, durationMin: 180, stops: 8 }],
      },
      { operationDate: '2026-08-19', skipped: true, feasible: false, vehicles: [] },
    ];

    const forecast = buildWeeklyPlanForecastFromValidation(days, '2026-08-17');
    expect(forecast?.weekStartDate).toBe('2026-08-17');
    expect(forecast?.distanceKm).toBe(60);
    expect(forecast?.baselineDistanceKm).toBe(75);
    expect(forecast?.savingPct).toBe(20);
    expect(forecast?.scheduledPoints).toBe(20);
    expect(forecast?.coveredPoints).toBe(18);
    expect(forecast?.uncoveredPoints).toBe(2);
    expect(forecast?.coveragePct).toBe(90);
    expect(forecast?.vehicleCount).toBe(2);
    // El día sin puntos (skipped) no entra al desglose.
    expect(Object.keys(forecast?.days ?? {})).toEqual(['2026-08-17', '2026-08-18']);
  });

  it('returns no forecast when every day was skipped or failed', () => {
    expect(
      buildWeeklyPlanForecastFromValidation(
        [{ operationDate: '2026-08-17', skipped: true, feasible: false, vehicles: [] }],
        '2026-08-17',
      ),
    ).toBeNull();
  });

  it('lists only infeasible days from the pre-flight', () => {
    const preflight: WeeklyPlanPreflight = {
      feasible: false,
      rows: [
        { operationDate: '2026-08-17', overloaded: true, insufficientFleet: false },
        { operationDate: '2026-08-18', overloaded: false, insufficientFleet: true },
        { operationDate: '2026-08-19' },
      ],
    };
    expect(weeklyPlanPreflightIssues(preflight)).toEqual([
      { operationDate: '2026-08-17', overloaded: true, insufficientFleet: false },
      { operationDate: '2026-08-18', overloaded: false, insufficientFleet: true },
    ]);
    expect(weeklyPlanPreflightIssues(null)).toEqual([]);
  });

  it('computes saving percent against a baseline', () => {
    expect(weeklyPlanSavingPct(100, 75)).toBe(25);
    expect(weeklyPlanSavingPct(null, 75)).toBeNull();
    expect(weeklyPlanSavingPct(0, 75)).toBeNull();
  });
});
