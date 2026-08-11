import type { KpiMetrics, ScenarioId } from '../../data/types/simulation';
import type { ConditionId } from '../../features/simulation/simulationConfig';
import { conditionsForScenario, defaultConditions } from '../../features/simulation/simulationConfig';

export function deriveScenarioId(conditions: Record<ConditionId, boolean>): ScenarioId {
  if (conditions.broken_vehicle) return 'broken_vehicle';
  if (conditions.critical_bin || conditions.waste_surge) return 'saturated';
  if (conditions.rain) return 'rain';
  if (conditions.accident) return 'peak_traffic';
  return 'normal';
}

export { conditionsForScenario, defaultConditions };

export function scenarioEfficiencyPct(kpis: KpiMetrics): number {
  if (kpis.distanceKm.current <= 0) return 0;
  return Math.round((1 - kpis.distanceKm.optimized / kpis.distanceKm.current) * 100);
}

export function buildPerformanceIndicators(kpis: KpiMetrics) {
  const fleetUsage = Math.min(
    100,
    Math.round((kpis.containersServed / Math.max(kpis.containersServed + 4, 1)) * 100),
  );

  return [
    { id: 'coverage', label: 'Cobertura crítica', value: kpis.criticalCoveragePct.optimized },
    {
      id: 'containers',
      label: 'Contenedores atendidos',
      value: Math.min(100, Math.round(kpis.containersServed * 3.5)),
    },
    { id: 'fleet', label: 'Uso de flota', value: fleetUsage },
    {
      id: 'fuel',
      label: 'Eficiencia combustible',
      value:
        kpis.fuelLiters.current > 0
          ? Math.round((1 - kpis.fuelLiters.optimized / kpis.fuelLiters.current) * 100)
          : 0,
    },
  ];
}

export function scenarioSummaryIcon(
  scenarioId: ScenarioId,
): 'cloud-rain' | 'trash' | 'truck' | 'chart' | 'alert' {
  switch (scenarioId) {
    case 'rain':
      return 'cloud-rain';
    case 'peak_traffic':
      return 'alert';
    case 'saturated':
      return 'trash';
    case 'broken_vehicle':
      return 'truck';
    default:
      return 'chart';
  }
}
