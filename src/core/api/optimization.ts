import type { Scenario, ScenarioId, SimulationLogEntry } from '../../data/types/simulation';
import type { ExecutionPhaseId } from '../../features/simulation/executionPhases';
import { isExecutionPhaseId } from '../../features/simulation/executionPhases';
import type { Vehicle } from '../types/vehicle';
import type { CollectionPointOptimizationContext } from './collectionPoints';
import { fetchCollectionPointsOptimizationContext, fetchCollectionPointsSummary } from './collectionPoints';
import {
  closeDailyPlan,
  fetchDailyPlan,
  openDailyPlan,
  optimizeDailyPlan,
  dispatchDailyPlan,
  type DailyPlan,
} from './planning';
import { fetchScenarios, runSimulationOptimize, type OptimizeResponse } from './simulation';
import { fetchSimulationOptimizeJob } from './simulationJobs';
import { dispatchOptimizedRoutes, type SimulationHistoryRow } from './simulationOperations';
import { fetchOperationalHistory } from '../utils/operationalHistory';
import { fetchVehicles, fetchVehiclesOptimizationContext, isAssignableVehicle } from './vehicles';

export const OPTIMIZATION_PRESET_KEY = 'feromap:optimization-preset';

export interface DailyOptimizationProgress {
  progress: number;
  phase: ExecutionPhaseId | null;
  logs: SimulationLogEntry[];
  jobId?: string;
  acoConvergence?: import('../../data/types/simulation').AcoConvergencePoint[];
}

export class OptimizationCancelledError extends Error {
  constructor(message = 'Optimización cancelada') {
    super(message);
    this.name = 'OptimizationCancelledError';
  }
}

let activeDailyOptimizationJobId: string | null = null;

export function getActiveDailyOptimizationJobId(): string | null {
  return activeDailyOptimizationJobId;
}

export async function cancelActiveDailyOptimizationJob(): Promise<void> {
  if (!activeDailyOptimizationJobId) return;
  const { cancelSimulationOptimizeJob } = await import('./simulationJobs');
  await cancelSimulationOptimizeJob(activeDailyOptimizationJobId).catch(() => undefined);
}

const JOB_POLL_MS = 450;
const JOB_MAX_WAIT_MS = 60 * 60 * 1000;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveJobPhase(phase: string | null | undefined): ExecutionPhaseId | null {
  if (!phase || !isExecutionPhaseId(phase)) return null;
  return phase;
}

async function optimizeDailyPlanAndWait(
  dailyPlanId: number,
  preset: OptimizationPreset,
  onProgress?: (update: DailyOptimizationProgress) => void,
  options?: { isCancelled?: () => boolean },
): Promise<OptimizeResponse> {
  const { jobId } = await optimizeDailyPlan(dailyPlanId, {
    priorityFillLevel: preset.constraints.fill_level,
    timeWindowEnabled: preset.constraints.time_window,
    kpiView: preset.kpiView,
  });
  activeDailyOptimizationJobId = jobId;
  const startedAt = Date.now();

  try {
    while (Date.now() - startedAt < JOB_MAX_WAIT_MS) {
      if (options?.isCancelled?.()) {
        await cancelActiveDailyOptimizationJob();
        throw new OptimizationCancelledError();
      }

      const snapshot = await fetchSimulationOptimizeJob(jobId);
      onProgress?.({
        progress: snapshot.progress,
        phase: resolveJobPhase(snapshot.phase),
        logs: snapshot.logs,
        jobId,
        acoConvergence: snapshot.acoConvergence,
      });

      if (snapshot.status === 'completed' && snapshot.result) {
        return snapshot.result;
      }
      if (snapshot.status === 'failed') {
        throw new Error(snapshot.error ?? 'La optimización del día falló');
      }
      if (snapshot.status === 'cancelled') {
        throw new OptimizationCancelledError();
      }

      await delay(JOB_POLL_MS);
    }

    throw new Error('La optimización tardó más de 60 minutos');
  } finally {
    if (activeDailyOptimizationJobId === jobId) {
      activeDailyOptimizationJobId = null;
    }
  }
}

export type KpiView = 'distance' | 'time' | 'co2';

export interface OptimizationConstraints {
  avoid_traffic: boolean;
  fill_level: boolean;
  time_window: boolean;
  critical_first: boolean;
}

export interface OptimizationPreset {
  operationDate: string;
  scenarioId: ScenarioId;
  algorithm: string;
  objective: string;
  kpiView: KpiView;
  constraints: OptimizationConstraints;
}

export interface OptimizationPageContext {
  vehicles: (Vehicle & { maxCapacityKg: number })[];
  assignableVehicles: (Vehicle & { maxCapacityKg: number })[];
  vehiclesContext: Awaited<ReturnType<typeof fetchVehiclesOptimizationContext>>;
  pointsContext: CollectionPointOptimizationContext;
  pointsToVisit: number;
  scenarios: Scenario[];
}

export interface OptimizationRunPayload {
  scenarioId: ScenarioId;
  preset?: Partial<OptimizationPreset>;
}

const DEFAULT_PRESET: OptimizationPreset = {
  operationDate: new Date().toISOString().slice(0, 10),
  scenarioId: 'normal',
  algorithm: 'aco',
  objective: 'distance_time',
  kpiView: 'distance',
  constraints: {
    avoid_traffic: true,
    fill_level: true,
    time_window: false,
    critical_first: true,
  },
};

export function loadOptimizationPreset(): OptimizationPreset {
  try {
    const raw = localStorage.getItem(OPTIMIZATION_PRESET_KEY);
    if (!raw) return { ...DEFAULT_PRESET };
    const parsed = JSON.parse(raw) as Partial<OptimizationPreset>;
    return {
      ...DEFAULT_PRESET,
      ...parsed,
      kpiView: parsed.kpiView ?? DEFAULT_PRESET.kpiView,
      constraints: { ...DEFAULT_PRESET.constraints, ...parsed.constraints },
    };
  } catch {
    return { ...DEFAULT_PRESET };
  }
}

export function saveOptimizationPreset(preset: OptimizationPreset): void {
  localStorage.setItem(OPTIMIZATION_PRESET_KEY, JSON.stringify(preset));
}

/** Map UI constraints to the closest supported scenario when no explicit scenario is chosen. */
export function inferScenarioId(preset: OptimizationPreset): ScenarioId {
  if (preset.scenarioId) return preset.scenarioId;
  if (preset.constraints.avoid_traffic) return 'peak_traffic';
  if (preset.constraints.critical_first) return 'saturated';
  return 'normal';
}

export async function fetchOptimizationPageContext(): Promise<OptimizationPageContext> {
  const [vehicles, scenarios, pointsSummary] = await Promise.all([
    fetchVehicles(),
    fetchScenarios(),
    fetchCollectionPointsSummary(),
  ]);

  const [vehiclesContext, pointsContext] = await Promise.all([
    fetchVehiclesOptimizationContext(vehicles),
    fetchCollectionPointsOptimizationContext(),
  ]);

  const assignableVehicles = vehicles.filter((vehicle) => isAssignableVehicle(vehicle.status));

  return {
    vehicles,
    assignableVehicles,
    vehiclesContext,
    pointsContext,
    pointsToVisit: pointsSummary.kpis.total,
    scenarios,
  };
}

export function runOptimization(
  payload: OptimizationRunPayload & { dailyPlanId?: number },
  onProgress?: (update: DailyOptimizationProgress) => void,
  options?: { isCancelled?: () => boolean },
): Promise<OptimizeResponse> {
  const scenarioId = payload.scenarioId ?? inferScenarioId(loadOptimizationPreset());
  if (payload.preset) {
    saveOptimizationPreset({ ...loadOptimizationPreset(), ...payload.preset, scenarioId });
  }
  if (payload.dailyPlanId) {
    const preset = payload.preset
      ? { ...loadOptimizationPreset(), ...payload.preset, scenarioId }
      : { ...loadOptimizationPreset(), scenarioId };
    return optimizeDailyPlanAndWait(payload.dailyPlanId, preset, onProgress, options);
  }
  return runSimulationOptimize(scenarioId, { planningLevel: 'simulation', autoDispatch: false });
}

export function runDailyOptimizationJob(
  dailyPlanId: number,
  onProgress?: (update: DailyOptimizationProgress) => void,
): Promise<OptimizeResponse> {
  return optimizeDailyPlanAndWait(dailyPlanId, loadOptimizationPreset(), onProgress);
}

export function loadDailyPlanForDate(operationDate: string): Promise<DailyPlan> {
  return fetchDailyPlan(operationDate);
}

export function openDailyPlanForDate(operationDate: string): Promise<DailyPlan> {
  return openDailyPlan(operationDate);
}

export function closeDailyPlanForId(dailyPlanId: number) {
  return closeDailyPlan(dailyPlanId);
}

export function dispatchDailyPlanRoutes(dailyPlanId: number) {
  return dispatchDailyPlan(dailyPlanId);
}

export type { DailyPlan };

export function dispatchOptimizationRoutes() {
  return dispatchOptimizedRoutes();
}

export function fetchOptimizationHistory(): Promise<SimulationHistoryRow[]> {
  return fetchOperationalHistory();
}

export type { OptimizeResponse, SimulationHistoryRow };
