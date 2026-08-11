/**
 * Contrato de dotación y tiempo de servicio en paradas (ADR-003).
 * @see docs/fase-8/adr-dotacion-tiempo-servicio.md
 */

export const DEFAULT_IDEAL_OPERATORS = 6;
export const FIELD_OPERATORS_PER_VEHICLE = 5;
export const BASE_SERVICE_SECONDS = 300;
export const PENALTY_PER_MISSING_FIELD_OPERATOR_SEC = 30;
export const MIN_ASSIGNED_OPERATORS = 1;
export const MAX_OPERATORS_SHORTAGE = FIELD_OPERATORS_PER_VEHICLE;

/** Campos de dotación en vehículos (GET; PATCH Fase 1). */
export interface VehicleCrewFields {
  idealOperatorsCount: number;
  assignedOperatorsCount?: number | null;
}

/** Parámetros de simulación relacionados con cuadrilla. */
export interface SimulationCrewParameters {
  /** Operarios de campo ausentes en el turno (0–5). */
  operatorsShortage?: number;
}

/** Desglose de duración en KPIs (respuesta Fase 2). */
export interface DurationBreakdown {
  travelHours: number;
  serviceHours: number;
  crewLabel: string;
}

export interface CrewServiceBreakdown {
  idealOperators: number;
  assignedEffective: number;
  fieldOperatorsAssigned: number;
  missingFieldOperators: number;
  serviceSecondsPerStop: number;
  stopCount: number;
  serviceSecondsTotal: number;
  travelSeconds: number;
  totalSeconds: number;
  crewLabel: string;
}

export function normalizeOperatorsShortage(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (value >= 0 && value <= MAX_OPERATORS_SHORTAGE) return value;
  return null;
}

export function normalizeAssignedOperators(
  assigned: number | null | undefined,
  ideal: number = DEFAULT_IDEAL_OPERATORS,
): number {
  if (assigned == null) return ideal;
  return Math.max(MIN_ASSIGNED_OPERATORS, Math.min(assigned, ideal));
}

export function resolveEffectiveAssigned(
  assigned: number | null | undefined,
  options?: { ideal?: number; operatorsShortage?: number | null },
): number {
  const ideal = options?.ideal ?? DEFAULT_IDEAL_OPERATORS;
  const base = normalizeAssignedOperators(assigned, ideal);
  const shortage = normalizeOperatorsShortage(options?.operatorsShortage) ?? 0;
  return Math.max(MIN_ASSIGNED_OPERATORS, base - shortage);
}

export function missingFieldOperators(
  assignedEffective: number,
  ideal: number = DEFAULT_IDEAL_OPERATORS,
): number {
  const fieldIdeal = Math.max(0, ideal - 1);
  const fieldAssigned = Math.max(0, assignedEffective - 1);
  return Math.max(0, fieldIdeal - fieldAssigned);
}

export function serviceTimeSecondsPerStop(
  assignedEffective: number,
  ideal: number = DEFAULT_IDEAL_OPERATORS,
): number {
  const missing = missingFieldOperators(assignedEffective, ideal);
  return BASE_SERVICE_SECONDS + missing * PENALTY_PER_MISSING_FIELD_OPERATOR_SEC;
}

export function routeServiceSeconds(
  stopCount: number,
  assignedEffective: number,
  ideal: number = DEFAULT_IDEAL_OPERATORS,
): number {
  if (stopCount <= 0) return 0;
  return stopCount * serviceTimeSecondsPerStop(assignedEffective, ideal);
}

export function routeTotalDurationSeconds(
  travelSeconds: number,
  stopCount: number,
  assignedEffective: number,
  ideal: number = DEFAULT_IDEAL_OPERATORS,
): number {
  return Math.round(travelSeconds) + routeServiceSeconds(stopCount, assignedEffective, ideal);
}

export function buildCrewServiceBreakdown(params: {
  travelSeconds: number;
  stopCount: number;
  assigned?: number | null;
  ideal?: number;
  operatorsShortage?: number | null;
}): CrewServiceBreakdown {
  const ideal = params.ideal ?? DEFAULT_IDEAL_OPERATORS;
  const assignedEffective = resolveEffectiveAssigned(params.assigned, {
    ideal,
    operatorsShortage: params.operatorsShortage,
  });
  const fieldOperatorsAssigned = Math.max(0, assignedEffective - 1);
  const missing = missingFieldOperators(assignedEffective, ideal);
  const perStop = serviceTimeSecondsPerStop(assignedEffective, ideal);
  const serviceTotal = routeServiceSeconds(params.stopCount, assignedEffective, ideal);
  const travelSeconds = Math.round(params.travelSeconds);

  return {
    idealOperators: ideal,
    assignedEffective,
    fieldOperatorsAssigned,
    missingFieldOperators: missing,
    serviceSecondsPerStop: perStop,
    stopCount: params.stopCount,
    serviceSecondsTotal: serviceTotal,
    travelSeconds,
    totalSeconds: travelSeconds + serviceTotal,
    crewLabel: `${assignedEffective}/${ideal} (conductor + ${fieldOperatorsAssigned} operarios)`,
  };
}

/**
 * Matriz objetivo vs reporte (ADR-003).
 * - ACO: minimiza distancia
 * - KPIs/rutas: viaje + tiempo de servicio por dotación
 */
export const CREW_OBJECTIVE_MATRIX = {
  acoFitness: { distance: true, serviceTime: false },
  kpiDuration: { travel: true, serviceTime: true, crew: true },
} as const;
