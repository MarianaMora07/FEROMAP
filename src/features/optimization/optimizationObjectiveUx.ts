/**
 * Fase 13 — objetivo multiobjetivo (distancia · uso de flota · tiempo de servicio).
 *
 * Helpers puros para la UI: acotado del rango, normalización de la preferencia
 * persistida y descripción cualitativa del compromiso elegido.
 */

/**
 * Tope de los pesos en la interfaz.
 *
 * El contrato del motor admite `[0, 10]` (Fase 13, §9), pero por encima de ~3 la
 * distancia crece más del 15 % que tolera el criterio de aceptación AC-1. La UI no
 * ofrece esos valores para que un clic no rompa el compromiso aceptado; el rango del
 * backend queda intacto.
 */
export const OBJECTIVE_WEIGHT_UI_MAX = 3;

/** Paso de los deslizadores de peso. */
export const OBJECTIVE_WEIGHT_STEP = 0.5;

/** Jornada objetivo por defecto del KPI `finishUnderTargetPct` (Fase 13, §9). */
export const DEFAULT_MAX_ROUTE_HOURS_TARGET = 8;

/** Rango del contrato para la jornada de turno (h) que recorta el motor. */
export const MIN_SHIFT_HOURS = 1;
export const MAX_SHIFT_HOURS = 12;

/**
 * Normaliza la jornada de turno: `null` = usar la jornada de la instalación.
 * Un valor fuera de `[1, 12]` cae también a `null` (no recorta nada).
 */
export function normalizeEstimatedDurationHours(
  value: number | null | undefined,
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < MIN_SHIFT_HOURS || rounded > MAX_SHIFT_HOURS) return null;
  return rounded;
}

/** Acota un peso de objetivo a `[0, OBJECTIVE_WEIGHT_UI_MAX]`. */
export function clampObjectiveWeight(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(OBJECTIVE_WEIGHT_UI_MAX, Math.max(0, value));
}

/** Acota la jornada objetivo a `[1, 18]` horas (rango del contrato). */
export function clampMaxRouteHoursTarget(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_ROUTE_HOURS_TARGET;
  return Math.min(18, Math.max(1, value));
}

export interface ObjectiveWeights {
  workloadBalanceWeight: number;
  makespanWeight: number;
}

/** Normaliza los pesos de una preferencia persistida (valores viejos o corruptos). */
export function normalizeObjectiveWeights(
  input: Partial<ObjectiveWeights> | null | undefined,
): ObjectiveWeights {
  return {
    workloadBalanceWeight: clampObjectiveWeight(input?.workloadBalanceWeight ?? 0),
    makespanWeight: clampObjectiveWeight(input?.makespanWeight ?? 0),
  };
}

export function formatObjectiveWeight(value: number): string {
  return clampObjectiveWeight(value).toLocaleString('es-VE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export type ServiceLevelId = 'distance' | 'balanced' | 'service';

export interface ServiceLevel {
  id: ServiceLevelId;
  label: string;
  hint: string;
}

/** Describe el compromiso elegido a partir de los pesos activos. */
export function describeServiceLevel(
  workloadBalanceWeight: number,
  makespanWeight: number,
): ServiceLevel {
  const weights = normalizeObjectiveWeights({ workloadBalanceWeight, makespanWeight });
  const total = weights.workloadBalanceWeight + weights.makespanWeight;

  if (total === 0) {
    return {
      id: 'distance',
      label: 'Solo distancia',
      hint: 'Comportamiento actual: el motor minimiza kilómetros sin mirar la flota ni la jornada.',
    };
  }
  if (total < 2) {
    return {
      id: 'balanced',
      label: 'Compromiso equilibrado',
      hint: 'Equilibra carga y duración sin penalizar la distancia de forma apreciable.',
    };
  }
  return {
    id: 'service',
    label: 'Prioridad al servicio',
    hint: 'Reparte mejor las horas y acorta la ruta más larga, aceptando más kilómetros.',
  };
}
