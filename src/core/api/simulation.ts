import type { RouteCollection } from '../../data/types/geo';
import type { KpiMetrics, Scenario, ScenarioId, SimulationLogEntry } from '../../data/types/simulation';
import { kpiByScenario, optimizationLogMessages, scenarios } from '../../data/mock/kpis';
import { getScenarioRoutes } from '../../data/mock/routes';
import { apiGet, apiPost, useMocks } from './client';
import { mergeRouteCollections } from './routes';

export interface OptimizeResponse {
  simulationId: number;
  scenarioId: ScenarioId;
  scenario: Scenario;
  kpis: KpiMetrics;
  routes: {
    current: RouteCollection;
    optimized: RouteCollection;
  };
  logs: SimulationLogEntry[];
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

export async function runSimulationOptimize(scenarioId: ScenarioId): Promise<OptimizeResponse> {
  if (useMocks) return mockOptimizeResponse(scenarioId);
  return apiPost<OptimizeResponse>('/api/v1/simulations/optimize', { scenarioId });
}

export async function fetchSimulationRoutes(scenarioId: ScenarioId): Promise<RouteCollection> {
  const result = await runSimulationOptimize(scenarioId);
  return mergeRouteCollections(result.routes.current, result.routes.optimized);
}
