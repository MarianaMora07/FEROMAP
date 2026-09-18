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

export type CalibrationSweep = 'sensitivity' | 'objective' | 'validation' | 'method';
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

export interface AcoValidationParams {
  acoAnts: number;
  acoIterations: number;
  acoAlpha: number;
  acoBeta: number;
  acoRho: number;
  pheromoneQ: number;
}

/** Una de las dos corridas de la validación: el control o la combinación propuesta. */
export interface AcoValidationRun {
  label: string;
  role: 'standard' | 'recommended';
  params: AcoValidationParams;
  computationSeconds?: number;
  acoSeconds?: number;
  distanceKmOptimized?: number;
  distanceKmBaseline?: number;
  savingPct?: number;
  acoIterationsRun?: number;
  acoStoppedEarly?: boolean;
  uncoveredPoints?: number;
  error?: string;
}

export type AcoValidationOutcome = 'better' | 'equal' | 'worse' | 'not-comparable';

export interface AcoValidationVerdict {
  outcome: AcoValidationOutcome;
  /** Motivo cuando el veredicto no es comparable (`error`, `uncovered`, `missing`). */
  reason: string | null;
  standardKm: number | null;
  recommendedKm: number | null;
  /** Combinación − estándar: negativo significa que la combinación mejora (D2). */
  deltaKm: number | null;
  deltaPct: number | null;
}

/**
 * Validación de la combinación recomendada contra el perfil estándar (Fase 13).
 *
 * Es la pieza que cierra el hueco del barrido OFAT: dos corridas en la misma sesión
 * responden si los mejores niveles medidos rinden juntos.
 */
export interface AcoValidationPayload {
  generatedAt: string;
  durationSeconds: number;
  scenarioId: string;
  seed: number | null;
  standardParams: AcoValidationParams;
  profile: AcoValidationParams;
  /** La combinación coincide con el estándar: no hay nada que confirmar. */
  sameParams: boolean;
  verdict: AcoValidationVerdict;
  runs: AcoValidationRun[];
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

export type CalibrationJobResult =
  | AcoSensitivityPayload
  | ObjectiveSweepPayload
  | AcoValidationPayload;

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
  /** Solo en la validación: la combinación que la vista muestra y quiere confirmar. */
  profile?: AcoValidationParams;
}

// --- Protocolo metodológico de calibración (C0–C8) ------------------------

// Tipos y constantes de las fases: en un módulo sin dependencias para que los helpers de UX
// puedan importarlos sin arrastrar el cliente HTTP (y con él el DOM).
import type {
  CalibrationMethodPhase,
  CalibrationMethodTarget,
} from './calibrationMethodPhases';
export {
  CALIBRATION_METHOD_ALL,
  CALIBRATION_METHOD_PHASES,
  CALIBRATION_METHOD_TARGETS,
  type CalibrationMethodPhase,
  type CalibrationMethodTarget,
} from './calibrationMethodPhases';

/** Resumen declarado del protocolo (δ, semillas y perfil estándar). */
export interface CalibrationMethodProtocol {
  deltaKm: number;
  seeds: number;
  iterations: number;
  standardProfile: string;
  standardHyperparameters: string;
  scenario: string;
  referenceRunId: number | null;
}

/** Trazabilidad de una fase: qué corrida de la BD la respalda. */
export interface CalibrationMethodPhaseTrace {
  runId: number | null;
  seeds: number;
  generatedAt: string | null;
  scenarioId: string | null;
  /** Sello de instancia de la corrida frente a la instancia vigente. */
  cacheState?: CalibrationCacheState;
  /** `true` si la corrida se midió con otra instancia: no es comparable con la actual. */
  stale?: boolean;
}

/** Perfil de hiperparámetros (estándar o recomendado). */
export interface CalibrationMethodProfile {
  acoAlpha: number;
  acoBeta: number;
  acoRho: number;
  pheromoneQ: number;
  acoPatience: number;
  acoAnts: number;
  acoIterations: number;
}

/** Justificación medida de una perilla del perfil (α/β/ρ/P/Q). */
export interface CalibrationMethodKnobJustification {
  value?: number;
  moved?: boolean;
  effectKm?: number | null;
  significant?: boolean;
  material?: boolean;
  reason?: string;
}

/** El presupuesto no es una perilla de distancia: conserva el estándar y declara alternativa. */
export interface CalibrationMethodBudgetJustification {
  value?: { acoAnts: number; acoIterations: number };
  alternative?: { acoAnts: number; acoIterations: number };
  moved?: boolean;
  reason?: string;
}

export interface CalibrationMethodJustification {
  acoAlpha?: CalibrationMethodKnobJustification;
  acoBeta?: CalibrationMethodKnobJustification;
  acoRho?: CalibrationMethodKnobJustification;
  acoPatience?: CalibrationMethodKnobJustification;
  pheromoneQ?: CalibrationMethodKnobJustification;
  budget?: CalibrationMethodBudgetJustification;
}

/** Perfil recomendado (E4) derivado del factorial de referencia. */
export interface CalibrationMethodRecommendation {
  available: boolean;
  phase?: string;
  deltaKm: number;
  ratioGoverns: boolean | null;
  standard: CalibrationMethodProfile;
  profile: CalibrationMethodProfile;
  justification: CalibrationMethodJustification;
  warnings: string[];
  rule?: string;
  limitations: string[];
}

/** Estadísticos descriptivos de una corrida (solo se consume la mediana). */
export interface CalibrationMethodStats {
  median: number | null;
}

/** Veredicto de validación del perfil recomendado frente al control (C6). */
export interface CalibrationMethodValidationAnalysis {
  comparable?: boolean;
  reason?: string;
  verdict?: 'equal' | 'better' | 'worse' | 'not-comparable';
  verdictReason?: string;
  delta?: {
    medianKm: number | null;
    ci: [number, number] | null;
    test?: { pValue: number | null };
    tost?: { pValue: number | null } | null;
  };
  control?: { stats?: CalibrationMethodStats };
  recommended?: { stats?: CalibrationMethodStats };
  limitations?: string[];
}

/** Un eje de la meseta de equivalencia del RSM (C5). */
export interface CalibrationMethodPlateauEntry {
  symbol: string;
  naturalRange: [number, number];
  bestNatural: number;
  curvature: number;
  linear?: number;
}

/** Ajuste de segundo orden y meseta de equivalencia (C5). */
export interface CalibrationMethodRsmAnalysis {
  comparable?: boolean;
  reason?: string;
  plateau?: Record<string, CalibrationMethodPlateauEntry>;
  warnings?: string[];
  limitations?: string[];
}

/** Análisis de cada fase; `null` cuando no hay evidencia de esa fase. */
export interface CalibrationMethodAnalyses {
  noise: Record<string, unknown> | null;
  factorial: Record<string, unknown> | null;
  budget: Record<string, unknown> | null;
  nocut: Record<string, unknown> | null;
  ratio: Record<string, unknown> | null;
  validation: CalibrationMethodValidationAnalysis | null;
  objective: CalibrationMethodObjectiveAnalysis | null;
  rsm: CalibrationMethodRsmAnalysis | null;
}

/**
 * C7 · criterios de aceptación evaluados sobre la **mediana** (no sobre un valor puntual).
 *
 * AC-1 compara la distancia mediana con la referencia (w = 0) y AC-2 exige 0 puntos sin cubrir,
 * flota suficiente y jornada bajo el techo. `ac2Reason` es la lectura que el backend declara
 * (incluye por qué AC-2 no se sostiene cuando el bloque de 8 h deja puntos sin cubrir).
 */
export interface CalibrationMethodObjectiveAnalysis {
  comparable?: boolean;
  reason?: string | null;
  blockHours?: number;
  deltaKm?: number | null;
  baselineLabel?: string | null;
  ac1?: { criterion?: string; ok?: boolean };
  ac2?: { criterion?: string; ok?: boolean };
  ac2Reason?: string | null;
  distanceInert?: boolean | null;
  headline?: string | null;
  points?: Record<string, unknown>[];
}

/**
 * Evidencia completa del protocolo metodológico, leída de la BD (0 CPU).
 *
 * El backend responde `409` si falta el factorial de referencia, del que derivan el
 * perfil recomendado y los análisis de C3.3/C5/C6.
 */
export interface CalibrationMethodEvidence {
  protocol: CalibrationMethodProtocol;
  phases: Record<CalibrationMethodPhase, CalibrationMethodPhaseTrace>;
  /** Fases cuya evidencia se midió con otra instancia (sello `stale`). */
  stalePhases?: CalibrationMethodPhase[];
  analyses: CalibrationMethodAnalyses;
  recommendation: CalibrationMethodRecommendation;
}

export interface CalibrationMethodEvidenceQuery {
  referenceRunId?: number;
  deltaKm?: number;
}

export interface CalibrationMethodJobRequest extends CalibrationJobRequest {
  /** Una fase, o `all` para correr el protocolo entero en un solo job. */
  phase: CalibrationMethodTarget;
  /** `null`/omitido = juego completo de 10 semillas; `[42, 101]` = verificación corta. */
  seeds?: number[] | null;
  /** Continúa un barrido cortado desde el salvavidas de E0. Por defecto, `true`. */
  resume?: boolean;
}

/** Lectura de la validación de la combinación (404 si nunca se ha lanzado). */
export function fetchAcoValidation(): Promise<AcoValidationPayload> {
  if (useMocks) {
    return Promise.reject(
      new ApiError('No hay validación de la combinación (modo demo con VITE_USE_MOCKS=true).', 404),
    );
  }
  return apiGet<AcoValidationPayload>('/api/v1/benchmarks/aco/validation');
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
      : sweep === 'validation'
        ? '/api/v1/benchmarks/aco/validation/jobs'
        : '/api/v1/benchmarks/objective/sweep/jobs';
  return apiPost<{ jobId: string }>(path, request);
}

/** Lee la evidencia del protocolo metodológico (0 CPU). */
export function fetchCalibrationMethodEvidence(
  query: CalibrationMethodEvidenceQuery = {},
): Promise<CalibrationMethodEvidence> {
  if (useMocks) return Promise.resolve(mockCalibrationMethodEvidence());
  const params = new URLSearchParams();
  if (query.referenceRunId !== undefined) params.set('referenceRunId', String(query.referenceRunId));
  if (query.deltaKm !== undefined) params.set('deltaKm', String(query.deltaKm));
  const suffix = params.toString();
  return apiGet<CalibrationMethodEvidence>(
    `/api/v1/benchmarks/calibration/method${suffix ? `?${suffix}` : ''}`,
  );
}

/** Lanza **una fase** del protocolo metodológico como job asíncrono (202 `{jobId}`). */
export function startCalibrationMethodJob(
  request: CalibrationMethodJobRequest,
): Promise<{ jobId: string }> {
  if (useMocks) {
    return Promise.reject(
      new ApiError('Ejecución deshabilitada en modo demo; usa just calib-report.', 400),
    );
  }
  return apiPost<{ jobId: string }>('/api/v1/benchmarks/calibration/method/jobs', request);
}

/** Evidencia plausible para el modo demo: no hay backend, pero la vista debe verse. */
function mockCalibrationMethodEvidence(): CalibrationMethodEvidence {
  const standard: CalibrationMethodProfile = {
    acoAlpha: 1,
    acoBeta: 3,
    acoRho: 0.12,
    pheromoneQ: 1,
    acoPatience: 5,
    acoAnts: 12,
    acoIterations: 20,
  };
  const profile: CalibrationMethodProfile = { ...standard, acoBeta: 5 };
  return {
    protocol: {
      deltaKm: 5.07,
      seeds: 10,
      iterations: 20,
      standardProfile: '12×20',
      standardHyperparameters: 'α1 β3 ρ0.12 Q1',
      scenario: 'normal',
      referenceRunId: 4,
    },
    phases: {
      noise: { runId: 1, seeds: 10, generatedAt: '2026-09-18T01:10:00+00:00', scenarioId: 'normal' },
      factorial: { runId: 4, seeds: 10, generatedAt: '2026-09-18T01:27:24+00:00', scenarioId: 'normal' },
      budget: { runId: 5, seeds: 10, generatedAt: '2026-09-18T01:40:00+00:00', scenarioId: 'normal' },
      nocut: { runId: 6, seeds: 10, generatedAt: '2026-09-18T01:52:00+00:00', scenarioId: 'normal' },
      identify: { runId: 7, seeds: 10, generatedAt: '2026-09-18T02:03:00+00:00', scenarioId: 'normal' },
      validate: { runId: null, seeds: 0, generatedAt: null, scenarioId: null },
      rsm: { runId: null, seeds: 0, generatedAt: null, scenarioId: null },
    },
    analyses: {
      noise: { phase: 'noise', limitations: [] },
      factorial: { phase: 'factorial', limitations: [] },
      budget: { phase: 'budget', limitations: [] },
      nocut: { phase: 'nocut', limitations: [] },
      ratio: { phase: 'ratio', limitations: [] },
      validation: null,
      rsm: null,
    },
    recommendation: {
      available: true,
      deltaKm: 5.07,
      ratioGoverns: false,
      standard,
      profile,
      justification: {
        acoAlpha: {
          value: 1,
          moved: false,
          effectKm: -8.2,
          significant: true,
          material: false,
          reason: 'efecto no material: se queda en el estándar 1',
        },
        acoBeta: {
          value: 5,
          moved: true,
          effectKm: -45.81,
          significant: true,
          material: true,
          reason: 'interacción material con acoAlpha pero el efecto simple supera δ: se mueve a 5',
        },
        acoRho: {
          value: 0.12,
          moved: false,
          effectKm: 1.4,
          significant: false,
          material: false,
          reason: 'efecto no material: se queda en el estándar 0.12',
        },
        acoPatience: {
          value: 5,
          moved: false,
          effectKm: 2.1,
          significant: false,
          material: false,
          reason: 'sin contraste: se queda en el estándar 5',
        },
        pheromoneQ: {
          value: 1,
          moved: false,
          material: false,
          reason: 'Q inerte dentro del ruido (C4): se queda en el estándar',
        },
        budget: {
          value: { acoAnts: 12, acoIterations: 20 },
          alternative: { acoAnts: 8, acoIterations: 30 },
          moved: false,
          reason: 'trabajo fijo equivalente: se conserva 12×20 y se declara (8×30) como opción de coste',
        },
      },
      warnings: ['β = 10 se midió fuera del rango del factorial: es extrapolación.'],
      rule: 'se mueve una perilla solo si su efecto desde el centro supera δ y es significativo',
      limitations: [
        'Una sola instancia y un solo escenario: la recomendación no generaliza entre instancias.',
      ],
    },
  };
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
