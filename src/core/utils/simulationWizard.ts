import type { Scenario, ScenarioId } from '../../data/types/simulation';
import { serviceTimeSecondsPerStop } from '../../data/types/crewServiceTime';
import type { ConditionId } from '../../features/simulation/simulationConfig';
import { CREW_SHORTAGE_NARRATIVE, simulationConditions } from '../../features/simulation/simulationConfig';
import { deriveScenarioId } from './simulationScenario';

export interface ConditionMapping {
  conditionId: ConditionId;
  label: string;
  effect: string;
}

const CONDITION_EFFECTS: Record<ConditionId, string> = {
  rain: 'Escenario de lluvia — retrasa tiempos de viaje',
  broken_vehicle: 'Escenario de vehículo averiado — flota reducida',
  critical_bin: 'Escenario saturado — prioriza contenedores críticos',
  accident: 'Escenario de tráfico pico por accidente vial',
  waste_surge: 'Escenario saturado — mayor carga de desechos',
};

const SCENARIO_EFFECTS: Record<ScenarioId, string> = {
  normal: 'Condiciones habituales de recolección',
  peak_traffic: 'Tiempos de viaje aumentados por accidente o congestión',
  rain: 'Velocidad reducida por condiciones climáticas',
  saturated: 'Mayor demanda por llenado elevado de contenedores',
  broken_vehicle: 'Recálculo con flota reducida',
};

export function getActiveConditionMappings(
  conditions: Record<ConditionId, boolean>,
): ConditionMapping[] {
  return simulationConditions
    .filter((condition) => conditions[condition.id])
    .map((condition) => ({
      conditionId: condition.id,
      label: condition.label,
      effect: CONDITION_EFFECTS[condition.id],
    }));
}

export function describeDerivedScenario(
  conditions: Record<ConditionId, boolean>,
  scenarios: Scenario[],
): { scenarioId: ScenarioId; label: string; description: string; source: string } {
  const scenarioId = deriveScenarioId(conditions);
  const scenario = scenarios.find((s) => s.id === scenarioId);

  return {
    scenarioId,
    label: scenario?.label ?? scenarioId,
    description: scenario?.description ?? SCENARIO_EFFECTS[scenarioId],
    source: 'Derivado automáticamente de las condiciones activas',
  };
}

export interface SimulationReadiness {
  assignableVehicles: number;
  activePoints: number;
  ready: boolean;
  issues: string[];
}

export function buildSimulationReadiness(
  assignableVehicles: number,
  activePoints: number,
): SimulationReadiness {
  const issues: string[] = [];
  if (assignableVehicles <= 0) {
    issues.push(
      'No hay vehículos asignables (disponible o en ruta con conductor asignado). Revise la flota en Vehículos.',
    );
  }
  if (activePoints <= 0) {
    issues.push('No hay puntos de recolección activos para simular.');
  }
  return {
    assignableVehicles,
    activePoints,
    ready: issues.length === 0,
    issues,
  };
}

export function executiveSummaryFromKpis(kpis: {
  distanceKm: { current: number; optimized: number };
  criticalCoveragePct: { optimized: number };
  co2KgAvoided: number;
}) {
  const savingPct =
    kpis.distanceKm.current > 0
      ? Math.round((1 - kpis.distanceKm.optimized / kpis.distanceKm.current) * 100)
      : 0;

  return {
    savingPct,
    distanceCurrent: kpis.distanceKm.current,
    distanceOptimized: kpis.distanceKm.optimized,
    criticalCoverage: kpis.criticalCoveragePct.optimized,
    co2Avoided: kpis.co2KgAvoided,
  };
}

export interface SimulationUiParameters {
  rainIntensity: string;
  wasteLevel: string;
  durationHours: string;
  conditions: Record<ConditionId, boolean>;
  scenarioId: ScenarioId;
  crewShortageEnabled?: boolean;
  operatorsShortage?: string;
  acoPreset?: string;
  acoAnts?: string;
  acoIterations?: string;
}

export interface ParameterEffectNote {
  label: string;
  status: 'connected' | 'informative';
  detail: string;
}

export function buildParameterEffectNotes(params: SimulationUiParameters): ParameterEffectNote[] {
  const notes: ParameterEffectNote[] = [];

  if (params.conditions.rain && params.scenarioId === 'rain') {
    notes.push({
      label: `Intensidad de lluvia (${params.rainIntensity})`,
      status: 'connected',
      detail: 'Escala el multiplicador de tiempo de viaje en escenario lluvia.',
    });
  } else if (params.conditions.rain) {
    notes.push({
      label: 'Lluvia intensa',
      status: 'connected',
      detail: 'Activa el escenario de lluvia; la intensidad aplica al ejecutar con ese escenario.',
    });
  }

  if (
    params.scenarioId === 'saturated' &&
    (params.conditions.waste_surge || params.conditions.critical_bin)
  ) {
    notes.push({
      label: `Nivel de desechos (+${params.wasteLevel}%)`,
      status: 'connected',
      detail: 'Incrementa la demanda simulada en escenario saturado.',
    });
  }

  notes.push({
    label: `Duración estimada (${params.durationHours} h)`,
    status: 'informative',
    detail: 'Se registra en la simulación; no modifica el cálculo del motor VRP.',
  });

  if (params.crewShortageEnabled) {
    const shortage = Number(params.operatorsShortage) || 0;
    const effectiveAssigned = Math.max(1, 6 - shortage);
    const perStopSec = serviceTimeSecondsPerStop(effectiveAssigned);
    const perStopMin = perStopSec / 60;
    notes.push({
      label: `Ausentismo del turno (−${shortage} operario${shortage === 1 ? '' : 's'} de campo)`,
      status: 'connected',
      detail: `${CREW_SHORTAGE_NARRATIVE} Tiempo por punto: ${perStopMin} min (${perStopSec} s).`,
    });
  }

  const ants = Number(params.acoAnts) || 12;
  const iterations = Number(params.acoIterations) || 20;
  notes.push({
    label: `Motor ACO (${ants} hormigas × ${iterations} iteraciones)`,
    status: 'connected',
    detail:
      'Controla cuánto explora la metaheurística antes de devolver la ruta. Más valores = mejor calidad posible, más tiempo de CPU.',
  });

  return notes;
}

export function buildSimulationRunParameters(params: SimulationUiParameters) {
  const payload: {
    rainIntensity?: string;
    wasteLevelPct?: number;
    estimatedDurationHours?: number;
    operatorsShortage?: number;
    acoAnts?: number;
    acoIterations?: number;
  } = {
    estimatedDurationHours: Number(params.durationHours) || undefined,
    acoAnts: Number(params.acoAnts) || 12,
    acoIterations: Number(params.acoIterations) || 20,
  };

  if (params.conditions.rain && params.scenarioId === 'rain') {
    payload.rainIntensity = params.rainIntensity;
  }
  if (params.scenarioId === 'saturated' && (params.conditions.waste_surge || params.conditions.critical_bin)) {
    payload.wasteLevelPct = Number(params.wasteLevel) || undefined;
  }
  if (params.crewShortageEnabled) {
    const shortage = Number(params.operatorsShortage);
    if (shortage >= 1 && shortage <= 5) {
      payload.operatorsShortage = shortage;
    }
  }

  return payload;
}
