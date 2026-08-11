import type { KpiMetrics, ScenarioId, SimulationLogEntry } from '../../data/types/simulation';
import type { RouteCollection } from '../../data/types/geo';
import type { ExecutionPhaseId } from '../../features/simulation/executionPhases';
import { apiGet, apiPost } from './client';
import type { SimulationRunParameters } from './simulation';

export type OptimizationJobStatus = 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';

export interface SimulationOptimizationJob {
  jobId: string;
  status: OptimizationJobStatus;
  phase: ExecutionPhaseId | null;
  progress: number;
  logs: SimulationLogEntry[];
  result: OptimizeJobResult | null;
  error: string | null;
}

export interface OptimizeJobResult {
  simulationId: number;
  scenarioId: ScenarioId;
  kpis: KpiMetrics;
  routes: {
    current: RouteCollection;
    optimized: RouteCollection;
  };
  logs: SimulationLogEntry[];
  servedPointCodes?: string[];
}

export function startSimulationOptimizeJob(
  scenarioId: ScenarioId,
  parameters?: SimulationRunParameters,
): Promise<{ jobId: string }> {
  return apiPost<{ jobId: string }>('/api/v1/simulations/optimize', {
    scenarioId,
    ...parameters,
  });
}

export function fetchSimulationOptimizeJob(jobId: string): Promise<SimulationOptimizationJob> {
  return apiGet<SimulationOptimizationJob>(`/api/v1/simulations/jobs/${jobId}`);
}

export function cancelSimulationOptimizeJob(jobId: string): Promise<{ jobId: string; status: string }> {
  return apiPost<{ jobId: string; status: string }>(`/api/v1/simulations/jobs/${jobId}/cancel`, {});
}
