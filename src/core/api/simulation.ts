import type { RouteCollection } from '../../data/types/geo';
import type { KpiMetrics, Scenario, ScenarioId, SimulationLogEntry } from '../../data/types/simulation';
import { kpiByScenario, optimizationLogMessages, scenarios } from '../../data/mock/kpis';
import { getScenarioRoutes } from '../../data/mock/routes';
import { apiGet, useMocks } from './client';
import { mergeRouteCollections } from './routes';
import {
  fetchSimulationOptimizeJob,
  startSimulationOptimizeJob,
  type OptimizeJobResult,
} from './simulationJobs';

export type OptimizeResponse = OptimizeJobResult & {
  scenario?: Scenario;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForOptimizeJob(jobId: string, signal?: AbortSignal): Promise<OptimizeJobResult> {
  while (true) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    }
    const snapshot = await fetchSimulationOptimizeJob(jobId);
    if (snapshot.status === 'completed' && snapshot.result) {
      return snapshot.result;
    }
    if (snapshot.status === 'failed') {
      throw new Error(snapshot.error ?? 'La optimización falló en el servidor');
    }
    if (snapshot.status === 'cancelled') {
      throw new DOMException('Aborted', 'AbortError');
    }
    await delay(450);
  }
}

function mockOptimizeResponse(scenarioId: ScenarioId): OptimizeResponse {
  const routes = getScenarioRoutes(scenarioId);
  return {
    simulationId: 0,
    scenarioId,
    scenario: scenarios.find((s) => s.id === scenarioId)!,
    kpis: kpiByScenario[scenarioId],
    routes: {
      current: {
        type: 'FeatureCollection',
        features: routes.features.filter((f) => f.properties.type === 'current'),
      },
      optimized: {
        type: 'FeatureCollection',
        features: routes.features.filter((f) => f.properties.type === 'optimized'),
      },
    },
    logs: optimizationLogMessages.map((entry, index) => ({
      id: `log-mock-${index}`,
      timestamp: new Date().toLocaleTimeString('es-VE'),
      message: entry.message,
      type: entry.type,
    })),
  };
}

export function fetchScenarios(): Promise<Scenario[]> {
  if (useMocks) return Promise.resolve(scenarios);
  return apiGet<Scenario[]>('/api/v1/scenarios');
}

export function fetchKpis(scenarioId: ScenarioId): Promise<KpiMetrics> {
  if (useMocks) return Promise.resolve(kpiByScenario[scenarioId]);
  return apiGet<KpiMetrics>(`/api/v1/kpis?scenario=${scenarioId}`);
}

export interface SimulationRunParameters {
  rainIntensity?: string;
  wasteLevelPct?: number;
  estimatedDurationHours?: number;
  /** Operarios de campo ausentes en el turno (0–5). ADR-003. */
  operatorsShortage?: number;
  /** Hormigas por iteración del ACO (4–30). */
  acoAnts?: number;
  /** Iteraciones del ACO (5–60). */
  acoIterations?: number;
}

export async function runSimulationOptimize(
  scenarioId: ScenarioId,
  parameters?: SimulationRunParameters,
  signal?: AbortSignal,
): Promise<OptimizeResponse> {
  if (useMocks) {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, 1200);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    }
    return {
      ...mockOptimizeResponse(scenarioId),
      scenario: scenarios.find((s) => s.id === scenarioId)!,
    };
  }
  const { jobId } = await startSimulationOptimizeJob(scenarioId, parameters);
  const result = await waitForOptimizeJob(jobId, signal);
  return {
    ...result,
    scenario: scenarios.find((s) => s.id === result.scenarioId),
  };
}

export async function fetchSimulationRoutes(scenarioId: ScenarioId): Promise<RouteCollection> {
  const result = await runSimulationOptimize(scenarioId);
  return mergeRouteCollections(result.routes.current, result.routes.optimized);
}
