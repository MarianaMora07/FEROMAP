/**
 * Derivaciones del barrido de pesos del objetivo y la frontera de Pareto (Fase 13, §7.2).
 *
 * La frontera y los criterios **vienen del payload**: aquí solo se presentan, nunca se
 * recalculan reglas distintas a las del backend (`build_pareto_frontier`,
 * `evaluate_acceptance_criteria`).
 */

import type {
  ObjectiveSweepPayload,
  ObjectiveSweepRun,
} from '../../core/api/benchmark';
import type { CalibrationReading } from './calibrationRunUx';

export type AcceptanceScore = boolean | null;

export interface AcceptanceCard {
  id: 'ac1' | 'ac2' | 'ac3';
  titleKey: string;
  criterion: string;
  ok: AcceptanceScore;
  detail: string;
}

export const ACCEPTANCE_TITLE_KEYS: Record<AcceptanceCard['id'], string> = {
  ac1: 'calibration.ac1',
  ac2: 'calibration.ac2',
  ac3: 'calibration.ac3',
};

export function isValidObjectiveRun(run: ObjectiveSweepRun): boolean {
  if (run.error) return false;
  if ((run.uncoveredPoints ?? 0) > 0) return false;
  return typeof run.distanceKmOptimized === 'number' && Number.isFinite(run.distanceKmOptimized);
}

/** Etiqueta legible de los pesos efectivos de la corrida. */
export function weightsLabel(run: ObjectiveSweepRun): string {
  const parts = [`λb ${run.workloadBalanceWeight}`, `λt ${run.makespanWeight}`];
  if (run.minActiveVehiclesRequested) parts.push(`mín. ${run.minActiveVehiclesRequested} veh.`);
  return parts.join(' · ');
}

/** Etiqueta de la jornada: 8 h declaradas o la jornada por defecto del motor (12 h). */
export function shiftLabel(run: ObjectiveSweepRun): string {
  return run.durationHours ? `${run.durationHours} h` : '12 h (defecto)';
}

/**
 * Corrida de referencia: sin pesos y sin mínimo de flota (la línea base del barrido).
 * Sirve para distinguirla en la tabla de las corridas ya optimizadas.
 */
export function isBaselineRun(run: ObjectiveSweepRun): boolean {
  return (
    run.workloadBalanceWeight === 0 &&
    run.makespanWeight === 0 &&
    !run.minActiveVehiclesRequested
  );
}

/** Ahorro declarado por la corrida respecto a **su** referencia, ya formateado. */
export function savingLabel(run: ObjectiveSweepRun): string {
  return typeof run.savingPct === 'number' ? `${run.savingPct.toFixed(1)} %` : '—';
}

/** La frontera se toma tal cual del payload (no se recalcula dominancia en la UI). */
export function frontierRows(payload: ObjectiveSweepPayload): ObjectiveSweepRun[] {
  return payload.paretoFrontier ?? [];
}

export function frontierLabels(payload: ObjectiveSweepPayload): string[] {
  return frontierRows(payload).map((run) => run.label);
}

export function isInFrontier(payload: ObjectiveSweepPayload, run: ObjectiveSweepRun): boolean {
  return frontierLabels(payload).includes(run.label);
}

/** Corridas para la tabla: las válidas primero, el resto marcadas al final. */
export function tableRows(payload: ObjectiveSweepPayload): ObjectiveSweepRun[] {
  const valid = payload.runs.filter(isValidObjectiveRun);
  const invalid = payload.runs.filter((run) => !isValidObjectiveRun(run));
  return [...valid, ...invalid];
}

export function acceptanceCards(payload: ObjectiveSweepPayload): AcceptanceCard[] {
  const { acceptance } = payload;

  const accepted = acceptance.ac1.acceptedPoint;
  const ac1Detail = accepted
    ? `${accepted.label} · ${accepted.distanceKmOptimized} km (límite ${accepted.limitKm} km)`
    : 'sin punto aceptado';

  const ac2Detail = acceptance.ac2.candidates.length
    ? `${acceptance.ac2.candidates.length} candidatas`
    : 'sin candidatas';

  return [
    {
      id: 'ac1',
      titleKey: ACCEPTANCE_TITLE_KEYS.ac1,
      criterion: acceptance.ac1.criterion,
      ok: acceptance.ac1.ok,
      detail: ac1Detail,
    },
    {
      id: 'ac2',
      titleKey: ACCEPTANCE_TITLE_KEYS.ac2,
      criterion: acceptance.ac2.criterion,
      ok: acceptance.ac2.ok,
      detail: ac2Detail,
    },
    {
      id: 'ac3',
      titleKey: ACCEPTANCE_TITLE_KEYS.ac3,
      criterion: acceptance.ac3.criterion,
      ok: acceptance.ac3.ok,
      detail: acceptance.ac3.evidence,
    },
  ];
}

export interface AcceptanceSummary {
  ok: number;
  total: number;
  /** Criterios sin veredicto automático (hoy AC-3, evidenciado por un test). */
  withoutVerdict: AcceptanceCard['id'][];
}

/** Etiqueta corta del criterio: `ac1` → `AC-1`. */
export function acceptanceLabel(id: AcceptanceCard['id']): string {
  return `AC-${id.slice(2)}`;
}

/** Conteo de criterios por veredicto, para el KPI y su leyenda. */
export function acceptanceSummary(payload: ObjectiveSweepPayload): AcceptanceSummary {
  const cards = acceptanceCards(payload);
  return {
    ok: cards.filter((card) => card.ok === true).length,
    total: cards.length,
    withoutVerdict: cards.filter((card) => card.ok === null).map((card) => card.id),
  };
}

/** Mejor corrida válida del barrido (menor distancia optimizada). */
export function bestObjectiveRun(payload: ObjectiveSweepPayload): ObjectiveSweepRun | null {
  const valid = payload.runs.filter(isValidObjectiveRun);
  if (!valid.length) return null;
  return valid.reduce((best, run) =>
    (run.distanceKmOptimized ?? Infinity) < (best.distanceKmOptimized ?? Infinity) ? run : best,
  );
}

export function objectiveFindings(payload: ObjectiveSweepPayload): CalibrationReading[] {
  const findings: CalibrationReading[] = [];
  const best = bestObjectiveRun(payload);
  if (best) {
    findings.push({
      labelKey: 'calibration.reading.best',
      detail: `${best.label} · ${best.distanceKmOptimized?.toFixed(1)} km · ${weightsLabel(best)}`,
    });
  }
  findings.push({
    labelKey: 'calibration.reading.pareto',
    detail: `${frontierRows(payload).length} · ${frontierLabels(payload).join(', ') || '—'}`,
  });
  const failed = payload.runs.length - payload.runs.filter(isValidObjectiveRun).length;
  if (failed > 0) {
    findings.push({
      labelKey: 'calibration.reading.excluded',
      detail: String(failed),
    });
  }
  return findings;
}
