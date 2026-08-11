export type ScenarioId = 'normal' | 'peak_traffic' | 'rain' | 'saturated' | 'broken_vehicle';

export interface Scenario {
  id: ScenarioId;
  label: string;
  description: string;
  trafficMultiplier: number;
  fillLevelBoost: number;
}

export interface DurationBreakdown {
  travelHours: number;
  serviceHours: number;
  crewLabel: string;
  crewAssignment?: string;
  stopCount?: number;
}

export interface AcoConvergencePoint {
  iteration: number;
  bestDistanceKm: number;
  iterationBestDistanceKm: number;
}

export interface EngineMetrics {
  computationSeconds: number;
  acoSeconds: number;
  graphLoadSeconds: number;
  overheadSeconds: number;
  acoAnts: number;
  acoIterations: number;
  acoIterationsRun?: number;
  acoStoppedEarly?: boolean;
  acoPatience?: number;
  matrixCacheHit?: boolean;
  matrixCacheIncremental?: boolean;
  matrixPatchedCells?: number;
  matrixParentPointCount?: number;
  graphLoadSource?: string;
  acoConvergence?: AcoConvergencePoint[];
  acoParallelWorkers?: number;
  customers: number;
  vehicles: number;
}

export interface KpiMetrics {
  distanceKm: { current: number; optimized: number };
  durationHours: { current: number; optimized: number };
  durationBreakdown?: {
    current: DurationBreakdown;
    optimized: DurationBreakdown;
  };
  exceedsWorkday?: { current: boolean; optimized: boolean };
  workdayHours?: number;
  fuelLiters: { current: number; optimized: number };
  co2KgAvoided: number;
  criticalCoveragePct: { current: number; optimized: number };
  containersServed: number;
  engineMetrics?: EngineMetrics;
}

export interface SimulationLogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  /** Fase del motor asociada (Fase 7) */
  phaseId?: import('../../features/simulation/executionPhases').ExecutionPhaseId;
}

export interface TimelinePoint {
  hour: string;
  currentKm: number;
  optimizedKm: number;
}
