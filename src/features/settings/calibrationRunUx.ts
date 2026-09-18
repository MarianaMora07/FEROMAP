/**
 * Lógica de ejecución de la calibración del motor (Fase 13).
 *
 * Módulo puro (sin DOM ni Solid) para poder testear la máquina de estados del §8 del
 * plan, el cálculo de ETA y la habilitación de controles con vitest.
 */

import type {
  CalibrationJobRequest,
  CalibrationJobSnapshot,
  CalibrationJobStatus,
  CalibrationMethodJobRequest,
  CalibrationMethodTarget,
  CalibrationSweep,
} from '../../core/api/benchmark';
import { CALIBRATION_METHOD_TARGETS } from '../../core/api/calibrationMethodPhases';

/** Estados de la vista (§8 del plan de la vista de calibración). */
export type CalibrationViewState =
  | 'sin-datos'
  | 'listo'
  | 'ejecutando'
  | 'cancelado'
  | 'error';

export interface CalibrationRunConfig {
  mode: CalibrationSweep;
  scenarioId: string;
  seed: number;
  reuseCache: boolean;
  /** Objetivo del protocolo metodológico; solo se usa cuando `mode === 'method'`. */
  methodPhase: CalibrationMethodTarget;
  /** Verificación corta con 2 semillas en vez del juego completo de 10. */
  methodShort: boolean;
}

/**
 * Pestañas de resultados con payload propio (`sensitivity` y `objective`).
 *
 * La validación **no** es una pestaña: tiene su panel dentro de la recomendación, porque
 * su pregunta («¿rinde la combinación?») solo tiene sentido junto al perfil sugerido.
 */
export type CalibrationResultTab = 'sensitivity' | 'objective';

/**
 * Línea de la «lectura automática» de un barrido.
 *
 * `detail` solo lleva **datos ya formateados** (números, etiquetas del payload): nunca
 * texto traducible ni claves i18n. Los ejes implicados viajan en `axisKeys` para que el
 * componente los traduzca.
 */
export interface CalibrationReading {
  labelKey: string;
  detail: string;
  axisKeys?: string[];
}

/** Defaults reproducibles acordados con el backend (`DEFAULT_SWEEP_SEED`). */
export const CALIBRATION_DEFAULT_SCENARIO = 'normal';
export const CALIBRATION_DEFAULT_SEED = 42;
/** Polling del job: 1,5 s (el plan pide 1–2 s). */
export const CALIBRATION_POLL_MS = 1500;
export const CALIBRATION_MAX_WAIT_MS = 60 * 60 * 1000;

export const CALIBRATION_MODES: { value: CalibrationSweep; labelKey: string }[] = [
  { value: 'sensitivity', labelKey: 'calibration.mode.sensitivity' },
  { value: 'objective', labelKey: 'calibration.mode.objective' },
  { value: 'method', labelKey: 'calibration.mode.method' },
];

/** Selector de objetivo del protocolo (protocolo completo + cada fase, mismo orden que el backend). */
export const CALIBRATION_METHOD_PHASE_OPTIONS: {
  value: CalibrationMethodTarget;
  labelKey: string;
}[] = CALIBRATION_METHOD_TARGETS.map((target) => ({
  value: target,
  labelKey: target === 'all' ? 'calibration.method.target.all' : `calibration.method.phase.${target}`,
}));

/** Semillas de la verificación corta (plan §C0: fontanería antes del juego completo). */
export const CALIBRATION_METHOD_SHORT_SEEDS: readonly number[] = [42, 101];

export function defaultRunConfig(): CalibrationRunConfig {
  return {
    mode: 'sensitivity',
    scenarioId: CALIBRATION_DEFAULT_SCENARIO,
    seed: CALIBRATION_DEFAULT_SEED,
    reuseCache: false,
    methodPhase: 'factorial',
    methodShort: false,
  };
}

/** Snapshot local del job recién creado, antes del primer poll. */
export function pendingSnapshot(jobId: string, sweep: CalibrationSweep): CalibrationJobSnapshot {
  return {
    jobId,
    jobType: 'calibration',
    sweep,
    status: 'pending',
    phase: null,
    progress: 0,
    current: null,
    total: null,
    currentLabel: null,
    startedAt: null,
    finishedAt: null,
    result: null,
    error: null,
    logs: [],
  };
}

export function isJobRunning(status: CalibrationJobStatus | null | undefined): boolean {
  return status === 'pending' || status === 'running';
}

/** Un job `refresh=false` puede nacer `completed` con la caché reutilizada. */
export function wasServedFromCache(job: CalibrationJobSnapshot | null, config: CalibrationRunConfig): boolean {
  return config.reuseCache && job?.status === 'completed' && job.phase === 'caché reutilizada';
}

/**
 * Estado de la vista. Prioridad: error → ejecutando → cancelado → listo → sin datos.
 * Tras cancelar se conserva el resultado previo (la caché no se sobrescribe).
 */
export function viewStateFor(input: {
  hasResults: boolean;
  job: CalibrationJobSnapshot | null;
  error: string | null;
}): CalibrationViewState {
  const { hasResults, job, error } = input;
  if (error) return 'error';
  if (job && isJobRunning(job.status)) return 'ejecutando';
  if (job?.status === 'failed') return 'error';
  if (job?.status === 'cancelled') return 'cancelado';
  if (hasResults) return 'listo';
  return 'sin-datos';
}

/** Cuerpo del POST de creación del job (`refresh=false` reutiliza caché). */
export function jobRequestFor(config: CalibrationRunConfig): CalibrationJobRequest {
  return {
    scenarioId: config.scenarioId,
    seed: config.seed,
    refresh: !config.reuseCache,
  };
}

/** Cuerpo del POST de una fase del protocolo (`seeds=null` = juego completo de 10). */
export function methodJobRequestFor(config: CalibrationRunConfig): CalibrationMethodJobRequest {
  return {
    phase: config.methodPhase,
    seeds: config.methodShort ? [...CALIBRATION_METHOD_SHORT_SEEDS] : null,
    resume: true,
    scenarioId: config.scenarioId,
    seed: config.seed,
    refresh: !config.reuseCache,
  };
}

/** Durante la ejecución los controles de configuración se deshabilitan. */
export function controlsDisabled(status: CalibrationJobStatus | null | undefined): boolean {
  return isJobRunning(status);
}

export function progressPercent(snapshot: CalibrationJobSnapshot | null): number {
  if (!snapshot) return 0;
  return Math.max(0, Math.min(100, Math.round(snapshot.progress)));
}

/** Progreso reportado como corridas: `k de total` (el backend cuenta las terminadas). */
export function runCounterLabel(snapshot: CalibrationJobSnapshot | null): string | null {
  if (!snapshot?.total) return null;
  const done = snapshot.current ?? 0;
  return `${done}/${snapshot.total}`;
}

export function runPhaseLabel(snapshot: CalibrationJobSnapshot | null): string | null {
  if (!snapshot) return null;
  if (!snapshot.currentLabel) return snapshot.phase;
  return snapshot.total
    ? `[${snapshot.current ?? 0}/${snapshot.total}] ${snapshot.currentLabel}`
    : snapshot.currentLabel;
}

/**
 * ETA a partir de `startedAt` y el porcentaje de corridas terminadas.
 * Devuelve `null` si aún no hay base suficiente o si el job ya terminó.
 */
export function etaSeconds(
  snapshot: CalibrationJobSnapshot | null,
  nowMs: number = Date.now(),
): number | null {
  if (!snapshot || !isJobRunning(snapshot.status) || !snapshot.startedAt) return null;
  const progress = progressPercent(snapshot);
  if (progress <= 0 || progress >= 100) return null;
  const startedMs = Date.parse(snapshot.startedAt);
  if (Number.isNaN(startedMs)) return null;
  const elapsed = (nowMs - startedMs) / 1000;
  if (elapsed <= 0) return null;
  return Math.round((elapsed * (100 - progress)) / progress);
}

export function formatEta(seconds: number | null): string | null {
  if (seconds === null || seconds < 0) return null;
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

/** Estado del job para el badge de la vista. */
export function statusLabelKey(status: CalibrationJobStatus | null | undefined): string {
  switch (status) {
    case 'pending':
      return 'calibration.standing.pending';
    case 'running':
      return 'calibration.standing.running';
    case 'completed':
      return 'calibration.standing.completed';
    case 'cancelled':
      return 'calibration.standing.cancelled';
    case 'failed':
      return 'calibration.standing.failed';
    default:
      return 'calibration.standing.idle';
  }
}

/** Variante visual (`Badge`) del estado del job. */
export function statusVariant(
  status: CalibrationJobStatus | null | undefined,
): 'success' | 'warning' | 'danger' | 'info' | 'default' {
  switch (status) {
    case 'pending':
    case 'running':
      return 'info';
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'warning';
    case 'failed':
      return 'danger';
    default:
      return 'default';
  }
}
