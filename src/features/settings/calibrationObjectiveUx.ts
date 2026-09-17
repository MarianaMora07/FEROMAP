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

/** Mejor corrida válida del barrido (menor distancia optimizada). */
export function bestObjectiveRun(payload: ObjectiveSweepPayload): ObjectiveSweepRun | null {
  const valid = payload.runs.filter(isValidObjectiveRun);
  if (!valid.length) return null;
  return valid.reduce((best, run) =>
    (run.distanceKmOptimized ?? Infinity) < (best.distanceKmOptimized ?? Infinity) ? run : best,
  );
}

export function objectiveFindings(payload: ObjectiveSweepPayload): { labelKey: string; detail: string }[] {
  const findings: { labelKey: string; detail: string }[] = [];
  const best = bestObjectiveRun(payload);
  if (best) {
    findings.push({
      labelKey: 'calibration.reading.best',
      detail: `${best.label} · ${best.distanceKmOptimized?.toFixed(1)} km · ${weightsLabel(best)}`,
    });
  }
  findings.push({
    labelKey: 'calibration.reading.pareto',
    detail: `${frontierRows(payload).length} soluciones · ${frontierLabels(payload).join(', ') || '—'}`,
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
