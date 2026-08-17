import type { Scenario, ScenarioId } from '../../data/types/simulation';
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

export function runOptimization(payload: OptimizationRunPayload & { dailyPlanId?: number }): Promise<OptimizeResponse> {
  const scenarioId = payload.scenarioId ?? inferScenarioId(loadOptimizationPreset());
  if (payload.preset) {
    saveOptimizationPreset({ ...loadOptimizationPreset(), ...payload.preset, scenarioId });
  }
  if (payload.dailyPlanId) {
    return optimizeDailyPlanAndWait(payload.dailyPlanId);
  }
  return runSimulationOptimize(scenarioId, { planningLevel: 'simulation', autoDispatch: false });
}

async function optimizeDailyPlanAndWait(dailyPlanId: number): Promise<OptimizeResponse> {
  const { jobId } = await optimizeDailyPlan(dailyPlanId);
  const MAX_WAIT_MS = 60 * 60 * 1000;
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    const snapshot = await fetchSimulationOptimizeJob(jobId);
    if (snapshot.status === 'completed' && snapshot.result) {
      return snapshot.result;
    }
    if (snapshot.status === 'failed') {
      throw new Error(snapshot.error ?? 'La optimización del día falló');
    }
    if (snapshot.status === 'cancelled') {
      throw new Error('Optimización cancelada');
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('La optimización tardó más de 60 minutos');
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
