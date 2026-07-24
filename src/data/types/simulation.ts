export type ScenarioId = 'normal' | 'peak_traffic' | 'rain' | 'saturated';

export interface Scenario {
  id: ScenarioId;
  label: string;
  description: string;
  trafficMultiplier: number;
  fillLevelBoost: number;
}

export interface KpiMetrics {
  distanceKm: { current: number; optimized: number };
  durationHours: { current: number; optimized: number };
  fuelLiters: { current: number; optimized: number };
  co2KgAvoided: number;
  criticalCoveragePct: { current: number; optimized: number };
  containersServed: number;
}

export interface SimulationLogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning';
}

export interface TimelinePoint {
  hour: string;
  currentKm: number;
  optimizedKm: number;
}
