import type { RouteCollection } from '../types/geo';
import type { DurationBreakdown, EngineMetrics, KpiMetrics } from '../../data/types/simulation';

export type VehicleTone = 'blue' | 'green' | 'purple';

export interface OptimizationRouteResult {
  id: string;
  tone: VehicleTone;
  distanceKm: number;
  duration: string;
  points: number;
  tons: number;
  capacityPct: number;
}

export interface OptimizationComparisonRow {
  metric: string;
  current: string;
  optimized: string;
  delta: number;
}

export interface OptimizationResultsTotals {
  distanceKm: number;
  duration: string;
  tons: number;
  fuelL: number;
}

const VEHICLE_TONES: VehicleTone[] = ['blue', 'green', 'purple'];

export function formatDurationHours(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m} min`;
  if (m <= 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function formatDurationMinutes(minutes: number): string {
  return formatDurationHours(minutes / 60);
}

export function formatComputationSeconds(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const totalMin = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  if (totalMin <= 0) return `${rem} s`;
  if (rem <= 0) return `${totalMin} min`;
  return `${totalMin} min ${rem} s`;
}

export function formatEngineMetricsSummary(metrics: EngineMetrics): string {
  return `Total ${formatComputationSeconds(metrics.computationSeconds)} · ACO ${formatComputationSeconds(
    metrics.acoSeconds,
  )} · Grafo ${formatComputationSeconds(metrics.graphLoadSeconds)}`;
}

export interface DurationBreakdownDisplayRow {
  travel: string;
  service: string;
  crewAssignment: string;
  total: string;
}

export interface DurationBreakdownDisplay {
  current: DurationBreakdownDisplayRow;
  optimized: DurationBreakdownDisplayRow;
}

function synthesizeBreakdown(hours: number): DurationBreakdown {
  return {
    travelHours: +(hours * 0.58).toFixed(2),
    serviceHours: +(hours * 0.42).toFixed(2),
    crewLabel: '6/6 (conductor + 5 operarios)',
    crewAssignment: '6/6',
  };
}

function toDisplayRow(breakdown: DurationBreakdown, totalHours: number): DurationBreakdownDisplayRow {
  return {
    travel: formatDurationHours(breakdown.travelHours),
    service: formatDurationHours(breakdown.serviceHours),
    crewAssignment: breakdown.crewAssignment ?? breakdown.crewLabel.split(' ')[0] ?? '6/6',
    total: formatDurationHours(totalHours),
  };
}

/** Desglose Viaje · Paradas (dotación) · Total para el paso 3 de simulación. */
export function buildDurationBreakdownDisplay(kpis: KpiMetrics): DurationBreakdownDisplay {
  const currentBd = kpis.durationBreakdown?.current ?? synthesizeBreakdown(kpis.durationHours.current);
  const optimizedBd = kpis.durationBreakdown?.optimized ?? synthesizeBreakdown(kpis.durationHours.optimized);
  return {
    current: toDisplayRow(currentBd, kpis.durationHours.current),
    optimized: toDisplayRow(optimizedBd, kpis.durationHours.optimized),
  };
}

function savingsPct(current: number, optimized: number): number {
  if (current <= 0) return 0;
  return Math.round((1 - optimized / current) * 100);
}

export function buildComparisonRows(kpis: KpiMetrics): OptimizationComparisonRow[] {
  return [
    {
      metric: 'Distancia total',
      current: `${kpis.distanceKm.current.toFixed(1)} km`,
      optimized: `${kpis.distanceKm.optimized.toFixed(1)} km`,
      delta: savingsPct(kpis.distanceKm.current, kpis.distanceKm.optimized),
    },
    {
      metric: 'Tiempo total',
      current: formatDurationHours(kpis.durationHours.current),
      optimized: formatDurationHours(kpis.durationHours.optimized),
      delta: savingsPct(kpis.durationHours.current, kpis.durationHours.optimized),
    },
    {
      metric: 'Combustible',
      current: `${kpis.fuelLiters.current.toFixed(1)} L`,
      optimized: `${kpis.fuelLiters.optimized.toFixed(1)} L`,
      delta: savingsPct(kpis.fuelLiters.current, kpis.fuelLiters.optimized),
    },
    {
      metric: 'Cobertura crítica',
      current: `${kpis.criticalCoveragePct.current}%`,
      optimized: `${kpis.criticalCoveragePct.optimized}%`,
      delta: Math.round(kpis.criticalCoveragePct.optimized - kpis.criticalCoveragePct.current),
    },
  ];
}

export function buildResultsTotals(kpis: KpiMetrics): OptimizationResultsTotals {
  const avgTonPerContainer = 0.6;
  return {
    distanceKm: kpis.distanceKm.optimized,
    duration: formatDurationHours(kpis.durationHours.optimized),
    tons: +(kpis.containersServed * avgTonPerContainer).toFixed(1),
    fuelL: +kpis.fuelLiters.optimized.toFixed(1),
  };
}

export function buildSavingsBanner(kpis: KpiMetrics): string {
  const distanceSaved = (kpis.distanceKm.current - kpis.distanceKm.optimized).toFixed(1);
  const timeSavedMin = Math.round((kpis.durationHours.current - kpis.durationHours.optimized) * 60);
  const fuelSaved = (kpis.fuelLiters.current - kpis.fuelLiters.optimized).toFixed(1);
  return `Ahorro estimado: ${distanceSaved} km, ${timeSavedMin} min y ${fuelSaved} L de combustible · ${kpis.co2KgAvoided.toFixed(1)} kg CO₂ evitados`;
}

function extractVehicleId(label: string, fallback: string): string {
  const match = label.match(/TR-\d+/i);
  return match ? match[0].toUpperCase() : fallback;
}

function estimateRoutePoints(feature: RouteCollection['features'][number]): number {
  const coords = feature.geometry.coordinates;
  return Math.max(1, coords.length - 2);
}

export function buildRouteResults(
  optimizedRoutes: RouteCollection,
  kpis: KpiMetrics,
): OptimizationRouteResult[] {
  const features = optimizedRoutes.features.filter((feature) => feature.properties.type === 'optimized');
  if (features.length === 0) return [];

  const totalPoints = features.reduce((sum, feature) => sum + estimateRoutePoints(feature), 0);
  const totalTons = kpis.containersServed * 0.6;

  return features.map((feature, index) => {
    const points = estimateRoutePoints(feature);
    const capacityPct = Math.min(
      99,
      Math.round(60 + (points / Math.max(totalPoints, 1)) * 39),
    );

    return {
      id: extractVehicleId(feature.properties.label, feature.properties.id),
      tone: VEHICLE_TONES[index % VEHICLE_TONES.length]!,
      distanceKm: feature.properties.distanceKm,
      duration: formatDurationMinutes(feature.properties.durationMin),
      points,
      tons: totalPoints > 0 ? +(totalTons * (points / totalPoints)).toFixed(1) : 0,
      capacityPct,
    };
  });
}

export function buildScenarioInfoRows(
  pointsToVisit: number,
  kpis: KpiMetrics | null,
  criticalCount: number,
) {
  return [
    {
      label: 'Puntos a visitar',
      value: String(pointsToVisit),
      icon: 'map-pin' as const,
    },
    {
      label: 'Distancia estimada (optimizada)',
      value: kpis ? `${kpis.distanceKm.optimized.toFixed(1)} km` : '—',
      icon: 'route' as const,
    },
    {
      label: 'Tiempo estimado (optimizado)',
      value: kpis ? formatDurationHours(kpis.durationHours.optimized) : '—',
      icon: 'clock' as const,
    },
    {
      label: 'Contenedores críticos',
      value: String(criticalCount),
      icon: 'weight' as const,
    },
  ];
}
