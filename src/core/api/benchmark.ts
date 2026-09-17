import type { AcoConvergencePoint } from '../../data/types/simulation';
import { ApiError, apiGet, apiPost, useMocks } from './client';
import { mockAcoBenchmark } from '../../data/mock/benchmark';

export interface AcoBenchmarkRun {
  scenarioId: string;
  scenarioLabel: string;
  profileId: string;
  profileLabel: string;
  acoAnts: number;
  acoIterations: number;
  computationSeconds?: number;
  graphLoadSeconds?: number;
  acoSeconds?: number;
  overheadSeconds?: number;
  savingPct?: number;
  distanceKmOptimized?: number;
  acoIterationsRun?: number;
  acoStoppedEarly?: boolean;
  matrixCacheHit?: boolean;
  matrixCacheIncremental?: boolean;
  error?: string;
}

export interface AcoBenchmarkPayload {
  generatedAt: string;
  durationSeconds: number;
  scenarioCount: number;
  profileCount: number;
  runs: AcoBenchmarkRun[];
}

export function fetchAcoBenchmark(): Promise<AcoBenchmarkPayload> {
  if (useMocks) return Promise.resolve(mockAcoBenchmark);
  return apiGet<AcoBenchmarkPayload>('/api/v1/benchmarks/aco');
}

export function runAcoBenchmark(): Promise<AcoBenchmarkPayload> {
  if (useMocks) return Promise.resolve(mockAcoBenchmark);
  return apiPost<AcoBenchmarkPayload>('/api/v1/benchmarks/aco', {});
}

export type CalibrationAxis = 'ants' | 'iterations' | 'alpha' | 'beta' | 'rho' | 'q';

export interface AcoSensitivityRun {
  label: string;
  scenarioId: string;
  acoAnts: number;
  acoIterations: number;
  axis: CalibrationAxis;
  acoAlpha?: number | null;
  acoBeta?: number | null;
  acoRho?: number | null;
  pheromoneQ?: number | null;
  computationSeconds?: number;
  acoSeconds?: number;
  distanceKmOptimized?: number;
  distanceKmBaseline?: number;
  acoIterationsRun?: number;
  acoStoppedEarly?: boolean;
  uncoveredPoints?: number;
  savingPct?: number;
  error?: string;
}

export interface AcoSensitivityPayload {
  generatedAt: string;
  durationSeconds: number;
  scenarioId: string;
  seed?: number;
  standardProfile: { acoAnts: number; acoIterations: number };
  standardHyperparameters?: Record<string, number>;
  runs: AcoSensitivityRun[];
  /** Sello de instancia: lo escribe el backend al guardar (`null` si es antiguo). */
  instanceFingerprint?: string | null;
  /** Estado frente a la instancia actual: lo añade el `GET`. */
  currentFingerprint?: string;
  cacheState?: CalibrationCacheState;
  stale?: boolean;
}

export function fetchAcoSensitivity(): Promise<AcoSensitivityPayload> {
  if (useMocks) {
    return Promise.resolve({
      generatedAt: new Date().toISOString(),
      durationSeconds: 48,
      scenarioId: 'normal',
      standardProfile: { acoAnts: 12, acoIterations: 20 },
      runs: [
        {
          label: '8 hormigas',
          scenarioId: 'normal',
          acoAnts: 8,
          acoIterations: 20,
          axis: 'ants',
          computationSeconds: 6.2,
          distanceKmOptimized: 31.4,
          acoIterationsRun: 20,
        },
        {
          label: '12 hormigas (estándar)',
          scenarioId: 'normal',
          acoAnts: 12,
          acoIterations: 20,
          axis: 'ants',
          computationSeconds: 8.1,
          distanceKmOptimized: 31.1,
          acoIterationsRun: 20,
        },
        {
          label: '20 hormigas',
          scenarioId: 'normal',
          acoAnts: 20,
          acoIterations: 20,
          axis: 'ants',
          computationSeconds: 11.4,
          distanceKmOptimized: 30.9,
          acoIterationsRun: 20,
        },
      ],
    });
  }
  return apiGet<AcoSensitivityPayload>('/api/v1/benchmarks/aco/sensitivity');
}

export function runAcoSensitivity(): Promise<AcoSensitivityPayload> {
  if (useMocks) return fetchAcoSensitivity();
  return apiPost<AcoSensitivityPayload>('/api/v1/benchmarks/aco/sensitivity', {});
}

// --- Calibración del motor: jobs asíncronos y barrido de pesos (Fase 13) -----

export type CalibrationSweep = 'sensitivity' | 'objective';
export type CalibrationJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'failed';

/** Estado de una caché histórica frente a la instancia de BD actual. */
export type CalibrationCacheState = 'fresh' | 'stale' | 'unknown';

export interface CalibrationFreshness {
  /** Sello con el que se generó (lo escribe el backend al guardar). */
  instanceFingerprint: string | null;
  /** Sello de la instancia vigente (lo añade el GET). */
  currentFingerprint: string;
  cacheState: CalibrationCacheState;
  stale: boolean;
}

/** Corrida del barrido de pesos del objetivo (`run_multiobjective_sweep`). */
export interface ObjectiveSweepRun {
  label: string;
  durationHours: number | null;
  workloadBalanceWeight: number;
  makespanWeight: number;
  minActiveVehiclesRequested: number | null;
  minActiveVehicles?: number | null;
  distanceKmOptimized?: number;
  distanceKmBaseline?: number;
  savingPct?: number;
  activeVehicles?: number;
  fleetUtilizationPct?: number | null;
  maxRouteHours?: number;
  shiftSlackHours?: number | null;
  finishUnderTargetPct?: number | null;
  workloadStdHours?: number | null;
  fairnessIndex?: number | null;
  vehicleWorkloadHours?: number[] | null;
  uncoveredPoints?: number;
  computationSeconds?: number;
  error?: string;
}

export interface ObjectiveSweepCheck {
  label: string;
  distanceKmOptimized: number;
  baselineKm: number;
  limitKm: number;
  ratio: number;
  ok: boolean;
}

export interface ObjectiveSweepAcceptance {
  ac1: {
    criterion: string;
    acceptedPoint: ObjectiveSweepCheck | null;
    checks: ObjectiveSweepCheck[];
    exceptions: ObjectiveSweepCheck[];
    ok: boolean;
  };
  ac2: { criterion: string; candidates: string[]; ok: boolean };
  ac3: { criterion: string; evidence: string; ok: boolean | null };
}

export interface ObjectiveSweepPayload {
  generatedAt: string;
  durationSeconds: number;
  scenarioId: string;
  seed: number;
  maxRouteHoursTarget: number;
  runs: ObjectiveSweepRun[];
  paretoFrontier: ObjectiveSweepRun[];
  acceptance: ObjectiveSweepAcceptance;
  /** Sello de instancia: lo escribe el backend al guardar (`null` si es antiguo). */
  instanceFingerprint?: string | null;
  /** Estado frente a la instancia actual: lo añade el `GET`. */
  currentFingerprint?: string;
  cacheState?: CalibrationCacheState;
  stale?: boolean;
}

export interface CalibrationHistoryItem {
  runId: string;
  sweep: CalibrationSweep | null;
  scenarioId: string | null;
  seed: number | null;
  durationSeconds: number | null;
  instanceFingerprint: string | null;
  cacheState: CalibrationCacheState;
  stale: boolean;
  createdAt: string | null;
}

export interface CalibrationHistoryPage {
  items: CalibrationHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface CalibrationHistoryRun extends CalibrationHistoryItem {
  payload: CalibrationJobResult;
}

export interface CalibrationJobLogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: string;
  phaseId?: string;
}

export type CalibrationJobResult = AcoSensitivityPayload | ObjectiveSweepPayload;

export interface CalibrationJobSnapshot {
  jobId: string;
  jobType: string;
  sweep: CalibrationSweep | null;
  status: CalibrationJobStatus;
  phase: string | null;
  progress: number;
  /** Corrida en curso (1-based). */
  current: number | null;
  total: number | null;
  currentLabel: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  result: CalibrationJobResult | null;
  error: string | null;
  logs: CalibrationJobLogEntry[];
}

export interface CalibrationJobRequest {
  scenarioId?: string;
  seed?: number;
  refresh?: boolean;
}

/** Lectura del barrido de pesos ya calculado (404 si no hay caché). */
export function fetchObjectiveSweep(): Promise<ObjectiveSweepPayload> {
  if (useMocks) {
    // Sin caché real en modo demo: se propaga el 404 para que la vista muestre
    // el estado «sin datos» en vez de inventar evidencia de calibración.
    return Promise.reject(
      new ApiError('No hay barrido de pesos en caché (modo demo con VITE_USE_MOCKS=true).', 404),
    );
  }
  return apiGet<ObjectiveSweepPayload>('/api/v1/benchmarks/objective/sweep');
}

/** Lanza un barrido como job asíncrono (202 `{jobId}` en el servidor). */
export function startCalibrationJob(
  sweep: CalibrationSweep,
  request: CalibrationJobRequest,
): Promise<{ jobId: string }> {
  if (useMocks) {
    return Promise.reject(
      new ApiError('Ejecución deshabilitada en modo demo; usa just phase3-sensitivity / phase13-sweep.', 400),
    );
  }
  const path =
    sweep === 'sensitivity'
      ? '/api/v1/benchmarks/aco/sensitivity/jobs'
      : '/api/v1/benchmarks/objective/sweep/jobs';
  return apiPost<{ jobId: string }>(path, request);
}

export function fetchCalibrationJob(jobId: string): Promise<CalibrationJobSnapshot> {
  return apiGet<CalibrationJobSnapshot>(`/api/v1/benchmarks/calibration/jobs/${jobId}`);
}

export function cancelCalibrationJob(jobId: string): Promise<{ jobId: string; status: string }> {
  return apiPost<{ jobId: string; status: string }>(
    `/api/v1/benchmarks/calibration/jobs/${jobId}/cancel`,
    {},
  );
}

/** Historial de corridas guardadas en la BD (información histórica). */
export function fetchCalibrationHistory(limit = 20): Promise<CalibrationHistoryPage> {
  if (useMocks) {
    return Promise.resolve({ items: [], total: 0, limit, offset: 0 });
  }
  return apiGet<CalibrationHistoryPage>(`/api/v1/benchmarks/calibration/history?limit=${limit}`);
}

/** Payload completo de una corrida histórica (404 si no existe). */
export function fetchCalibrationRun(runId: string): Promise<CalibrationHistoryRun> {
  if (useMocks) {
    return Promise.reject(new ApiError('Historial no disponible en modo demo.', 404));
  }
  return apiGet<CalibrationHistoryRun>(`/api/v1/benchmarks/calibration/history/${runId}`);
}

// --- Benchmark entre familias (ACO vs Clarke-Wright vs GA) — Tarea 6 --------

export interface AlgorithmsBenchmarkRun {
  scenarioId: string;
  scenarioLabel: string;
  instanceSize: number;
  seed: number;
  family: 'aco' | 'clarke_wright' | 'genetic';
  familyLabel: string;
  distanceKm: number;
  cpuSeconds: number;
  uncoveredCount: number;
  vehicles: number;
}

export interface AlgorithmsBenchmarkPayload {
  generatedAt: string;
  durationSeconds: number;
  methodology: string;
  scenarios: string[];
  instanceSizes: number[];
  seeds: number[];
  families: string[];
  runs: AlgorithmsBenchmarkRun[];
}

export function fetchAlgorithmsBenchmark(): Promise<AlgorithmsBenchmarkPayload> {
  if (useMocks) return Promise.resolve(mockAlgorithmsBenchmark());
  return apiGet<AlgorithmsBenchmarkPayload>('/api/v1/benchmarks/algorithms');
}

export function runAlgorithmsBenchmark(): Promise<AlgorithmsBenchmarkPayload> {
  if (useMocks) return Promise.resolve(mockAlgorithmsBenchmark());
  return apiPost<AlgorithmsBenchmarkPayload>('/api/v1/benchmarks/algorithms', {});
}

function mockAlgorithmsBenchmark(): AlgorithmsBenchmarkPayload {
  const labels: Record<string, string> = {
    aco: 'ACO (12×20)',
    clarke_wright: 'Clarke-Wright',
    genetic: 'GA (34×70)',
  };
  const runs: AlgorithmsBenchmarkRun[] = [];
  const sizes = [15, 30, 60];
  for (const size of sizes) {
    let best = 0;
    for (const [index, family] of ['aco', 'clarke_wright', 'genetic'].entries()) {
      const factor = family === 'aco' ? 0.92 : family === 'genetic' ? 1.0 : 1.08;
      const base = 90 + size * 1.7;
      const distanceKm = Math.round(base * factor * 10) / 10;
      if (family === 'aco') best = distanceKm;
      runs.push({
        scenarioId: 'normal',
        scenarioLabel: 'Tráfico normal',
        instanceSize: size,
        seed: 101,
        family: family as AlgorithmsBenchmarkRun['family'],
        familyLabel: labels[family]!,
        distanceKm,
        cpuSeconds: Math.round(((family === 'aco' ? 3.2 : family === 'genetic' ? 2.1 : 0.1) + size / 40) * 100) / 100,
        uncoveredCount: 0,
        vehicles: index + 2,
      });
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    durationSeconds: 0,
    methodology:
      'Instancias controladas del catálogo. No son rutas históricas: sirven para comparar familias sobre el mismo problema.',
    scenarios: ['normal'],
    instanceSizes: sizes,
    seeds: [101],
    families: ['aco', 'clarke_wright', 'genetic'],
    runs,
  };
}

export type { AcoConvergencePoint };
