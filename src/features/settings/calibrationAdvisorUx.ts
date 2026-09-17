/**
 * Recomendación de calibración a partir de la evidencia (Fase 13 · vista de calibración).
 *
 * Todo lo que sale de aquí **está en los payloads**: niveles medidos, distancias y
 * criterios. No se extrapola ni se inventa la combinación de los mejores niveles (el
 * barrido es OFAT y de una sola semilla), y el panel lo declara.
 */

import type {
  AcoSensitivityPayload,
  AcoValidationParams,
  CalibrationAxis,
  ObjectiveSweepPayload,
  ObjectiveSweepRun,
} from '../../core/api/benchmark';
import {
  amplitudeLabel,
  bestRun,
  levelLabel,
  mostSensitiveAxis,
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
  /** Eje con mayor amplitud de distancia: el que de verdad importa. */
  sensitive: boolean;
  /** El nivel propuesto es el que logró la mejor distancia medida de todo el barrido. */
  bestMeasured: boolean;
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

function axisPick(
  summary: CalibrationAxisSummary,
  flags: { sensitive: boolean; bestMeasured: boolean },
): AdvisorAxisPick | null {
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
    sensitive: flags.sensitive,
    bestMeasured: flags.bestMeasured,
  };
}

/** Perfil sugerido: mejor nivel medido de cada eje y los ejes que no mueven la aguja. */
export function advisorProfile(payload: AcoSensitivityPayload): AdvisorProfile | null {
  if (!payload.runs?.length) return null;
  const summaries = summarizeAxes(payload.runs);
  const sensitive = mostSensitiveAxis(summaries);
  // Mismo número que la «lectura automática»: una sola noción de «mejor medido».
  const bestKm = bestRun(payload.runs)?.distanceKmOptimized ?? null;

  const picks = summaries
    .map((summary) => {
      const candidateKm = summary.stable
        ? null
        : ((summary.ranked[0]?.distanceKmOptimized as number | undefined) ?? null);
      return axisPick(summary, {
        sensitive: sensitive?.axis === summary.axis,
        bestMeasured: candidateKm !== null && bestKm !== null && candidateKm === bestKm,
      });
    })
    .filter((pick): pick is AdvisorAxisPick => pick !== null);
  if (!picks.length) return null;

  const reference = payload.runs.find((run) => typeof run.distanceKmBaseline === 'number');

  return {
    picks,
    earlyStop: payload.runs.some((run) => run.acoStoppedEarly === true),
    bestKm,
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

/** Perfil estándar del motor (12×20 · α1 β3 ρ0.12 Q1); espejo de `STANDARD_PARAMS`. */
export const STANDARD_ACO_PARAMS: AcoValidationParams = {
  acoAnts: 12,
  acoIterations: 20,
  acoAlpha: 1,
  acoBeta: 3,
  acoRho: 0.12,
  pheromoneQ: 1,
};

/**
 * Combinación concreta que la vista recomienda, lista para validar contra el estándar.
 *
 * Repite la regla del panel: mejor nivel medido de cada eje **no estable**; los ejes
 * estables (amplitud ≤ 0,5 %) se quedan en el valor estándar para no desviarse sin ganar
 * nada. Así la validación prueba exactamente lo que la vista muestra.
 */
export function advisorProfileParams(payload: AcoSensitivityPayload): AcoValidationParams {
  const params: AcoValidationParams = { ...STANDARD_ACO_PARAMS };
  for (const summary of summarizeAxes(payload.runs)) {
    if (summary.stable) continue;
    const best = summary.ranked[0];
    if (!best) continue;
    switch (summary.axis) {
      case 'ants':
        params.acoAnts = best.acoAnts;
        break;
      case 'iterations':
        params.acoIterations = best.acoIterations;
        break;
      case 'alpha':
        if (best.acoAlpha != null) params.acoAlpha = best.acoAlpha;
        break;
      case 'beta':
        if (best.acoBeta != null) params.acoBeta = best.acoBeta;
        break;
      case 'rho':
        if (best.acoRho != null) params.acoRho = best.acoRho;
        break;
      case 'q':
        if (best.pheromoneQ != null) params.pheromoneQ = best.pheromoneQ;
        break;
    }
  }
  return params;
}

/** True si la combinación recomendada no se desvía del perfil estándar. */
export function isStandardProfile(params: AcoValidationParams): boolean {
  return (Object.keys(STANDARD_ACO_PARAMS) as (keyof AcoValidationParams)[]).every(
    (field) => params[field] === STANDARD_ACO_PARAMS[field],
  );
}
