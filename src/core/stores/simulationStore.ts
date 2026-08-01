import { createStore } from 'solid-js/store';
import type { KpiMetrics, Scenario, ScenarioId, SimulationLogEntry } from '../../data/types/simulation';
import { useMocks } from '../api/client';
import { fetchKpis, fetchScenarios, runSimulationOptimize } from '../api/simulation';
import { mergeRouteCollections } from '../api/routes';
import { kpiByScenario, optimizationLogMessages, scenarios as mockScenarios } from '../../data/mock/kpis';
import { getScenarioRoutes } from '../../data/mock/routes';
import { loadRoutesWithRoadSnapping, showOptimizedRoute } from './appStore';

interface SimulationState {
  scenarioId: ScenarioId;
  scenarios: Scenario[];
  kpis: KpiMetrics;
  isOptimizing: boolean;
  optimizationProgress: number;
  logs: SimulationLogEntry[];
  lastOptimizedAt: string | null;
  lastSimulationId: number | null;
}

const [state, setState] = createStore<SimulationState>({
  scenarioId: 'normal',
  scenarios: mockScenarios,
  kpis: kpiByScenario.normal,
  isOptimizing: false,
  optimizationProgress: 0,
  logs: [],
  lastOptimizedAt: null,
  lastSimulationId: null,
});

let scenariosLoaded = false;

export async function initSimulationData(): Promise<void> {
  if (scenariosLoaded) return;
  const [scenarios, kpis] = await Promise.all([
    fetchScenarios(),
    fetchKpis(state.scenarioId),
  ]);
  setState({ scenarios, kpis });
  scenariosLoaded = true;
}

export function setScenario(id: ScenarioId) {
  setState('scenarioId', id);
  void fetchKpis(id).then((kpis) => setState('kpis', kpis));
}

export function currentKpis() {
  return state.kpis;
}

export function currentScenario() {
  return state.scenarios.find((s) => s.id === state.scenarioId) ?? state.scenarios[0]!;
}

export async function runOptimization(): Promise<void> {
  if (state.isOptimizing) return;

  setState({ isOptimizing: true, optimizationProgress: 0, logs: [] });

  if (useMocks) {
    for (let i = 0; i < optimizationLogMessages.length; i++) {
      const entry = optimizationLogMessages[i];
      await delay(400 + Math.random() * 300);
      setState('optimizationProgress', Math.round(((i + 1) / optimizationLogMessages.length) * 100));
      setState('logs', (logs) => [
        ...logs,
        {
          id: `log-${Date.now()}-${i}`,
          timestamp: new Date().toLocaleTimeString('es-VE'),
          message: entry.message,
          type: entry.type,
        },
      ]);
    }
    const routes = getScenarioRoutes(state.scenarioId);
    await loadRoutesWithRoadSnapping(routes);
    setState('kpis', kpiByScenario[state.scenarioId]);
  } else {
    const result = await runSimulationOptimize(state.scenarioId);
    for (let i = 0; i < result.logs.length; i++) {
      await delay(350);
      setState('optimizationProgress', Math.round(((i + 1) / result.logs.length) * 100));
      setState('logs', (logs) => [...logs, result.logs[i]]);
    }
    const merged = mergeRouteCollections(result.routes.current, result.routes.optimized);
    await loadRoutesWithRoadSnapping(merged);
    setState({
      kpis: result.kpis,
      lastSimulationId: result.simulationId,
    });
  }

  showOptimizedRoute(true);
  setState({
    isOptimizing: false,
    optimizationProgress: 100,
    lastOptimizedAt: new Date().toISOString(),
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { state as simulationState };
