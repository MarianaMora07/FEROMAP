/**
 * Evidencia de la evaluación (tesis) expuesta en la vista de calibración.
 *
 * Las tres piezas comparten la caché JSON que escriben las recetas `just`
 * (`data/cache/*.json`), así que la lectura es 0 CPU. La generación es un job
 * genérico (`run_contingency_background`) que se consulta con el mismo visor que
 * las simulaciones (`GET /simulations/jobs/{id}`).
 */

import { ApiError, apiGet, apiPost, useMocks } from './client';
import { fetchSimulationOptimizeJob, type OptimizationJobStatus } from './simulationJobs';

export type ThesisEvidenceKind = 'baseline' | 'statistical' | 'case_study';

/** Par `current`/`optimized` de un KPI del motor. */
export interface KpiPair {
  current: number;
  optimized: number;
}

export interface BaselineEvidenceRun {
  scenarioId: string;
  distanceKm: KpiPair;
  durationHours: KpiPair;
  uncoveredPoints: number;
  co2KgAvoided: number;
  fuelLiters: KpiPair;
  coveragePct: Record<string, number>;
  criticalCoveragePct: Record<string, number>;
  containersServed: number;
  landfillTrips: number;
  activeVehicles?: number | null;
  fleetUtilizationPct?: number | null;
  maxRouteHours?: number | null;
  fairnessIndex?: number | null;
  computationSeconds: number;
  savingPct: number;
}

export interface BaselineEvidence {
  kind: 'baseline';
  generatedAt: string;
  acoProfile: { ants: number; iterations: number };
  scenarioIds: string[];
  runs: BaselineEvidenceRun[];
}

export interface StatisticalValidationRow {
  scenarioId: string;
  nRuns: number;
  nEffective: number;
  meanDistanceCurrent: number;
  meanDistanceOptimized: number;
  savingPct: number;
  stdDistanceOptimized: number;
  wilcoxon: { statistic: number | null; pValue: number | null };
  pValueHolm: number | null;
  effectSize: { rankBiserial: number | null; cohenDz: number | null };
  confidenceInterval: { lower: number | null; upper: number | null };
  isSignificant: boolean;
  isSignificantHolm: boolean;
}

export interface StatisticalEvidence {
  kind: 'statistical';
  generatedAt: string;
  nRuns: number;
  family: string[];
  validations: StatisticalValidationRow[];
}

export interface CaseStudyRow {
  code: string;
  name: string;
  scenarioId: string;
  simulationId: number;
  pointCount: number;
  servedPoints: number;
  uncoveredPoints: number;
  distanceKm: number;
  durationH: number;
  savingPct: number;
  routeCount: number;
  sharedPointDemandKg: number | null;
  sharedPointRoute: string | null;
  sharedPointSequence: number | null;
}

export interface CaseStudyEvidence {
  kind: 'case_study';
  generatedAt: string;
  sharedPointCode: string;
  usage: Record<string, string>;
  cases: CaseStudyRow[];
  sharedPoint: { code: string; demandKg: number | null; route: string | null; sequence: number | null } | null;
}

export type ThesisEvidencePayload = BaselineEvidence | StatisticalEvidence | CaseStudyEvidence;

export interface ThesisEvidenceJobSnapshot {
  jobId: string;
  status: OptimizationJobStatus;
  phase: string | null;
  progress: number;
  error: string | null;
  result: ThesisEvidencePayload | null;
}

export const THESIS_EVIDENCE_KINDS: readonly ThesisEvidenceKind[] = [
  'baseline',
  'statistical',
  'case_study',
];

/** Escenarios del contrato de evaluación (los 5 del capítulo). */
export const THESIS_SCENARIOS = ['normal', 'peak_traffic', 'rain', 'saturated', 'broken_vehicle'] as const;

/** Corridas pareadas por defecto de la validación estadística (cifra del capítulo). */
export const THESIS_STATISTICAL_N_RUNS = 30;
/** Atajo de iteración (equivale a `just wilcoxon --quick`). */
export const THESIS_STATISTICAL_QUICK_N_RUNS = 10;

function mockDisabled(): never {
  throw new ApiError(
    'Evidencia deshabilitada en modo demo; usa las recetas just (phase0-baseline, wilcoxon).',
    400,
  );
}

/** Evidencia guardada en caché. Devuelve `null` si aún no se ha generado (404). */
export async function loadThesisEvidence<T extends ThesisEvidencePayload>(
  kind: ThesisEvidenceKind,
): Promise<T | null> {
  if (useMocks) return null;
  try {
    return (await apiGet<T>(`/api/v1/benchmarks/thesis/${kind}`)) ?? null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export interface ThesisEvidenceJobRequest {
  /** Solo lo usa la validación estadística. */
  nRuns?: number;
  scenarioIds?: string[];
}

export function startThesisEvidenceJob(
  kind: ThesisEvidenceKind,
  request: ThesisEvidenceJobRequest = {},
): Promise<{ jobId: string }> {
  if (useMocks) return Promise.reject(mockDisabled());
  return apiPost<{ jobId: string }>(`/api/v1/benchmarks/thesis/${kind}/jobs`, request);
}

/** Snapshot del job con el `result` tipado como evidencia. */
export async function fetchThesisEvidenceJob(jobId: string): Promise<ThesisEvidenceJobSnapshot> {
  const snapshot = await fetchSimulationOptimizeJob(jobId);
  return {
    jobId: snapshot.jobId,
    status: snapshot.status,
    phase: snapshot.phase == null ? null : String(snapshot.phase),
    progress: snapshot.progress,
    error: snapshot.error,
    result: (snapshot.result as unknown as ThesisEvidencePayload | null) ?? null,
  };
}
