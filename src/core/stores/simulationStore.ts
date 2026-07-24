import { createStore } from 'solid-js/store';
import type { ScenarioId, SimulationLogEntry } from '../../data/types/simulation';
import { kpiByScenario, optimizationLogMessages, scenarios } from '../../data/mock/kpis';
import { getScenarioRoutes } from '../../data/mock/routes';
import { loadRoutesWithRoadSnapping, showOptimizedRoute } from './appStore';

interface SimulationState {
  scenarioId: ScenarioId;
  isOptimizing: boolean;
  optimizationProgress: number;
  logs: SimulationLogEntry[];
  lastOptimizedAt: string | null;
}

const [state, setState] = createStore<SimulationState>({
  scenarioId: 'normal',
  isOptimizing: false,
  optimizationProgress: 0,
  logs: [],
  lastOptimizedAt: null,
});

export function setScenario(id: ScenarioId) {
  setState('scenarioId', id);
}

export function currentKpis() {
  return kpiByScenario[state.scenarioId];
}

export function currentScenario() {
  return scenarios.find((s) => s.id === state.scenarioId)!;
}

export async function runOptimization(): Promise<void> {
  if (state.isOptimizing) return;

  setState({ isOptimizing: true, optimizationProgress: 0, logs: [] });

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

export { state as simulationState, scenarios };
