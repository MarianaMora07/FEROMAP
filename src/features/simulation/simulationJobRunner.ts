import type { AcoConvergencePoint, SimulationLogEntry } from '../../data/types/simulation';
import { isExecutionPhaseId, type ExecutionPhaseId } from './executionPhases';
import {
  cancelSimulationOptimizeJob,
  fetchSimulationOptimizeJob,
  startSimulationOptimizeJob,
  type OptimizeJobResult,
  type SimulationOptimizationJob,
} from '../../core/api/simulationJobs';
import type { SimulationRunParameters } from '../../core/api/simulation';
import type { ScenarioId } from '../../data/types/simulation';
import { ExecutionCancelledError, type ExecutionUpdateHandlers } from './simulationExecutionRunner';

const POLL_INTERVAL_MS = 450;
const JOB_MAX_WAIT_MS = 20 * 60 * 1000;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveSnapshotPhase(
  snapshot: SimulationOptimizationJob,
): ExecutionPhaseId | null {
  if (!snapshot.phase || !isExecutionPhaseId(snapshot.phase)) {
    return null;
  }
  if (snapshot.status !== 'completed' && snapshot.phase === 'listo') {
    return 'persistencia';
  }
  if (snapshot.phase === 'preparando_mapa') {
    return null;
  }
  return snapshot.phase;
}

function syncJobSnapshot(
  snapshot: SimulationOptimizationJob,
  handlers: ExecutionUpdateHandlers,
  seenLogIds: Set<string>,
) {
  const phase = resolveSnapshotPhase(snapshot);
  if (phase) {
    handlers.setPhase(phase);
  }
  handlers.setProgress(snapshot.progress);
  if (snapshot.acoConvergence?.length) {
    handlers.setAcoConvergence?.(snapshot.acoConvergence);
  }
  for (const log of snapshot.logs) {
    if (seenLogIds.has(log.id)) continue;
    seenLogIds.add(log.id);
    handlers.appendLog(log);
  }
}

async function resolveCompletedJob(
  jobId: string,
  snapshot: SimulationOptimizationJob,
): Promise<OptimizeJobResult> {
  if (snapshot.result) {
    return snapshot.result;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await delay(120);
    const retry = await fetchSimulationOptimizeJob(jobId);
    if (retry.result) {
      return retry.result;
    }
  }

  throw new Error('El servidor terminó el cálculo pero no devolvió los resultados. Reintenta la simulación.');
}

export async function runJobBasedExecution(
  scenarioId: ScenarioId,
  parameters: SimulationRunParameters | undefined,
  handlers: ExecutionUpdateHandlers,
): Promise<OptimizeJobResult> {
  const { jobId } = await startSimulationOptimizeJob(scenarioId, parameters);
  const seenLogIds = new Set<string>();
  const startedAt = Date.now();
  let lastProgress = -1;
  let stallTicks = 0;

  while (true) {
    if (Date.now() - startedAt > JOB_MAX_WAIT_MS) {
      await cancelSimulationOptimizeJob(jobId).catch(() => undefined);
      throw new Error('Tiempo de espera agotado. El cálculo tardó más de 20 minutos.');
    }

    if (handlers.isCancelled?.()) {
      await cancelSimulationOptimizeJob(jobId).catch(() => undefined);
      throw new ExecutionCancelledError();
    }

    const snapshot = await fetchSimulationOptimizeJob(jobId);
    syncJobSnapshot(snapshot, handlers, seenLogIds);

    if (snapshot.status === 'completed') {
      return resolveCompletedJob(jobId, snapshot);
    }

    if (snapshot.status === 'cancelled') {
      throw new ExecutionCancelledError();
    }

    if (snapshot.status === 'failed') {
      throw new Error(snapshot.error ?? 'La optimización falló en el servidor');
    }

    if (snapshot.progress === lastProgress) {
      stallTicks += 1;
      if (stallTicks % 4 === 0 && snapshot.progress < 94) {
        handlers.setProgress(Math.min(94, snapshot.progress + 1));
      }
    } else {
      lastProgress = snapshot.progress;
      stallTicks = 0;
    }

    await delay(POLL_INTERVAL_MS);
  }
}

export type { SimulationLogEntry };
