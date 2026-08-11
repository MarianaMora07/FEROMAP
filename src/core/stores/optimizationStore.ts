import { createStore } from 'solid-js/store';
/**
 * Store de Planificación operativa (/optimization).
 * Historial filtrado con recordOperationalRun(); despacho exclusivo de este módulo.
 */
import { useMocks } from '../api/client';
import {
  dispatchDailyPlanRoutes,
  closeDailyPlanForId,
  fetchOptimizationHistory,
  fetchOptimizationPageContext,
  loadDailyPlanForDate,
  loadOptimizationPreset,
  openDailyPlanForDate,
  runOptimization,
  saveOptimizationPreset,
  dispatchOptimizationRoutes,
  type DailyPlan,
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
  dailyPlan: DailyPlan | null;
  isLoadingDailyPlan: boolean;
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
  dailyPlan: null,
  isLoadingDailyPlan: false,
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

export async function initOptimizationPage(operationDate?: string): Promise<void> {
  const dateValue = operationDate ?? state.preset.operationDate;
  if (contextLoaded && state.context && state.dailyPlan?.operationDate === dateValue) return;
  setState({ isLoadingContext: true, isLoadingDailyPlan: true, error: null });
  try {
    const [context, history, dailyPlan] = await Promise.all([
      fetchOptimizationPageContext(),
      fetchOptimizationHistory(),
      openDailyPlanForDate(dateValue).catch(() => loadDailyPlanForDate(dateValue)),
    ]);
    setState({
      context,
      history,
      dailyPlan,
      preset: {
        ...state.preset,
        operationDate: dateValue,
        scenarioId: dailyPlan.scenarioId ?? state.preset.scenarioId,
      },
    });
    saveOptimizationPreset(state.preset);
    contextLoaded = true;
  } catch (error) {
    setState({
      error: error instanceof Error ? error.message : 'No se pudo cargar el contexto de optimización',
    });
  } finally {
    setState({ isLoadingContext: false, isLoadingDailyPlan: false });
  }
}

export async function refreshDailyPlan(): Promise<void> {
  const dateValue = state.preset.operationDate;
  setState({ isLoadingDailyPlan: true, error: null });
  try {
    const dailyPlan = await openDailyPlanForDate(dateValue);
    setState({ dailyPlan });
  } catch (error) {
    setState({
      error: error instanceof Error ? error.message : 'No se pudo actualizar el plan del día',
    });
  } finally {
    setState({ isLoadingDailyPlan: false });
  }
}

export function updateOptimizationPreset(patch: Partial<OptimizationPreset>): void {
  const next = { ...state.preset, ...patch };
  if (patch.constraints) {
    next.constraints = { ...state.preset.constraints, ...patch.constraints };
  }
  setState('preset', next);
  saveOptimizationPreset(next);
  if (patch.operationDate) {
    contextLoaded = false;
    void initOptimizationPage(next.operationDate);
  }
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
      const dailyPlanId = state.dailyPlan?.id;
      if (!dailyPlanId) {
        throw new Error('No hay plan del día cargado');
      }
      await refreshDailyPlan();
      const result = await runOptimization({
        scenarioId: state.preset.scenarioId,
        preset: state.preset,
        dailyPlanId,
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
        dailyPlan: state.dailyPlan
          ? { ...state.dailyPlan, status: 'optimized', simulationId: result.simulationId }
          : null,
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
  if (state.lastSimulationId == null && !state.dailyPlan?.id) {
    throw new Error('No hay rutas optimizadas para despachar');
  }

  setState({ isDispatching: true, error: null });
  try {
    const result = useMocks
      ? { dispatchedRouteIds: [1, 2], count: 2 }
      : state.dailyPlan?.id
        ? await dispatchDailyPlanRoutes(state.dailyPlan.id)
        : await dispatchOptimizationRoutes();

    setState({
      lastDispatch: {
        count: result.count,
        routeIds: result.dispatchedRouteIds,
      },
      dailyPlan: state.dailyPlan ? { ...state.dailyPlan, status: 'dispatched' } : null,
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

export async function closeOptimizationDay(): Promise<void> {
  if (!state.dailyPlan?.id) {
    throw new Error('No hay plan del día para cerrar');
  }
  const result = await closeDailyPlanForId(state.dailyPlan.id);
  setState({
    dailyPlan: state.dailyPlan
      ? { ...state.dailyPlan, status: result.status, closedAt: result.closedAt }
      : null,
    logs: [
      ...state.logs,
      {
        id: `log-close-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('es-VE'),
        message: `Día cerrado — ${result.newPendingVisits} pendiente(s) para mañana`,
        type: 'info',
      },
    ],
  });
}

export { state as optimizationState };
