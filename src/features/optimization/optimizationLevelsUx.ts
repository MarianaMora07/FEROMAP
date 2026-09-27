import type { WeeklyPlan, WeeklyPlanDay, WeeklyDayPoint } from '../../core/api/planning';

export interface DayStatusMeta {
  tone: string;
  label: string;
}

export function resolveDayPointIds(plan: WeeklyPlan | null | undefined, operationDate: string): number[] {
  const day = (plan?.days ?? []).find((row) => row.operationDate === operationDate);
  return day ? [...day.collectionPointIds] : [];
}

export function daySimRow(plan: WeeklyPlan | null | undefined, operationDate: string) {
  const rows = plan?.preflight?.simulation?.rows ?? [];
  return rows.find((row) => row.operationDate === operationDate) ?? null;
}

export function dayStatusMeta(day: WeeklyPlanDay, plan: WeeklyPlan): DayStatusMeta {
  const heuristic = (plan.preflight?.rows ?? []).find((row) => row.operationDate === day.operationDate);
  const sim = daySimRow(plan, day.operationDate);
  if (sim?.error || sim?.feasible === false) {
    return { tone: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300', label: 'Revisar' };
  }
  if (heuristic?.overloaded || heuristic?.insufficientFleet) {
    return { tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200', label: '⚠ Sobrecapacidad' };
  }
  return { tone: 'bg-fero-green/15 text-fero-green-dark dark:text-fero-green-mid', label: 'OK' };
}

export function daySimKm(plan: WeeklyPlan | null | undefined, operationDate: string): string {
  const sim = daySimRow(plan, operationDate);
  return sim?.distanceKm != null ? `${sim.distanceKm.toFixed(1)} km` : '—';
}

export interface DaySimulationParameters {
  scenarioId: string;
  departureHour: number;
  durationHours: number;
  acoAnts: number;
  acoIterations: number;
}

/** Payload de N3: mapea semana → día → collectionPointIds + parámetros. */
export function buildDaySimulationPayload(
  plan: WeeklyPlan | null | undefined,
  operationDate: string,
  parameters: DaySimulationParameters,
): { collectionPointIds: number[]; departureHour: number; estimatedDurationHours: number; acoAnts: number; acoIterations: number } {
  return {
    collectionPointIds: resolveDayPointIds(plan, operationDate),
    departureHour: parameters.departureHour,
    estimatedDurationHours: parameters.durationHours,
    acoAnts: parameters.acoAnts,
    acoIterations: parameters.acoIterations,
  };
}

export function hasDayPoints(day: { points?: WeeklyDayPoint[] } | null | undefined): boolean {
  return (day?.points?.length ?? 0) > 0;
}
