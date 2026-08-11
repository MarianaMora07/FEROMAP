import type { SimulationLogEntry } from '../../data/types/simulation';
import type { ExecutionPhaseId } from './executionPhases';
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function syncJobSnapshot(
  snapshot: SimulationOptimizationJob,
  handlers: ExecutionUpdateHandlers,
  seenLogIds: Set<string>,
) {
  if (snapshot.phase) {
    handlers.setPhase(snapshot.phase);
  }
  handlers.setProgress(snapshot.progress);
  for (const log of snapshot.logs) {
    if (seenLogIds.has(log.id)) continue;
    seenLogIds.add(log.id);
    handlers.appendLog(log);
  }
}

export async function runJobBasedExecution(
  scenarioId: ScenarioId,
  parameters: SimulationRunParameters | undefined,
  handlers: ExecutionUpdateHandlers,
): Promise<OptimizeJobResult> {
  const { jobId } = await startSimulationOptimizeJob(scenarioId, parameters);
  const seenLogIds = new Set<string>();

  while (true) {
    if (handlers.isCancelled?.()) {
      await cancelSimulationOptimizeJob(jobId).catch(() => undefined);
      throw new ExecutionCancelledError();
    }

    const snapshot = await fetchSimulationOptimizeJob(jobId);
    syncJobSnapshot(snapshot, handlers, seenLogIds);

    if (snapshot.status === 'completed' && snapshot.result) {
      handlers.setPhase('listo');
      handlers.setProgress(100);
      return snapshot.result;
    }

    if (snapshot.status === 'cancelled') {
      throw new ExecutionCancelledError();
    }

    if (snapshot.status === 'failed') {
      throw new Error(snapshot.error ?? 'La optimización falló en el servidor');
    }

    await delay(POLL_INTERVAL_MS);
  }
}

export function isExecutionPhaseId(value: string | null | undefined): value is ExecutionPhaseId {
  if (!value) return false;
  const phases: ExecutionPhaseId[] = [
    'preparando',
    'grafo_vial',
    'matriz_costos',
    'instancia_vrp',
    'aco',
    'refinamiento_2opt',
    'persistencia',
    'listo',
  ];
  return phases.includes(value as ExecutionPhaseId);
}

export type { SimulationLogEntry };
