import { createStore } from 'solid-js/store';
/**
 * Store de Planificación operativa (/optimization).
 * Historial filtrado con recordOperationalRun(); despacho exclusivo de este módulo.
 */
import { useMocks } from '../api/client';
import {
  fetchOptimizationHistory,
  fetchOptimizationPageContext,
  loadOptimizationPreset,
  runOptimization,
  saveOptimizationPreset,
  dispatchOptimizationRoutes,
  type OptimizationPageContext,
  type OptimizationPreset,
  type OptimizeResponse,
} from '../api/optimization';
import { mergeRouteCollections } from '../api/routes';
import { fetchSimulationDetail } from '../api/simulationOperations';
import type { KpiMetrics, ScenarioId } from '../../data/types/simulation';
import { optimizationLogMessages } from '../../data/mock/kpis';
import { getScenarioRoutes } from '../../data/mock/routes';
import { kpiByScenario } from '../../data/mock/kpis';
import { loadRoutesOnMap, showOptimizedRoute } from './appStore';
import { loadDashboardData } from './dashboardStore';
import { writeLastOptimizedCodes } from '../utils/collectionPointsOptimization';
import { recordOperationalRun } from '../utils/operationalHistory';

interface OptimizationState {
  context: OptimizationPageContext | null;
  preset: OptimizationPreset;
  kpis: KpiMetrics | null;
  lastResult: OptimizeResponse | null;
  lastSimulationId: number | null;
  isLoadingContext: boolean;
  isOptimizing: boolean;
  isDispatching: boolean;
  optimizationProgress: number;
  logs: OptimizeResponse['logs'];
  history: Awaited<ReturnType<typeof fetchOptimizationHistory>>;
  lastDispatch: { count: number; routeIds: number[] } | null;
  error: string | null;
}

const [state, setState] = createStore<OptimizationState>({
  context: null,
  preset: loadOptimizationPreset(),
  kpis: null,
  lastResult: null,
  lastSimulationId: null,
  isLoadingContext: false,
  isOptimizing: false,
  isDispatching: false,
  optimizationProgress: 0,
  logs: [],
  history: [],
  lastDispatch: null,
  error: null,
});

let contextLoaded = false;

export async function initOptimizationPage(): Promise<void> {
  if (contextLoaded && state.context) return;
  setState({ isLoadingContext: true, error: null });
  try {
    const [context, history] = await Promise.all([
      fetchOptimizationPageContext(),
      fetchOptimizationHistory(),
    ]);
    setState({
      context,
      history,
      preset: {
        ...state.preset,
        scenarioId: state.preset.scenarioId ?? context.scenarios[0]?.id ?? 'normal',
      },
    });
    contextLoaded = true;
  } catch (error) {
    setState({
      error: error instanceof Error ? error.message : 'No se pudo cargar el contexto de optimización',
    });
  } finally {
    setState({ isLoadingContext: false });
  }
}

export function updateOptimizationPreset(patch: Partial<OptimizationPreset>): void {
  const next = { ...state.preset, ...patch };
  if (patch.constraints) {
    next.constraints = { ...state.preset.constraints, ...patch.constraints };
  }
  setState('preset', next);
  saveOptimizationPreset(next);
}

export function setOptimizationScenario(scenarioId: ScenarioId): void {
  updateOptimizationPreset({ scenarioId });
}

export async function executeOptimization(): Promise<void> {
  if (state.isOptimizing) return;

  setState({
    isOptimizing: true,
    optimizationProgress: 0,
    logs: [],
    error: null,
    lastDispatch: null,
  });

  try {
    if (useMocks) {
      for (let i = 0; i < optimizationLogMessages.length; i++) {
        const entry = optimizationLogMessages[i];
        await delay(350);
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
      const routes = getScenarioRoutes(state.preset.scenarioId);
      await loadRoutesOnMap(routes);
      const kpis = kpiByScenario[state.preset.scenarioId];
      setState({
        kpis,
        lastSimulationId: 1,
        lastResult: {
          simulationId: 1,
          scenarioId: state.preset.scenarioId,
          scenario: state.context?.scenarios.find((s) => s.id === state.preset.scenarioId) ?? {
            id: state.preset.scenarioId,
            label: state.preset.scenarioId,
            description: '',
            trafficMultiplier: 1,
            fillLevelBoost: 0,
          },
          kpis,
          routes: {
            current: {
              type: 'FeatureCollection',
              features: routes.features.filter((feature) => feature.properties.type === 'current'),
            },
            optimized: {
              type: 'FeatureCollection',
              features: routes.features.filter((feature) => feature.properties.type === 'optimized'),
            },
          },
          logs: state.logs,
        },
      });
      await loadDashboardData();
    } else {
      const result = await runOptimization({
        scenarioId: state.preset.scenarioId,
        preset: state.preset,
      });

      for (let i = 0; i < result.logs.length; i++) {
        await delay(300);
        setState('optimizationProgress', Math.round(((i + 1) / result.logs.length) * 100));
        setState('logs', (logs) => [...logs, result.logs[i]]);
      }

      const merged = mergeRouteCollections(result.routes.current, result.routes.optimized);
      await loadRoutesOnMap(merged);
      setState({
        kpis: result.kpis,
        lastResult: result,
        lastSimulationId: result.simulationId,
      });

      if (result.servedPointCodes?.length) {
        writeLastOptimizedCodes(result.servedPointCodes);
      }
      await loadDashboardData();
    }

    showOptimizedRoute(true);
    setState({ optimizationProgress: 100 });
    if (state.lastSimulationId != null) {
      recordOperationalRun(state.lastSimulationId);
    }
    await refreshOptimizationHistory();
  } catch (error) {
    setState({
      error: error instanceof Error ? error.message : 'No se pudo ejecutar la optimización',
    });
    throw error;
  } finally {
    setState({ isOptimizing: false });
  }
}

export async function loadOptimizationFromHistory(simulationId: number): Promise<void> {
  if (state.isOptimizing) return;

  setState({ isOptimizing: true, optimizationProgress: 0, logs: [], error: null });
  try {
    const detail = await fetchSimulationDetail(simulationId);
    const merged = mergeRouteCollections(detail.routes.current, detail.routes.optimized);
    await loadRoutesWithRoadSnapping(merged);
    setState({
      kpis: detail.kpis,
      lastSimulationId: detail.id,
      preset: { ...state.preset, scenarioId: detail.scenarioId },
      logs: [
        {
          id: `log-history-${detail.id}`,
          timestamp: new Date().toLocaleTimeString('es-VE'),
          message: `Optimización #${detail.id} cargada — ${detail.scenarioName}`,
          type: 'info',
        },
      ],
      optimizationProgress: 100,
    });
    showOptimizedRoute(true);
  } catch (error) {
    setState({
      error: error instanceof Error ? error.message : 'No se pudo cargar la optimización',
    });
    throw error;
  } finally {
    setState({ isOptimizing: false });
  }
}

export async function dispatchOptimizationResult(): Promise<void> {
  if (state.isDispatching) return;
  if (state.lastSimulationId == null) {
    throw new Error('No hay rutas optimizadas para despachar');
  }

  setState({ isDispatching: true, error: null });
  try {
    const result = useMocks
      ? { dispatchedRouteIds: [1, 2], count: 2 }
      : await dispatchOptimizationRoutes();

    setState({
      lastDispatch: {
        count: result.count,
        routeIds: result.dispatchedRouteIds,
      },
      logs: [
        ...state.logs,
        {
          id: `log-dispatch-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('es-VE'),
          message: `Despachadas ${result.count} ruta(s) optimizada(s) a operación`,
          type: 'success',
        },
      ],
    });

    if (!useMocks) {
      await loadDashboardData();
    }
  } finally {
    setState({ isDispatching: false });
  }
}

export async function refreshOptimizationHistory(): Promise<void> {
  const history = await fetchOptimizationHistory();
  setState('history', history);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { state as optimizationState };
