import { createStore } from 'solid-js/store';
/**
 * Store de Simulación de escenarios (/simulation).
 * Historial completo vía API. No registra corridas operativas.
 */
import { useMocks } from '../api/client';
import { reportVehicleBreakdown, type ContingencyComparison, type VehicleBreakdownResponse } from '../api/contingencies';
import { fetchKpis, fetchScenarios, runSimulationOptimize, type SimulationRunParameters } from '../api/simulation';
import {
  dispatchOptimizedRoutes,
  fetchSimulationDetail,
  fetchSimulationHistory,
  type SimulationHistoryRow,
} from '../api/simulationOperations';
import { mergeRouteCollections } from '../api/routes';
import { loadDashboardData } from './dashboardStore';
import { kpiByScenario, optimizationLogMessages, scenarios as mockScenarios } from '../../data/mock/kpis';
import { getScenarioRoutes } from '../../data/mock/routes';
import { loadRoutesWithRoadSnapping, refreshAppRoutes, showOptimizedRoute } from './appStore';
import { writeLastOptimizedCodes } from '../utils/collectionPointsOptimization';

interface SimulationState {
  scenarioId: ScenarioId;
  scenarios: Scenario[];
  kpis: KpiMetrics;
  isOptimizing: boolean;
  isDispatching: boolean;
  optimizationProgress: number;
  logs: SimulationLogEntry[];
  lastOptimizedAt: string | null;
  lastSimulationId: number | null;
  lastContingency: VehicleBreakdownResponse | null;
  contingencyComparison: ContingencyComparison | null;
  history: SimulationHistoryRow[];
  lastDispatch: { count: number; routeIds: number[] } | null;
}

const [state, setState] = createStore<SimulationState>({
  scenarioId: 'normal',
  scenarios: mockScenarios,
  kpis: kpiByScenario.normal,
  isOptimizing: false,
  isDispatching: false,
  optimizationProgress: 0,
  logs: [],
  lastOptimizedAt: null,
  lastSimulationId: null,
  lastContingency: null,
  contingencyComparison: null,
  history: [],
  lastDispatch: null,
});

let scenariosLoaded = false;

export async function initSimulationData(): Promise<void> {
  if (scenariosLoaded) return;
  const [scenarios, kpis, history] = await Promise.all([
    fetchScenarios(),
    fetchKpis(state.scenarioId),
    fetchSimulationHistory(),
  ]);
  setState({ scenarios, kpis, history });
  scenariosLoaded = true;
}

export async function refreshSimulationHistory(): Promise<void> {
  const history = await fetchSimulationHistory();
  setState('history', history);
}

export function applySimulationScenario(scenarioId: ScenarioId) {
  setState('scenarioId', scenarioId);
  void fetchKpis(scenarioId).then((kpis) => setState('kpis', kpis));
}

export function setScenario(id: ScenarioId) {
  applySimulationScenario(id);
}

export function currentKpis() {
  return state.kpis;
}

export function currentScenario() {
  return state.scenarios.find((s) => s.id === state.scenarioId) ?? state.scenarios[0]!;
}

export function kpiImpactRows(kpis: KpiMetrics) {
  const row = (metric: string, current: number, optimized: number, unit = '') => ({
    metric,
    current: `${current}${unit}`,
    simulated: `${optimized}${unit}`,
    delta: savingsPct(current, optimized),
  });
  return [
    row('Distancia', kpis.distanceKm.current, kpis.distanceKm.optimized, ' km'),
    row('Duración', kpis.durationHours.current, kpis.durationHours.optimized, ' h'),
    row('Combustible', kpis.fuelLiters.current, kpis.fuelLiters.optimized, ' L'),
  ];
}

export function kpiSavingsSummary(kpis: KpiMetrics) {
  return {
    distanceKm: (kpis.distanceKm.current - kpis.distanceKm.optimized).toFixed(1),
    timeMin: Math.round((kpis.durationHours.current - kpis.durationHours.optimized) * 60).toString(),
    fuelL: (kpis.fuelLiters.current - kpis.fuelLiters.optimized).toFixed(1),
    co2Kg: kpis.co2KgAvoided.toFixed(1),
  };
}

function savingsPct(current: number, optimized: number): number {
  if (current <= 0) return 0;
  return Math.round((1 - optimized / current) * 100);
}

export async function runOptimization(parameters?: SimulationRunParameters): Promise<void> {
  if (state.isOptimizing) return;

  setState({ isOptimizing: true, optimizationProgress: 0, logs: [] });

  try {
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
      setState({
        kpis: kpiByScenario[state.scenarioId],
        lastSimulationId: 1,
      });
      await loadDashboardData();
    } else {
      const result = await runSimulationOptimize(state.scenarioId, parameters);
      for (let i = 0; i < result.logs.length; i++) {
        await delay(350);
        setState('optimizationProgress', Math.round(((i + 1) / result.logs.length) * 100));
        setState('logs', (logs) => [...logs, result.logs[i]]);
      }
      const merged = mergeRouteCollections(result.routes.current, result.routes.optimized);
      await loadRoutesWithRoadSnapping(merged);
      await refreshAppRoutes();
      setState({
        kpis: result.kpis,
        lastSimulationId: result.simulationId,
      });
      if (result.servedPointCodes?.length) {
        writeLastOptimizedCodes(result.servedPointCodes);
      }
      await loadDashboardData();
    }

    showOptimizedRoute(true);
    setState({
      isOptimizing: false,
      optimizationProgress: 100,
      lastOptimizedAt: new Date().toISOString(),
    });
    await refreshSimulationHistory();
  } catch (error) {
    setState({ isOptimizing: false, optimizationProgress: 0 });
    throw error;
  }
}

export async function loadSimulationFromHistory(simulationId: number): Promise<void> {
  if (state.isOptimizing) return;

  setState({ isOptimizing: true, optimizationProgress: 0, logs: [] });

  try {
    const detail = await fetchSimulationDetail(simulationId);
    const merged = mergeRouteCollections(detail.routes.current, detail.routes.optimized);
    await loadRoutesWithRoadSnapping(merged);
    await refreshAppRoutes();
    setState({
      kpis: detail.kpis,
      scenarioId: detail.scenarioId,
      lastSimulationId: detail.id,
      isOptimizing: false,
      optimizationProgress: 100,
      lastOptimizedAt: detail.executedAt ?? new Date().toISOString(),
      logs: [
        {
          id: `log-history-${detail.id}`,
          timestamp: new Date().toLocaleTimeString('es-VE'),
          message: `Simulación #${detail.id} cargada — ${detail.scenarioName}`,
          type: 'info',
        },
      ],
    });
    showOptimizedRoute(true);
  } catch (error) {
    setState({ isOptimizing: false, optimizationProgress: 0 });
    throw error;
  }
}

export async function dispatchRoutesAfterOptimization(): Promise<void> {
  if (state.isDispatching) return;
  if (state.lastSimulationId == null) {
    throw new Error('No hay rutas optimizadas para despachar');
  }

  setState({ isDispatching: true });
  try {
    const result = useMocks
      ? { dispatchedRouteIds: [1, 2], count: 2 }
      : await dispatchOptimizedRoutes();

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

export async function reportBreakdown(vehicleId: string, routeId?: number): Promise<VehicleBreakdownResponse> {
  if (state.isOptimizing) {
    throw new Error('Hay una operación en curso');
  }

  setState({ isOptimizing: true, optimizationProgress: 0, logs: [] });

  if (useMocks) {
    await delay(1200);
    const mock: VehicleBreakdownResponse = {
      incident: {
        id: 1,
        vehicleId,
        vehicleDbId: 1,
        routeId: routeId ?? null,
        incidentType: 'breakdown',
        description: `Avería simulada en ${vehicleId}`,
        reportedAt: new Date().toISOString(),
        affectsActiveRoute: true,
      },
      skippedWaypoints: 12,
      pendingPoints: 12,
      recalculation: null,
      comparison: {
        parentSimulationId: state.lastSimulationId,
        beforeDistanceKm: 20.1,
        afterDistanceKm: 8.2,
        distanceDeltaKm: -11.9,
        remainingVehicles: 2,
        reassignedPoints: 12,
      },
      message: `Avería en ${vehicleId}: recálculo simulado (modo mock).`,
    };
    setState({
      isOptimizing: false,
      optimizationProgress: 100,
      lastContingency: mock,
      contingencyComparison: mock.comparison ?? null,
      logs: [
        {
          id: 'log-mock-contingency',
          timestamp: new Date().toLocaleTimeString('es-VE'),
          message: mock.message,
          type: 'warning',
        },
      ],
    });
    return mock;
  }

  const result = await reportVehicleBreakdown({
    vehicleId,
    routeId,
    description: `Avería reportada desde la UI — ${vehicleId}`,
  });

  const recalc = result.recalculation;
  if (recalc) {
    for (let i = 0; i < recalc.logs.length; i++) {
      await delay(300);
      setState('optimizationProgress', Math.round(((i + 1) / recalc.logs.length) * 100));
      setState('logs', (logs) => [...logs, recalc.logs[i]]);
    }
    const merged = mergeRouteCollections(recalc.routes.current, recalc.routes.optimized);
    await loadRoutesWithRoadSnapping(merged);
    await refreshAppRoutes();
    setState({
      kpis: recalc.kpis,
      lastSimulationId: recalc.simulationId,
      scenarioId: 'broken_vehicle',
    });
    showOptimizedRoute(true);
    await loadDashboardData();
  } else {
    setState('logs', [
      {
        id: `log-contingency-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('es-VE'),
        message: result.message,
        type: 'warning',
      },
    ]);
  }

  setState({
    isOptimizing: false,
    optimizationProgress: 100,
    lastContingency: result,
    contingencyComparison: result.comparison ?? null,
    lastOptimizedAt: new Date().toISOString(),
  });

  await refreshSimulationHistory();

  return result;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { state as simulationState };
