/**
 * Recomendación de calibración a partir de la evidencia (Fase 13 · vista de calibración).
 *
 * Todo lo que sale de aquí **está en los payloads**: niveles medidos, distancias y
 * criterios. No se extrapola ni se inventa la combinación de los mejores niveles (el
 * barrido es OFAT y de una sola semilla), y el panel lo declara.
 */

import type {
  AcoSensitivityPayload,
  CalibrationAxis,
  ObjectiveSweepPayload,
  ObjectiveSweepRun,
} from '../../core/api/benchmark';
import {
  amplitudeLabel,
  levelLabel,
  summarizeAxes,
  type CalibrationAxisSummary,
} from './calibrationSensitivityUx';
import {
  acceptanceSummary,
  isBaselineRun,
  isValidObjectiveRun,
  weightsLabel,
} from './calibrationObjectiveUx';

export interface AdvisorAxisPick {
  axis: CalibrationAxis;
  labelKey: string;
  /** El eje no mueve la distancia: no se propone nivel nuevo. */
  keep: boolean;
  /** Nivel propuesto (`null` cuando `keep`). */
  level: string | null;
  km: number | null;
  /** Amplitud medida del eje: lo que se gana/pierde al mover esa perilla. */
  amplitudeKm: number | null;
  amplitudePct: string;
  cpuSeconds: number | null;
}

export interface AdvisorProfile {
  picks: AdvisorAxisPick[];
  /** La mejor corrida se detuvo por early-stop: la comparación está confundida. */
  earlyStop: boolean;
  bestKm: number | null;
  referenceKm: number | null;
}

export interface AdvisorOperatingPoint {
  label: string;
  weights: string;
  km: number;
  savingPct: number | null;
  maxRouteHours: number | null;
  activeVehicles: number | null;
  finishUnderTargetPct: number | null;
  workloadStdHours: number | null;
  fairnessIndex: number | null;
  /** Criterios de aceptación que respalda esta corrida. */
  acceptedBy: string[];
}

export interface AdvisorAlternative {
  label: string;
  weights: string;
  km: number;
  noteKey: string;
}

export interface CalibrationAdvice {
  profile: AdvisorProfile | null;
  operating: AdvisorOperatingPoint | null;
  alternatives: AdvisorAlternative[];
  /** Configuraciones que la evidencia muestra que empeoran la distancia. */
  avoid: AdvisorAlternative[];
  /** Criterios con veredicto automático, para el encabezado del panel. */
  acceptanceOk: string;
}

function axisPick(summary: CalibrationAxisSummary): AdvisorAxisPick | null {
  const best = summary.ranked[0];
  if (!best) return null;
  const keep = summary.stable;
  return {
    axis: summary.axis,
    labelKey: summary.labelKey,
    keep,
    level: keep ? null : levelLabel(best),
    km: keep ? null : (best.distanceKmOptimized as number),
    amplitudeKm: summary.amplitudeKm,
    amplitudePct: amplitudeLabel(summary),
    cpuSeconds: best.computationSeconds ?? null,
  };
}

/** Perfil sugerido: mejor nivel medido de cada eje y los ejes que no mueven la aguja. */
export function advisorProfile(payload: AcoSensitivityPayload): AdvisorProfile | null {
  if (!payload.runs?.length) return null;
  const summaries = summarizeAxes(payload.runs);
  const picks = summaries.map(axisPick).filter((pick): pick is AdvisorAxisPick => pick !== null);
  if (!picks.length) return null;

  const measured = picks.filter((pick) => pick.km !== null) as (AdvisorAxisPick & { km: number })[];
  const best = measured.length
    ? measured.reduce((min, pick) => (pick.km < min.km ? pick : min))
    : null;
  const reference = payload.runs.find((run) => typeof run.distanceKmBaseline === 'number');

  return {
    picks,
    earlyStop: payload.runs.some((run) => run.acoStoppedEarly === true),
    bestKm: best?.km ?? null,
    referenceKm: reference?.distanceKmBaseline ?? null,
  };
}

function toOperating(run: ObjectiveSweepRun, acceptedBy: string[]): AdvisorOperatingPoint {
  return {
    label: run.label,
    weights: weightsLabel(run),
    km: run.distanceKmOptimized as number,
    savingPct: run.savingPct ?? null,
    maxRouteHours: run.maxRouteHours ?? null,
    activeVehicles: run.activeVehicles ?? null,
    finishUnderTargetPct: run.finishUnderTargetPct ?? null,
    workloadStdHours: run.workloadStdHours ?? null,
    fairnessIndex: run.fairnessIndex ?? null,
    acceptedBy,
  };
}

/**
 * Punto de operación sugerido: el que el motor aceptó en AC-1/AC-2 (menor distancia que
 * cumple flota ≥ 3 y jornada ≤ 8 h). Si no hay veredicto, cae a la mejor corrida válida
 * de la serie de 8 h.
 */
export function advisorOperatingPoint(
  payload: ObjectiveSweepPayload,
): AdvisorOperatingPoint | null {
  const valid = payload.runs.filter(isValidObjectiveRun);
  if (!valid.length) return null;

  const accepted = payload.acceptance?.ac1?.acceptedPoint;
  const candidates = payload.acceptance?.ac2?.candidates ?? [];
  const byLabel = (label: string) => valid.find((run) => run.label === label) ?? null;

  if (accepted) {
    const run = byLabel(accepted.label);
    if (run) {
      const badges = ['AC-1'];
      if (candidates.includes(run.label)) badges.push('AC-2');
      return toOperating(run, badges);
    }
  }

  const eightHour = valid.filter((run) => run.durationHours === 8);
  const pool = eightHour.length ? eightHour : valid;
  const best = pool.reduce((min, run) =>
    (run.distanceKmOptimized ?? Infinity) < (min.distanceKmOptimized ?? Infinity) ? run : min,
  );
  return toOperating(best, []);
}

/** Alternativas razonables y configuraciones que la evidencia muestra peores. */
export function advisorAlternatives(payload: ObjectiveSweepPayload): {
  alternatives: AdvisorAlternative[];
  avoid: AdvisorAlternative[];
} {
  const valid = payload.runs.filter(isValidObjectiveRun);
  const eightHour = valid.filter((run) => run.durationHours === 8);
  const operating = advisorOperatingPoint(payload);
  if (!operating) return { alternatives: [], avoid: [] };

  const limit = operating.km * 1.1;
  const bestFairness = Math.max(...eightHour.map((other) => other.fairnessIndex ?? 0));
  const bestHours = Math.min(...eightHour.map((other) => other.maxRouteHours ?? Infinity));
  const alternatives = eightHour
    .filter((run) => run.label !== operating.label && (run.distanceKmOptimized ?? Infinity) <= limit)
    .sort((a, b) => (a.distanceKmOptimized ?? 0) - (b.distanceKmOptimized ?? 0))
    .slice(0, 3)
    .map((run) => {
      const noteKey =
        run.fairnessIndex === bestFairness
          ? 'calibration.advice.noteFairness'
          : run.maxRouteHours === bestHours
            ? 'calibration.advice.noteHours'
            : 'calibration.advice.noteValid';
      return {
        label: run.label,
        weights: weightsLabel(run),
        km: run.distanceKmOptimized as number,
        noteKey,
      };
    });

  const baseline = eightHour.find(isBaselineRun);
  const avoid = eightHour
    .filter(
      (run) =>
        !isBaselineRun(run) &&
        run.workloadBalanceWeight >= 2 &&
        baseline !== undefined &&
        (run.distanceKmOptimized ?? Infinity) > (baseline.distanceKmOptimized ?? Infinity),
    )
    .sort((a, b) => (a.distanceKmOptimized ?? 0) - (b.distanceKmOptimized ?? 0))
    .map((run) => ({
      label: run.label,
      weights: weightsLabel(run),
      km: run.distanceKmOptimized as number,
      noteKey: 'calibration.advice.noteWorse',
    }));

  return { alternatives, avoid };
}

export function calibrationAdvice(input: {
  sensitivity?: AcoSensitivityPayload;
  objective?: ObjectiveSweepPayload;
}): CalibrationAdvice {
  const { alternatives, avoid } = input.objective
    ? advisorAlternatives(input.objective)
    : { alternatives: [], avoid: [] };
  const summary = input.objective ? acceptanceSummary(input.objective) : null;

  return {
    profile: input.sensitivity ? advisorProfile(input.sensitivity) : null,
    operating: input.objective ? advisorOperatingPoint(input.objective) : null,
    alternatives,
    avoid,
    acceptanceOk: summary ? `${summary.ok}/${summary.total}` : '—',
  };
}
