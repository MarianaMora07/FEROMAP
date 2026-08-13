import { describe, expect, it } from 'vitest';
import type { DailyPlan } from '../api/planning';
import type { OperatorRouteSnapshot } from '../api/operator';
import {
  buildOperatorDaySummary,
  hadOperationalDayPlan,
  isClosedDailyPlan,
  shouldShowOperatorDaySummary,
} from './operatorDayClosureUx';

function plan(partial: Partial<DailyPlan>): DailyPlan {
  return {
    id: 1,
    operationDate: '2026-08-13',
    status: 'dispatched',
    scenarioId: 'normal',
    scheduledPoints: [],
    pendingPoints: [],
    pendingPointIds: [],
    finalPointIds: [],
    ...partial,
  };
}

function snapshot(partial: Partial<OperatorRouteSnapshot>): OperatorRouteSnapshot {
  return {
    operationDate: '2026-08-13',
    dailyPlanId: 1,
    dailyPlanStatus: 'dispatched',
    routeId: 1,
    vehicleId: 'TR-08',
    routeLabel: 'Ruta Norte',
    progress: 100,
    stopsDone: 8,
    stopsTotal: 8,
    totalDistanceKm: 28.6,
    traveledDistanceKm: 28.6,
    remainingDistanceKm: 0,
    nextStop: null,
    stops: [],
    ...partial,
  };
}

describe('operatorDayClosureUx', () => {
  it('detects closed day from plan status and closedAt', () => {
    expect(isClosedDailyPlan(plan({ status: 'completed', closedAt: '2026-08-13T18:00:00Z' }))).toBe(
      true,
    );
    expect(isClosedDailyPlan(plan({ status: 'dispatched', closedAt: null }))).toBe(false);
  });

  it('treats dispatched and closed plans as operational days', () => {
    expect(hadOperationalDayPlan(plan({ status: 'dispatched' }))).toBe(true);
    expect(hadOperationalDayPlan(plan({ status: 'partial', closedAt: 'x' }))).toBe(true);
    expect(hadOperationalDayPlan(plan({ status: 'draft' }))).toBe(false);
  });

  it('builds day summary with incidents and distance', () => {
    const summary = buildOperatorDaySummary({
      plan: plan({ status: 'partial', closedAt: '2026-08-13T18:00:00Z' }),
      snapshot: snapshot({}),
      incidentsCount: 2,
    });
    expect(summary.stopsDone).toBe(8);
    expect(summary.incidentsCount).toBe(2);
    expect(summary.isDayClosed).toBe(true);
    expect(summary.traveledDistanceKm).toBe(28.6);
  });

  it('shows summary when day is closed or journey finished', () => {
    expect(
      shouldShowOperatorDaySummary({
        plan: plan({ status: 'partial', closedAt: 'x' }),
        hasPendingStops: true,
      }),
    ).toBe(true);
    expect(
      shouldShowOperatorDaySummary({
        plan: plan({ status: 'dispatched' }),
        hasPendingStops: false,
      }),
    ).toBe(true);
    expect(
      shouldShowOperatorDaySummary({
        plan: plan({ status: 'draft' }),
        hasPendingStops: false,
      }),
    ).toBe(false);
  });
});
