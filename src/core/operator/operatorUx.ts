import type { AuthUser } from '../types/auth';
import type { DailyPlan } from '../api/planning';
import type { LiveVehicle } from '../api/monitoring';
import { hadOperationalDayPlan, isClosedDailyPlan } from './operatorDayClosureUx';

export interface OperatorGlossaryTerm {
  id: string;
  label: string;
  definition: string;
  toneClass: string;
  titleClass: string;
}

export const OPERATOR_GLOSSARY: OperatorGlossaryTerm[] = [
  {
    id: 'route',
    label: 'Mi ruta',
    definition: 'Secuencia de paradas asignada a tu vehículo hoy',
    toneClass: 'border-amber-300/60 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/20',
    titleClass: 'text-amber-800 dark:text-amber-200',
  },
  {
    id: 'stop',
    label: 'Parada',
    definition: 'Punto de recolección que debes visitar en orden',
    toneClass: 'border-fero-blue/30 bg-fero-blue/10',
    titleClass: 'text-fero-blue',
  },
  {
    id: 'incident',
    label: 'Incidencia',
    definition: 'Avería o contingencia que reportas desde campo',
    toneClass: 'border-red-300/50 bg-red-50/80 dark:border-red-900/40 dark:bg-red-950/20',
    titleClass: 'text-red-700 dark:text-red-300',
  },
  {
    id: 'advance',
    label: 'Avance',
    definition: 'Progreso de tu ruta respecto al plan del día',
    toneClass: 'border-fero-green/40 bg-fero-green/10',
    titleClass: 'text-fero-green-dark',
  },
];

export interface OperatorFieldContext {
  hasDispatchedPlan: boolean;
  hasAssignedVehicle: boolean;
  hasPendingStops: boolean;
  isDayClosed: boolean;
  closedAt: string | null;
  vehicle: LiveVehicle | null;
  planStatus: string | null;
  operationDate: string;
}

export function isDispatchedDailyPlan(plan: DailyPlan | null | undefined): boolean {
  return hadOperationalDayPlan(plan);
}

export function matchOperatorVehicle(
  fleet: LiveVehicle[],
  user: AuthUser | null | undefined,
): LiveVehicle | null {
  if (!user) return null;
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  const byName = fleet.find((vehicle) => vehicle.driver === fullName);
  if (byName) return byName;
  if (user.driverId != null) {
    const suffix = String(user.driverId).padStart(2, '0');
    return fleet.find((vehicle) => vehicle.id.endsWith(suffix)) ?? null;
  }
  return null;
}

export function deriveOperatorFieldContext(params: {
  plan: DailyPlan | null | undefined;
  fleet: LiveVehicle[];
  user: AuthUser | null | undefined;
  operationDate: string;
}): OperatorFieldContext {
  const vehicle = matchOperatorVehicle(params.fleet, params.user);
  const hasDispatchedPlan = hadOperationalDayPlan(params.plan);
  const isDayClosed = isClosedDailyPlan(params.plan);
  const hasAssignedVehicle = vehicle != null || params.user?.driverId != null;
  const hasPendingStops =
    hasDispatchedPlan &&
    !isDayClosed &&
    hasAssignedVehicle &&
    (vehicle == null || vehicle.progress < 100);

  return {
    hasDispatchedPlan,
    hasAssignedVehicle,
    hasPendingStops,
    isDayClosed,
    closedAt: params.plan?.closedAt ?? null,
    vehicle,
    planStatus: params.plan?.status ?? null,
    operationDate: params.operationDate,
  };
}
