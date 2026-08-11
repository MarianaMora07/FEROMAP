import { createStore } from 'solid-js/store';
/**
 * Store de Simulación de escenarios (/simulation).
 * Historial completo vía API. No registra corridas operativas.
 */
import { useMocks } from '../api/client';
import { reportVehicleBreakdown, type ContingencyComparison, type VehicleBreakdownResponse } from '../api/contingencies';
import { fetchKpis, fetchScenarios, type SimulationRunParameters } from '../api/simulation';
import {
  dispatchOptimizedRoutes,
  fetchSimulationDetail,
  fetchSimulationHistory,
  type SimulationHistoryRow,
} from '../api/simulationOperations';
import { loadDashboardData } from './dashboardStore';
import { kpiByScenario, optimizationLogMessages, scenarios as mockScenarios } from '../../data/mock/kpis';
import {
  isExecutionPhaseId,
  EXECUTION_PHASE_COUNT,
  tryGetExecutionPhase,
  type ExecutionPhaseId,
  type ExecutionStatus,
} from '../../features/simulation/executionPhases';
import { writeLastOptimizedCodes } from '../utils/collectionPointsOptimization';
import {
  ExecutionCancelledError,
  runPhasedMockExecution,
} from '../../features/simulation/simulationExecutionRunner';
import { runJobBasedExecution } from '../../features/simulation/simulationJobRunner';
import type { AcoConvergencePoint, KpiMetrics, Scenario, ScenarioId, SimulationLogEntry } from '../../data/types/simulation';

let activeAbortController: AbortController | null = null;
let executionCancelled = false;

interface SimulationState {
  scenarioId: ScenarioId;
  scenarios: Scenario[];
  kpis: KpiMetrics;
  isOptimizing: boolean;
  isLoadingDetail: boolean;
  isDispatching: boolean;
  optimizationProgress: number;
  logs: SimulationLogEntry[];
  executionStatus: ExecutionStatus;
  executionPhase: ExecutionPhaseId | null;
  lastOptimizedAt: string | null;
  lastSimulationId: number | null;
  lastContingency: VehicleBreakdownResponse | null;
  contingencyComparison: ContingencyComparison | null;
  history: SimulationHistoryRow[];
  lastDispatch: { count: number; routeIds: number[] } | null;
  acoConvergenceLive: AcoConvergencePoint[];
}

const [state, setState] = createStore<SimulationState>({
  scenarioId: 'normal',
  scenarios: mockScenarios,
  kpis: kpiByScenario.normal,
  isOptimizing: false,
  isLoadingDetail: false,
  isDispatching: false,
  optimizationProgress: 0,
  logs: [],
  executionStatus: 'idle',
  executionPhase: null,
  lastOptimizedAt: null,
  lastSimulationId: null,
  lastContingency: null,
  contingencyComparison: null,
  history: [],
  lastDispatch: null,
  acoConvergenceLive: [],
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

function resetExecutionState() {
  setState({
    optimizationProgress: 0,
    logs: [],
    executionStatus: 'idle',
    executionPhase: null,
    acoConvergenceLive: [],
  });
}

function executionHandlers(isCancelled: () => boolean) {
  return {
    setPhase: (phaseId: ExecutionPhaseId) => {
      if (isCancelled() || !isExecutionPhaseId(phaseId)) return;
      setState({
        executionPhase: phaseId,
        executionStatus: 'running',
      });
    },
    setProgress: (percent: number) => {
      if (isCancelled()) return;
      setState('optimizationProgress', percent);
    },
    appendLog: (log: SimulationLogEntry) => {
      if (isCancelled()) return;
      setState('logs', (logs) => [...logs, log]);
    },
    setAcoConvergence: (points: AcoConvergencePoint[]) => {
      if (isCancelled()) return;
      setState('acoConvergenceLive', points);
    },
    isCancelled,
  };
}

function isExecutionCancelled(error: unknown): boolean {
  return (
    executionCancelled ||
    error instanceof ExecutionCancelledError ||
    (error instanceof DOMException && error.name === 'AbortError')
  );
}

export function cancelOptimization(): void {
  if (!state.isOptimizing) return;
  executionCancelled = true;
  activeAbortController?.abort();
}

/** Restablece el estado de ejecución (solo pruebas). */
export function resetSimulationStoreForTests(): void {
  executionCancelled = false;
  activeAbortController = null;
  setState({
    isOptimizing: false,
    isLoadingDetail: false,
    optimizationProgress: 0,
    logs: [],
    executionStatus: 'idle',
    executionPhase: null,
    lastOptimizedAt: null,
    lastSimulationId: null,
    acoConvergenceLive: [],
  });
}

export function wasExecutionCancelled(): boolean {
  return executionCancelled || state.executionStatus === 'cancelado';
}

export function executionPhaseIndex(): number {
  if (!state.executionPhase) return 0;
  return tryGetExecutionPhase(state.executionPhase)?.order ?? 0;
}

export function executionTotalPhases(): number {
  return EXECUTION_PHASE_COUNT;
}

export function executionNarrative(): { whatItDoes: string; whyItMatters: string } | null {
  if (!state.executionPhase) return null;
  const phase = tryGetExecutionPhase(state.executionPhase);
  if (!phase) return null;
  return { whatItDoes: phase.whatItDoes, whyItMatters: phase.whyItMatters };
}

export function isSimulationBusy(): boolean {
  return state.isOptimizing || state.isLoadingDetail;
}

function completeOptimizationRun(): void {
  setState({
    isOptimizing: false,
    optimizationProgress: 100,
    executionStatus: 'listo',
    executionPhase: 'listo',
    lastOptimizedAt: new Date().toISOString(),
  });
}

export async function runOptimization(parameters?: SimulationRunParameters): Promise<boolean> {
  if (state.isOptimizing || state.isLoadingDetail) return false;

  executionCancelled = false;
  activeAbortController = new AbortController();
  const signal = activeAbortController.signal;
  const isCancelled = () => executionCancelled || signal.aborted;

  resetExecutionState();
  setState({ isOptimizing: true, executionStatus: 'running' });

  const handlers = executionHandlers(isCancelled);

  try {
    if (useMocks) {
      const mockLogs = optimizationLogMessages.map((entry, index) => ({
        id: `log-${Date.now()}-${index}`,
        timestamp: new Date().toLocaleTimeString('es-VE'),
        message: entry.message,
        type: entry.type,
      }));

      await runPhasedMockExecution(mockLogs, handlers);

      if (isCancelled()) {
        resetExecutionState();
        setState({ isOptimizing: false, executionStatus: 'cancelado' });
        return false;
      }

      setState({
        kpis: kpiByScenario[state.scenarioId],
        lastSimulationId: 1,
      });
    } else {
      const result = await runJobBasedExecution(state.scenarioId, parameters, handlers);

      if (isCancelled()) {
        resetExecutionState();
        setState({ isOptimizing: false, executionStatus: 'cancelado' });
        return false;
      }

      setState({
        kpis: result.kpis,
        lastSimulationId: result.simulationId,
      });
      if (result.servedPointCodes?.length) {
        writeLastOptimizedCodes(result.servedPointCodes);
      }
    }

    if (isCancelled()) {
      resetExecutionState();
      setState({ isOptimizing: false, executionStatus: 'cancelado' });
      return false;
    }

    completeOptimizationRun();

    void loadDashboardData().catch(() => undefined);
    void refreshSimulationHistory().catch(() => undefined);
    return true;
  } catch (error) {
    if (isExecutionCancelled(error)) {
      resetExecutionState();
      setState({ isOptimizing: false, executionStatus: 'cancelado' });
      return false;
    }
    setState({
      isOptimizing: false,
      optimizationProgress: 0,
      executionStatus: 'error',
      executionPhase: null,
    });
    throw error;
  } finally {
    activeAbortController = null;
    if (state.isOptimizing) {
      setState({ isOptimizing: false });
    }
  }
}

export async function loadSimulationFromHistory(simulationId: number): Promise<void> {
  if (state.isOptimizing || state.isLoadingDetail) return;

  setState({ isLoadingDetail: true, optimizationProgress: 0, logs: [] });

  try {
    const detail = await fetchSimulationDetail(simulationId);
    setState({
      kpis: detail.kpis,
      scenarioId: detail.scenarioId,
      lastSimulationId: detail.id,
      isLoadingDetail: false,
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
  } catch (error) {
    setState({ isLoadingDetail: false, optimizationProgress: 0 });
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
    setState({
      kpis: recalc.kpis,
      lastSimulationId: recalc.simulationId,
      scenarioId: 'broken_vehicle',
    });
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
