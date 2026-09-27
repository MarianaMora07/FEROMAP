import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../types/auth';
import type { DailyPlan } from '../api/planning';
import type { OperatorRouteSnapshot } from '../api/operator';
import { deriveOperatorFieldContext } from './operatorUx';

const conductor: AuthUser = {
  id: 10,
  email: 'conductor@fero.com',
  firstName: 'Ana',
  lastName: 'Demo',
  role: 'conductor',
  driverId: 129,
};

const TODAY = '2026-09-27';
const NEXT_DAY = '2026-09-28';

function plan(partial: Partial<DailyPlan>): DailyPlan {
  return {
    id: 50,
    operationDate: TODAY,
    status: 'draft',
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
    operationDate: NEXT_DAY,
    dailyPlanId: 52,
    dailyPlanStatus: 'dispatched',
    dailyPlanClosedAt: null,
    routeId: 1188,
    vehicleId: 'TR-01',
    routeLabel: 'Ruta TR-01',
    progress: 0,
    stopsDone: 0,
    stopsTotal: 32,
    totalDistanceKm: 31.4,
    traveledDistanceKm: 0,
    remainingDistanceKm: 31.4,
    nextStop: null,
    stops: [],
    ...partial,
  };
}

function derive(params: {
  plan: DailyPlan;
  snapshot?: OperatorRouteSnapshot | null;
  operationDate?: string;
}) {
  return deriveOperatorFieldContext({
    plan: params.plan,
    fleet: [],
    user: conductor,
    operationDate: params.operationDate ?? TODAY,
    snapshotVehicleId: params.snapshot?.vehicleId ?? null,
    snapshot: params.snapshot,
  });
}

describe('deriveOperatorFieldContext con snapshot de ruta', () => {
  it('muestra la ruta despachada aunque el plan de hoy no esté despachado', () => {
    const context = derive({
      plan: plan({ status: 'draft' }),
      snapshot: snapshot({}),
    });

    expect(context.hasDispatchedPlan).toBe(true);
    expect(context.hasAssignedVehicle).toBe(true);
    expect(context.hasPendingStops).toBe(true);
    expect(context.isDayClosed).toBe(false);
  });

  it('usa la operationDate y el estado del snapshot cuando hoy no hay plan despachado', () => {
    const context = derive({
      plan: plan({ status: 'draft' }),
      snapshot: snapshot({}),
    });

    expect(context.operationDate).toBe(NEXT_DAY);
    expect(context.planStatus).toBe('dispatched');
  });

  it('mantiene la fecha de hoy cuando el plan de hoy ya está despachado', () => {
    const context = derive({
      plan: plan({ status: 'dispatched' }),
      snapshot: snapshot({ operationDate: NEXT_DAY }),
    });

    expect(context.hasDispatchedPlan).toBe(true);
    expect(context.operationDate).toBe(TODAY);
    expect(context.planStatus).toBe('dispatched');
  });

  it('no reporta ruta despachada cuando el snapshot no trae ruta', () => {
    const context = derive({
      plan: plan({ status: 'draft' }),
      snapshot: snapshot({ routeId: null, dailyPlanStatus: null, stopsTotal: 0 }),
    });

    expect(context.hasDispatchedPlan).toBe(false);
    expect(context.operationDate).toBe(TODAY);
  });

  it('no reporta ruta despachada si la jornada del snapshot aún no se despacha', () => {
    const context = derive({
      plan: plan({ status: 'draft' }),
      snapshot: snapshot({ dailyPlanStatus: 'optimized' }),
    });

    expect(context.hasDispatchedPlan).toBe(false);
    expect(context.operationDate).toBe(TODAY);
  });

  it('propaga el cierre de la jornada cuando la ruta viene del snapshot', () => {
    const context = derive({
      plan: plan({ status: 'draft' }),
      snapshot: snapshot({
        dailyPlanStatus: 'partial',
        dailyPlanClosedAt: `${NEXT_DAY}T18:30:00.000Z`,
      }),
    });

    expect(context.closedAt).toBe(`${NEXT_DAY}T18:30:00.000Z`);
    expect(context.isDayClosed).toBe(true);
    expect(context.hasPendingStops).toBe(false);
  });
});
