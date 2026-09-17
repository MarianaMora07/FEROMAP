/**
 * Presentación de la validación de la combinación ACO (Fase 13 · vista de calibración).
 *
 * Módulo puro (sin DOM ni Solid): arma las etiquetas y los avisos del veredicto para que
 * el componente no derive nada. El texto traducible viaja **como clave i18n**, nunca como
 * dato; los números van ya formateados.
 */

import type {
  AcoValidationOutcome,
  AcoValidationParams,
  AcoValidationPayload,
  AcoValidationRun,
} from '../../core/api/benchmark';

/** Etiqueta corta de un perfil ACO: `12×20 · α1 β3 ρ0.12 Q1`. */
export function profileLabel(params: AcoValidationParams): string {
  return (
    `${params.acoAnts}×${params.acoIterations} · ` +
    `α${params.acoAlpha} β${params.acoBeta} ρ${params.acoRho} Q${params.pheromoneQ}`
  );
}

/** Clave i18n del nombre de cada corrida (el payload también trae un rótulo). */
export function runLabelKey(role: AcoValidationRun['role']): string {
  return `calibration.validation.run.${role}`;
}

export function outcomeLabelKey(outcome: AcoValidationOutcome): string {
  return `calibration.validation.outcome.${outcome}`;
}

export function outcomeVariant(
  outcome: AcoValidationOutcome,
): 'success' | 'warning' | 'danger' | 'info' | 'default' {
  switch (outcome) {
    case 'better':
      return 'success';
    case 'equal':
      return 'info';
    case 'worse':
      return 'warning';
    default:
      return 'default';
  }
}

/**
 * Diferencia de distancia con signo explícito: `-6.1 km (-3.20 %)`.
 * Negativo = la combinación mejora (la distancia es el KPI primario, decisión D2).
 */
export function deltaLabel(payload: AcoValidationPayload): string | null {
  const { deltaKm, deltaPct } = payload.verdict;
  if (deltaKm === null || deltaPct === null) return null;
  const sign = deltaKm > 0 ? '+' : '';
  return `${sign}${deltaKm.toFixed(1)} km (${sign}${deltaPct.toFixed(2)} %)`;
}

/**
 * Avisos que acotan la lectura del veredicto (claves i18n, sin texto traducible).
 *
 * - `same`: la combinación es el perfil estándar → no hay nada que confirmar.
 * - `stale`: la evidencia es de otra instancia (sello).
 * - `earlyStop`: alguna corrida paró antes de agotar iteraciones.
 * - `reason.*`: el veredicto no es comparable (`error`, `uncovered`, `missing`).
 */
export function validationCaveatKeys(payload: AcoValidationPayload): string[] {
  const keys: string[] = [];
  if (payload.sameParams) keys.push('calibration.validation.caveat.same');
  if (payload.stale) keys.push('calibration.validation.caveat.stale');
  if (payload.verdict.outcome === 'not-comparable') {
    keys.push(`calibration.validation.reason.${payload.verdict.reason ?? 'missing'}`);
  }
  if (payload.runs.some((run) => run.acoStoppedEarly === true)) {
    keys.push('calibration.validation.caveat.earlyStop');
  }
  return keys;
}

export interface ValidationRow {
  role: AcoValidationRun['role'];
  /** Perfil efectivo de la corrida (`12×20 · α1 β3 ρ0.12 Q1`). */
  profile: string;
  km: number | null;
  seconds: number | null;
  iterations: number | null;
  earlyStop: boolean;
  uncovered: number;
  error: string | null;
}

/** Las dos corridas de la validación (control y combinación) listas para la tabla. */
export function validationRows(payload: AcoValidationPayload): ValidationRow[] {
  return payload.runs.map((run) => ({
    role: run.role,
    profile: profileLabel(run.params),
    km: typeof run.distanceKmOptimized === 'number' ? run.distanceKmOptimized : null,
    seconds: typeof run.computationSeconds === 'number' ? run.computationSeconds : null,
    iterations: typeof run.acoIterationsRun === 'number' ? run.acoIterationsRun : null,
    earlyStop: run.acoStoppedEarly === true,
    uncovered: run.uncoveredPoints ?? 0,
    error: run.error ?? null,
  }));
}
