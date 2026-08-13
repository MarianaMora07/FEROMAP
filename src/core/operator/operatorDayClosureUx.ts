import type { DailyPlan } from '../api/planning';
import type { OperatorRouteSnapshot } from '../api/operator';

export interface OperatorDaySummary {
  operationDate: string;
  stopsDone: number;
  stopsTotal: number;
  progress: number;
  incidentsCount: number;
  traveledDistanceKm: number | null;
  totalDistanceKm: number | null;
  remainingDistanceKm: number | null;
  isDayClosed: boolean;
  partialClose: boolean;
  closedAt: string | null;
  vehicleId: string | null;
}

export function isClosedDailyPlan(plan: DailyPlan | null | undefined): boolean {
  if (!plan?.closedAt) return false;
  return plan.status === 'completed' || plan.status === 'partial';
}

export function hadOperationalDayPlan(plan: DailyPlan | null | undefined): boolean {
  if (!plan) return false;
  if (plan.closedAt) return true;
  return (
    plan.status === 'dispatched' ||
    plan.status === 'completed' ||
    plan.status === 'partial' ||
    Boolean(plan.dispatchedAt)
  );
}

export function formatOperatorDistanceKm(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)} km`;
}

export function buildOperatorDaySummary(params: {
  plan?: DailyPlan | null;
  snapshot?: OperatorRouteSnapshot | null;
  incidentsCount?: number;
}): OperatorDaySummary {
  const plan = params.plan;
  const snapshot = params.snapshot;
  const isDayClosed = isClosedDailyPlan(plan);
  const traveled =
    snapshot?.traveledDistanceKm ??
    (snapshot?.totalDistanceKm != null && snapshot.progress > 0
      ? Math.round(snapshot.totalDistanceKm * (snapshot.progress / 100) * 10) / 10
      : null);

  return {
    operationDate: snapshot?.operationDate ?? plan?.operationDate ?? new Date().toISOString().slice(0, 10),
    stopsDone: snapshot?.stopsDone ?? 0,
    stopsTotal: snapshot?.stopsTotal ?? 0,
    progress: snapshot?.progress ?? 0,
    incidentsCount: params.incidentsCount ?? 0,
    traveledDistanceKm: traveled,
    totalDistanceKm: snapshot?.totalDistanceKm ?? null,
    remainingDistanceKm: snapshot?.remainingDistanceKm ?? null,
    isDayClosed,
    partialClose: plan?.status === 'partial',
    closedAt: plan?.closedAt ?? snapshot?.dailyPlanClosedAt ?? null,
    vehicleId: snapshot?.vehicleId ?? null,
  };
}

export function shouldShowOperatorDaySummary(params: {
  plan?: DailyPlan | null;
  hasPendingStops: boolean;
}): boolean {
  if (isClosedDailyPlan(params.plan)) return true;
  if (!hadOperationalDayPlan(params.plan)) return false;
  return !params.hasPendingStops;
}
