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
  OptimizationCancelledError,
  type DailyPlan,
  type OptimizationPageContext,
  type OptimizationPreset,
  type OptimizeResponse,
} from '../api/optimization';
import {
  fetchCurrentWeeklyPlan,
  fetchDailyPlansInRange,
  fetchPendingVisits,
} from '../api/planning';
import {
  mapDailyStatusToCalendar,
  mondayOfDate,
  weekDaysFromMonday,
  type DailyCalendarStatus,
} from '../planning/dailyPlanningUx';
import { mergeRouteCollections } from '../api/routes';
import { fetchSimulationDetail } from '../api/simulationOperations';
import type { KpiMetrics, ScenarioId, AcoConvergencePoint } from '../../data/types/simulation';
import { optimizationLogMessages } from '../../data/mock/kpis';
import { getScenarioRoutes } from '../../data/mock/routes';
import { kpiByScenario } from '../../data/mock/kpis';
import { isPlausibleDailyOptimizationKpis, formatDurationHours, buildRouteResults } from '../utils/optimizationResults';
import { loadRoutesOnMap, loadRoutesWithRoadSnapping, showOptimizedRoute, appState } from './appStore';
import { loadDashboardData } from './dashboardStore';
import { writeLastOptimizedCodes } from '../utils/collectionPointsOptimization';
import { recordOperationalRun } from '../utils/operationalHistory';
import { globalToast } from './toastStore';
import type { ExecutionPhaseId } from '../../features/simulation/executionPhases';
import { resolvePhaseFromLogMessage } from '../../features/simulation/executionPhases';
import { routeDisplayKind } from '../map/operationalMapLayers';

interface WeekCalendarDay {
  operationDate: string;
  status: DailyCalendarStatus;
  pendingCount: number;
}

interface OptimizationDispatchNotice {
  count: number;
  routeIds: number[];
  vehicleCodes: string[];
  dismissed: boolean;
}

interface OptimizationState {
  context: OptimizationPageContext | null;
  preset: OptimizationPreset;
  dailyPlan: DailyPlan | null;
  weekCalendar: WeekCalendarDay[];
  weekStartDate: string;
  weeklyPlanApproved: boolean;
  isLoadingDailyPlan: boolean;
  isLoadingCalendar: boolean;
  kpis: KpiMetrics | null;
  lastResult: OptimizeResponse | null;
  lastSimulationId: number | null;
  isLoadingContext: boolean;
  isOptimizing: boolean;
  isDispatching: boolean;
  optimizationProgress: number;
  optimizationPhase: ExecutionPhaseId | null;
  activeOptimizationJobId: string | null;
  acoConvergence: AcoConvergencePoint[];
  cancelOptimizationRequested: boolean;
  logs: OptimizeResponse['logs'];
  history: Awaited<ReturnType<typeof fetchOptimizationHistory>>;
  lastDispatch: OptimizationDispatchNotice | null;
  playbackOpen: boolean;
  error: string | null;
}

const [state, setState] = createStore<OptimizationState>({
  context: null,
  preset: loadOptimizationPreset(),
  dailyPlan: null,
  weekCalendar: [],
  weekStartDate: mondayOfDate(loadOptimizationPreset().operationDate),
  weeklyPlanApproved: true,
  isLoadingDailyPlan: false,
  isLoadingCalendar: false,
  kpis: null,
  lastResult: null,
  lastSimulationId: null,
  isLoadingContext: false,
  isOptimizing: false,
  isDispatching: false,
  optimizationProgress: 0,
  optimizationPhase: null,
  activeOptimizationJobId: null,
  acoConvergence: [],
  cancelOptimizationRequested: false,
  logs: [],
  history: [],
  lastDispatch: null,
  playbackOpen: false,
  error: null,
});

function resolveVehicleCodesFromState(): string[] {
  if (!optimizationState.kpis) return [];
  const optimized =
    optimizationState.lastResult?.routes.optimized ?? {
      type: 'FeatureCollection' as const,
      features: appState.routes.features.filter(
        (feature) => routeDisplayKind(feature.properties) === 'optimized',
      ),
    };
  return buildRouteResults(optimized, optimizationState.kpis).map((route) => route.id);
}

function applyOptimizationProgress(
  progress: number,
  phase: ExecutionPhaseId | null,
  logs: OptimizeResponse['logs'],
  extras?: { jobId?: string; acoConvergence?: AcoConvergencePoint[] },
): void {
  setState({
    optimizationProgress: progress,
    optimizationPhase: phase,
    logs,
    ...(extras?.jobId ? { activeOptimizationJobId: extras.jobId } : {}),
    ...(extras?.acoConvergence ? { acoConvergence: extras.acoConvergence } : {}),
  });
}

export async function cancelOptimization(): Promise<void> {
  if (!optimizationState.isOptimizing) return;
  setState({ cancelOptimizationRequested: true });
}

export function dismissDispatchNotice(): void {
  if (!optimizationState.lastDispatch) return;
  setState('lastDispatch', { ...optimizationState.lastDispatch, dismissed: true });
}

async function resolveWeeklyPlanApproved(operationDate: string): Promise<boolean> {
  try {
    await fetchCurrentWeeklyPlan(operationDate);
    return true;
  } catch {
    return false;
  }
}

let contextLoaded = false;

export async function refreshWeekCalendar(weekStart?: string): Promise<void> {
  const start = weekStart ?? mondayOfDate(state.preset.operationDate);
  const days = weekDaysFromMonday(start);
  const end = days[6]!;
  setState({ isLoadingCalendar: true, weekStartDate: start });
  try {
    const [dailyPlans, pending] = await Promise.all([
      fetchDailyPlansInRange(start, end),
      fetchPendingVisits({ status: 'open' }).catch(() => ({ items: [] })),
    ]);
    const statusByDate = new Map(
      dailyPlans.items.map((row) => [row.operationDate, mapDailyStatusToCalendar(row.status)]),
    );
    const pendingByDate = new Map<string, number>();
    for (const visit of pending.items) {
      const target = visit.targetOperationDate ?? state.preset.operationDate;
      pendingByDate.set(target, (pendingByDate.get(target) ?? 0) + 1);
    }
    setState({
      weekCalendar: days.map((operationDate) => ({
        operationDate,
        status: statusByDate.get(operationDate) ?? 'none',
        pendingCount: pendingByDate.get(operationDate) ?? 0,
      })),
    });
  } finally {
    setState({ isLoadingCalendar: false });
  }
}

function canHydrateDailySimulation(dailyPlan: DailyPlan, detail: Awaited<ReturnType<typeof fetchSimulationDetail>>): boolean {
  if (dailyPlan.status !== 'optimized' && dailyPlan.status !== 'dispatched') {
    return false;
  }
  const context = detail.planningContext;
  if (context?.level === 'strategic') {
    return false;
  }
  if (context?.operationDate && context.operationDate !== dailyPlan.operationDate) {
    return false;
  }
  const pointCount = dailyPlan.finalPointIds?.length ?? dailyPlan.scheduledPoints.length;
  return isPlausibleDailyOptimizationKpis(detail.kpis, pointCount);
}

async function clearOptimizationResultsOnMap(): Promise<void> {
  await loadRoutesOnMap({ type: 'FeatureCollection', features: [] });
  showOptimizedRoute(false);
}

async function hydrateOptimizationFromDailyPlan(dailyPlan: DailyPlan): Promise<void> {
  if (!dailyPlan.simulationId) return;
  try {
    const detail = await fetchSimulationDetail(dailyPlan.simulationId);
    if (!canHydrateDailySimulation(dailyPlan, detail)) {
      await clearOptimizationResultsOnMap();
      return;
    }
    const merged = mergeRouteCollections(detail.routes.current, detail.routes.optimized);
    await loadRoutesWithRoadSnapping(merged);
    setState({
      kpis: detail.kpis,
      lastSimulationId: detail.id,
      preset: { ...state.preset, scenarioId: detail.scenarioId },
      acoConvergence: detail.kpis.engineMetrics?.acoConvergence ?? [],
    });
    showOptimizedRoute(true);
  } catch {
    await clearOptimizationResultsOnMap();
  }
}

function assertPlausibleOptimizationResult(kpis: KpiMetrics, pointCount: number): void {
  if (!isPlausibleDailyOptimizationKpis(kpis, pointCount)) {
    throw new Error(
      `La optimización devolvió métricas incoherentes (${kpis.distanceKm.optimized.toFixed(1)} km, ${formatDurationHours(kpis.durationHours.optimized)}) para ${pointCount} puntos del día. Reinicie el backend si acaba de actualizar el código y vuelva a generar la ruta.`,
    );
  }
}

export async function initOptimizationPage(operationDate?: string): Promise<void> {
  const dateValue = operationDate ?? state.preset.operationDate;
  if (contextLoaded && state.context && state.dailyPlan?.operationDate === dateValue) return;
  setState({ isLoadingContext: true, isLoadingDailyPlan: true, error: null });
  try {
    const [context, history, dailyPlan, weeklyPlanApproved] = await Promise.all([
      fetchOptimizationPageContext(),
      fetchOptimizationHistory(),
      openDailyPlanForDate(dateValue).catch(() => loadDailyPlanForDate(dateValue)),
      resolveWeeklyPlanApproved(dateValue),
    ]);
    setState({
      context,
      history,
      dailyPlan,
      weeklyPlanApproved,
      preset: {
        ...state.preset,
        operationDate: dateValue,
        scenarioId: dailyPlan.scenarioId ?? state.preset.scenarioId,
      },
      lastSimulationId: dailyPlan.simulationId ?? state.lastSimulationId,
      kpis: null,
    });
    if (dailyPlan.status === 'draft') {
      await clearOptimizationResultsOnMap();
    } else if (dailyPlan.simulationId) {
      await hydrateOptimizationFromDailyPlan(dailyPlan);
    }
    saveOptimizationPreset(state.preset);
    await refreshWeekCalendar(mondayOfDate(dateValue));
    contextLoaded = true;
  } catch (error) {
    setState({
      error: error instanceof Error ? error.message : 'No se pudo cargar el contexto de optimización',
    });
  } finally {
    setState({ isLoadingContext: false, isLoadingDailyPlan: false });
  }
}

export function selectOperationDate(operationDate: string): void {
  if (operationDate === state.preset.operationDate) return;
  contextLoaded = false;
  setState({
    lastResult: null,
    lastDispatch: null,
    kpis: null,
    logs: [],
    playbackOpen: false,
  });
  updateOptimizationPreset({ operationDate });
}

export function openOptimizationPlayback(): void {
  setState({ playbackOpen: true });
}

export function closeOptimizationPlayback(): void {
  setState({ playbackOpen: false });
}

export async function refreshDailyPlan(): Promise<void> {
  const dateValue = state.preset.operationDate;
  setState({ isLoadingDailyPlan: true, error: null });
  try {
    const dailyPlan = await openDailyPlanForDate(dateValue);
    setState({ dailyPlan });
    await refreshWeekCalendar();
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
    optimizationPhase: null,
    activeOptimizationJobId: null,
    acoConvergence: [],
    cancelOptimizationRequested: false,
    logs: [],
    error: null,
    lastDispatch: null,
    playbackOpen: false,
  });

  const isCancelled = () => optimizationState.cancelOptimizationRequested;

  try {
    if (useMocks) {
      for (let i = 0; i < optimizationLogMessages.length; i++) {
        if (isCancelled()) {
          throw new OptimizationCancelledError();
        }
        const entry = optimizationLogMessages[i];
        await delay(350);
        const progress = Math.round(((i + 1) / optimizationLogMessages.length) * 100);
        const phase = resolvePhaseFromLogMessage(entry.message);
        setState('optimizationProgress', progress);
        if (phase) {
          setState('optimizationPhase', phase);
          if (phase === 'aco') {
            const points: AcoConvergencePoint[] = [];
            let bestKm = 32.8;
            for (let iteration = 1; iteration <= 8; iteration++) {
              if (isCancelled()) throw new OptimizationCancelledError();
              bestKm = Math.max(20.1, bestKm - 0.4);
              points.push({
                iteration,
                bestDistanceKm: Number(bestKm.toFixed(2)),
                iterationBestDistanceKm: Number((bestKm + 0.5).toFixed(2)),
              });
              setState('acoConvergence', [...points]);
              await delay(80);
            }
          }
        }
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
      const pointCount = state.dailyPlan?.finalPointIds?.length ?? state.context?.pointsToVisit ?? 0;
      assertPlausibleOptimizationResult(kpis, pointCount);
      setState({
        kpis,
        lastSimulationId: 1,
        dailyPlan: state.dailyPlan
          ? { ...state.dailyPlan, status: 'optimized', simulationId: 1 }
          : null,
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
      const result = await runOptimization(
        {
          scenarioId: state.preset.scenarioId,
          preset: state.preset,
          dailyPlanId,
        },
        (update) =>
          applyOptimizationProgress(update.progress, update.phase, update.logs, {
            jobId: update.jobId,
            acoConvergence: update.acoConvergence,
          }),
        { isCancelled },
      );

      const pointCount = Math.max(
        state.dailyPlan?.finalPointIds?.length ?? 0,
        result.kpis.containersServed ?? 0,
        result.servedPointCodes?.length ?? 0,
      );
      assertPlausibleOptimizationResult(result.kpis, pointCount);
      const merged = mergeRouteCollections(result.routes.current, result.routes.optimized);
      await loadRoutesOnMap(merged);
      setState({
        kpis: result.kpis,
        lastResult: result,
        lastSimulationId: result.simulationId,
        logs: result.logs,
        optimizationProgress: 100,
        optimizationPhase: 'listo',
        acoConvergence:
          result.kpis.engineMetrics?.acoConvergence ?? optimizationState.acoConvergence,
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
    await refreshWeekCalendar();
  } catch (error) {
    if (error instanceof OptimizationCancelledError) {
      setState({
        logs: [
          ...state.logs,
          {
            id: `log-cancel-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString('es-VE'),
            message: 'Optimización cancelada por el planificador',
            type: 'warning',
          },
        ],
      });
      return;
    }
    setState({
      error: error instanceof Error ? error.message : 'No se pudo ejecutar la optimización',
    });
    throw error;
  } finally {
    setState({
      isOptimizing: false,
      activeOptimizationJobId: null,
      cancelOptimizationRequested: false,
    });
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
      acoConvergence: detail.kpis.engineMetrics?.acoConvergence ?? [],
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

    const vehicleCodes = resolveVehicleCodesFromState();
    const fallbackCodes =
      vehicleCodes.length > 0
        ? vehicleCodes
        : (state.context?.assignableVehicles ?? []).slice(0, result.count).map((vehicle) => vehicle.id);

    setState({
      lastDispatch: {
        count: result.count,
        routeIds: result.dispatchedRouteIds,
        vehicleCodes: fallbackCodes,
        dismissed: false,
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

    const vehicleLabel =
      fallbackCodes.length > 0 ? fallbackCodes.join(', ') : `${result.count} vehículo(s)`;
    globalToast.addToast(
      `${result.count} ruta${result.count === 1 ? '' : 's'} despachada${result.count === 1 ? '' : 's'} · ${vehicleLabel}`,
      'success',
    );

    if (!useMocks) {
      await loadDashboardData();
    }
    await refreshWeekCalendar();
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
  await refreshWeekCalendar();
}

export { state as optimizationState };
