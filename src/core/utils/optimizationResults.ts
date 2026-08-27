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

/** Umbrales operativos diarios — evita mostrar KPIs de validación semanal estratégica u otras corridas incoherentes. */
export function isPlausibleDailyOptimizationKpis(
  kpis: KpiMetrics,
  pointCount: number,
): boolean {
  const safePoints = Math.max(1, pointCount);
  const maxKm = Math.max(120, safePoints * 15);
  const maxHours = Math.max(12, safePoints * 0.6 + 2);
  return (
    Number.isFinite(kpis.distanceKm.optimized) &&
    Number.isFinite(kpis.durationHours.optimized) &&
    kpis.distanceKm.optimized <= maxKm &&
    kpis.durationHours.optimized <= maxHours
  );
}

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
  unload?: string;
  landfillTrips?: string;
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
  const row: DurationBreakdownDisplayRow = {
    travel: formatDurationHours(breakdown.travelHours),
    service: formatDurationHours(breakdown.serviceHours),
    crewAssignment: breakdown.crewAssignment ?? breakdown.crewLabel.split(' ')[0] ?? '6/6',
    total: formatDurationHours(totalHours),
  };
  if (breakdown.unloadHours != null && breakdown.unloadHours > 0) {
    row.unload = formatDurationHours(breakdown.unloadHours);
  }
  if (breakdown.landfillTrips != null && breakdown.landfillTrips > 0) {
    row.landfillTrips = String(breakdown.landfillTrips);
  }
  return row;
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

export interface BaselineAcoComparisonRow {
  metric: string;
  baseline: string;
  aco: string;
  savingPct: number;
}

const CO2_KG_PER_LITER = 2.31;

export function buildBaselineAcoComparisonRows(kpis: KpiMetrics): BaselineAcoComparisonRow[] {
  const totalPoints = kpis.containersServed + (kpis.uncoveredPoints ?? 0);
  const baselinePoints = totalPoints;
  const acoPoints = kpis.containersServed;
  const baselineCo2 = kpis.fuelLiters.current * CO2_KG_PER_LITER;
  const acoCo2 = kpis.fuelLiters.optimized * CO2_KG_PER_LITER;

  return [
    {
      metric: 'Distancia',
      baseline: `${kpis.distanceKm.current.toFixed(1)} km`,
      aco: `${kpis.distanceKm.optimized.toFixed(1)} km`,
      savingPct: savingsPct(kpis.distanceKm.current, kpis.distanceKm.optimized),
    },
    {
      metric: 'Tiempo',
      baseline: formatDurationHours(kpis.durationHours.current),
      aco: formatDurationHours(kpis.durationHours.optimized),
      savingPct: savingsPct(kpis.durationHours.current, kpis.durationHours.optimized),
    },
    {
      metric: 'Puntos cubiertos',
      baseline: String(baselinePoints),
      aco: String(acoPoints),
      savingPct: savingsPct(baselinePoints, acoPoints),
    },
    {
      metric: 'CO₂ estimado',
      baseline: `${baselineCo2.toFixed(1)} kg`,
      aco: `${acoCo2.toFixed(1)} kg`,
      savingPct: savingsPct(baselineCo2, acoCo2),
    },
  ];
}

export function formatSavingPct(value: number): string {
  if (value > 0) return `−${value}%`;
  if (value < 0) return `+${Math.abs(value)}%`;
  return '0%';
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
    ...(kpis.landfillTrips != null && kpis.landfillTrips > 0
      ? [
          {
            metric: 'Viajes al vertedero',
            current: '—',
            optimized: String(kpis.landfillTrips),
            delta: 0,
          },
        ]
      : []),
    ...(kpis.uncoveredPoints != null && kpis.uncoveredPoints > 0
      ? [
          {
            metric: 'Puntos no cubiertos',
            current: '—',
            optimized: String(kpis.uncoveredPoints),
            delta: 0,
          },
        ]
      : []),
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
