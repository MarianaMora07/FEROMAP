/**
 * Derivaciones del estudio de sensibilidad ACO (Fase 13, §7.3 del plan de la vista).
 *
 * Regla de oro: **ninguna corrida con `error` o `uncoveredPoints > 0` entra en el
 * ranking**. La métrica primaria es la distancia optimizada.
 */

import type { AcoSensitivityPayload, AcoSensitivityRun, CalibrationAxis } from '../../core/api/benchmark';

/** Orden de presentación de los ejes (series de `aco_sensitivity_service`). */
export const AXIS_ORDER: CalibrationAxis[] = ['ants', 'iterations', 'alpha', 'beta', 'rho', 'q'];

/** Un eje es «estable» si su amplitud ≤ 0,5 % de la mejor distancia global. */
export const STABLE_AMPLITUDE_PCT = 0.5;

export interface CalibrationAxisSummary {
  axis: CalibrationAxis;
  labelKey: string;
  /** Mejor corrida válida del eje (menor distancia). */
  best: AcoSensitivityRun | null;
  bestKm: number | null;
  minKm: number | null;
  maxKm: number | null;
  amplitudeKm: number | null;
  /** Amplitud relativa a la mejor distancia global, en %. */
  amplitudePct: number | null;
  stable: boolean;
  /** Corridas válidas del eje, ordenadas por distancia. */
  ranked: AcoSensitivityRun[];
  /** Corridas excluidas del ranking (error o puntos no cubiertos). */
  excluded: AcoSensitivityRun[];
}

export function axisLabelKey(axis: CalibrationAxis): string {
  return `calibration.axis.${axis}`;
}

/** Nivel del eje en esa corrida (hormigas, iteraciones o valor del hiperparámetro). */
export function levelValue(run: AcoSensitivityRun): number | null {
  switch (run.axis) {
    case 'ants':
      return run.acoAnts;
    case 'iterations':
      return run.acoIterations;
    case 'alpha':
      return run.acoAlpha ?? null;
    case 'beta':
      return run.acoBeta ?? null;
    case 'rho':
      return run.acoRho ?? null;
    case 'q':
      return run.pheromoneQ ?? null;
    default:
      return null;
  }
}

/** Etiqueta corta del nivel: `8`, `20`, `α 0.5`. */
export function levelLabel(run: AcoSensitivityRun): string {
  const value = levelValue(run);
  const prefix: Partial<Record<CalibrationAxis, string>> = {
    alpha: 'α ',
    beta: 'β ',
    rho: 'ρ ',
    q: 'Q ',
  };
  if (value === null) return run.label;
  return `${prefix[run.axis] ?? ''}${value}`;
}

export function axisRuns(runs: AcoSensitivityRun[], axis: CalibrationAxis): AcoSensitivityRun[] {
  return runs.filter((run) => run.axis === axis);
}

export function isValidRun(run: AcoSensitivityRun): boolean {
  if (run.error) return false;
  if ((run.uncoveredPoints ?? 0) > 0) return false;
  return typeof run.distanceKmOptimized === 'number' && Number.isFinite(run.distanceKmOptimized);
}

/** Corridas válidas del eje ordenadas por distancia optimizada (KPI primario). */
export function rankedRuns(runs: AcoSensitivityRun[], axis: CalibrationAxis): AcoSensitivityRun[] {
  return axisRuns(runs, axis)
    .filter(isValidRun)
    .sort((a, b) => (a.distanceKmOptimized ?? 0) - (b.distanceKmOptimized ?? 0));
}

export function excludedRuns(runs: AcoSensitivityRun[]): AcoSensitivityRun[] {
  return runs.filter((run) => !isValidRun(run));
}

export function bestRun(runs: AcoSensitivityRun[]): AcoSensitivityRun | null {
  const ranked = runs.filter(isValidRun).sort(
    (a, b) => (a.distanceKmOptimized ?? 0) - (b.distanceKmOptimized ?? 0),
  );
  return ranked[0] ?? null;
}

export function bestGlobalKm(runs: AcoSensitivityRun[]): number | null {
  return bestRun(runs)?.distanceKmOptimized ?? null;
}

/** Distancia de referencia (baseline) reportada por las corridas. */
export function baselineKm(runs: AcoSensitivityRun[]): number | null {
  const run = runs.find((item) => typeof item.distanceKmBaseline === 'number');
  return run?.distanceKmBaseline ?? null;
}

export function summarizeAxes(runs: AcoSensitivityRun[]): CalibrationAxisSummary[] {
  const best = bestGlobalKm(runs);
  return AXIS_ORDER.map((axis) => {
    const axisCases = axisRuns(runs, axis);
    const ranked = rankedRuns(runs, axis);
    const distances = ranked.map((run) => run.distanceKmOptimized as number);
    const minKm = distances.length ? Math.min(...distances) : null;
    const maxKm = distances.length ? Math.max(...distances) : null;
    const amplitudeKm = minKm !== null && maxKm !== null ? maxKm - minKm : null;
    const amplitudePct =
      amplitudeKm !== null && best !== null && best > 0 ? (amplitudeKm / best) * 100 : null;
    return {
      axis,
      labelKey: axisLabelKey(axis),
      best: ranked[0] ?? null,
      bestKm: ranked[0]?.distanceKmOptimized ?? null,
      minKm,
      maxKm,
      amplitudeKm,
      amplitudePct,
      stable: amplitudePct !== null && amplitudePct <= STABLE_AMPLITUDE_PCT,
      ranked,
      excluded: axisCases.filter((run) => !isValidRun(run)),
    };
  });
}

/** Eje con mayor amplitud de distancia (el más sensible al parámetro). */
export function mostSensitiveAxis(
  summaries: CalibrationAxisSummary[],
): CalibrationAxisSummary | null {
  const comparable = summaries.filter(
    (summary) => summary.amplitudePct !== null && summary.ranked.length > 0,
  );
  if (comparable.length === 0) return null;
  return comparable.reduce((worst, summary) =>
    (summary.amplitudePct ?? 0) > (worst.amplitudePct ?? 0) ? summary : worst,
  );
}

export function stableAxes(summaries: CalibrationAxisSummary[]): CalibrationAxisSummary[] {
  return summaries.filter((summary) => summary.stable);
}

/** La mejor corrida no usó early-stop y agotó las iteraciones configuradas. */
export function bestRunWithoutEarlyStop(runs: AcoSensitivityRun[]): AcoSensitivityRun | null {
  const best = bestRun(runs);
  if (!best) return null;
  if (best.acoStoppedEarly === false) return best;
  return null;
}

export interface CalibrationFinding {
  /** Clave i18n del enunciado; los números viajan en `detail`. */
  key: string;
  detail: string;
}

/**
 * Lectura automática (§7 de la vista): mejor resultado, eje más sensible y avisos de
 * calidad. Las claves i18n se traducen en el componente.
 */
export function readingFindings(
  payload: AcoSensitivityPayload,
): { labelKey: string; detail: string }[] {
  const findings: { labelKey: string; detail: string }[] = [];
  const summaries = summarizeAxes(payload.runs);
  const best = bestRun(payload.runs);
  if (best) {
    findings.push({
      labelKey: 'calibration.reading.best',
      detail: `${best.label} · ${best.distanceKmOptimized?.toFixed(1)} km`,
    });
  }

  const sensitive = mostSensitiveAxis(summaries);
  if (sensitive) {
    findings.push({
      labelKey: 'calibration.reading.sensitive',
      detail: `${sensitive.labelKey} · ${sensitive.amplitudePct?.toFixed(1) ?? '—'} % (${
        sensitive.amplitudeKm?.toFixed(1) ?? '—'
      } km)`,
    });
  }

  const stable = stableAxes(summaries);
  findings.push({
    labelKey: 'calibration.reading.stable',
    detail: stable.length
      ? `${stable.length}/${summaries.length} · ${stable.map((s) => s.axis).join(', ')}`
      : '—',
  });

  const withoutEarlyStop = bestRunWithoutEarlyStop(payload.runs);
  findings.push({
    labelKey: 'calibration.reading.quality',
    detail: withoutEarlyStop
      ? `${withoutEarlyStop.label} · ${withoutEarlyStop.acoIterationsRun ?? '—'} iteraciones`
      : 'sin corrida sin early-stop',
  });

  const excluded = excludedRuns(payload.runs);
  if (excluded.length) {
    findings.push({
      labelKey: 'calibration.reading.excluded',
      detail: `${excluded.length} · ${excluded.map((run) => run.label).join(', ')}`,
    });
  }

  return findings;
}
