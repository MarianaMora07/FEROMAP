import type { ScenarioId } from '../../data/types/simulation';

export const simulationSteps = [
  { id: 1, label: 'Configuración' },
  { id: 2, label: 'Revisión y ejecución' },
  { id: 3, label: 'Resultados e impacto' },
] as const;

export type ConditionId =
  | 'rain'
  | 'broken_vehicle'
  | 'critical_bin'
  | 'accident'
  | 'waste_surge';

export const simulationConditions: {
  id: ConditionId;
  label: string;
  description: string;
  defaultOn: boolean;
  icon: 'cloud-rain' | 'truck' | 'trash' | 'alert' | 'chart';
}[] = [
  {
    id: 'rain',
    label: 'Lluvia intensa',
    description: 'Retrasa el trabajo: reduce velocidad y puede bloquear vías principales.',
    defaultOn: false,
    icon: 'cloud-rain',
  },
  {
    id: 'broken_vehicle',
    label: 'Vehículo averiado',
    description: 'Simula flota reducida y mayor carga sobre los camiones restantes.',
    defaultOn: false,
    icon: 'truck',
  },
  {
    id: 'critical_bin',
    label: 'Contenedor crítico',
    description: 'Prioriza puntos con llenado crítico y aumenta la demanda de recolección.',
    defaultOn: false,
    icon: 'trash',
  },
  {
    id: 'accident',
    label: 'Accidente vial',
    description: 'Congestión y tiempos de viaje elevados por incidente en la red vial.',
    defaultOn: false,
    icon: 'alert',
  },
  {
    id: 'waste_surge',
    label: 'Aumento de desechos',
    description: 'Incrementa la carga estimada en los contenedores del escenario.',
    defaultOn: false,
    icon: 'chart',
  },
];

export const rainIntensityOptions = [
  { value: 'baja', label: 'Baja' },
  { value: 'media', label: 'Media' },
  { value: 'alta', label: 'Alta' },
];

export const wasteLevelOptions = [
  { value: '10', label: '+10%' },
  { value: '20', label: '+20%' },
  { value: '30', label: '+30%' },
  { value: '50', label: '+50%' },
];

export const durationOptions = [
  { value: '2', label: '2 horas' },
  { value: '4', label: '4 horas' },
  { value: '6', label: '6 horas' },
  { value: '8', label: '8 horas' },
];

/** Operarios de campo ausentes en el turno (ADR-003). */
export const operatorsShortageOptions = [
  { value: '1', label: '1 operario de campo ausente' },
  { value: '2', label: '2 operarios de campo ausentes' },
  { value: '3', label: '3 operarios de campo ausentes' },
  { value: '4', label: '4 operarios de campo ausentes' },
  { value: '5', label: '5 operarios de campo ausentes' },
];

export const CREW_SHORTAGE_NARRATIVE =
  'El conductor siempre está en el camión. El ausentismo resta solo operarios de campo (máx. 5) en todas las cuadrillas.';

export const mapRouteLegend = [
  { id: 'current', label: 'Ruta actual', style: 'dashed-slate' as const },
  { id: 'optimized', label: 'Ruta optimizada', style: 'solid-green' as const },
];

export const mapMarkerLegend = [
  { id: 'normal', label: 'Contenedor normal', icon: 'trash' as const, class: 'text-fero-green-dark' },
  { id: 'full', label: 'Contenedor lleno', icon: 'trash' as const, class: 'text-amber-500' },
  { id: 'critical', label: 'Contenedor crítico', icon: 'trash' as const, class: 'text-red-500' },
];

const SCENARIO_IDS: ScenarioId[] = ['normal', 'peak_traffic', 'rain', 'saturated', 'broken_vehicle'];

export function isScenarioId(value: string): value is ScenarioId {
  return SCENARIO_IDS.includes(value as ScenarioId);
}

export function defaultConditions(): Record<ConditionId, boolean> {
  return Object.fromEntries(
    simulationConditions.map((condition) => [condition.id, condition.defaultOn]),
  ) as Record<ConditionId, boolean>;
}

/** Toggles que representan un escenario base (para escenarios rápidos e historial). */
export function conditionsForScenario(scenarioId: ScenarioId): Record<ConditionId, boolean> {
  const base = defaultConditions();
  switch (scenarioId) {
    case 'rain':
      return { ...base, rain: true };
    case 'broken_vehicle':
      return { ...base, broken_vehicle: true };
    case 'saturated':
      return { ...base, critical_bin: true };
    case 'peak_traffic':
      return { ...base, accident: true };
    case 'normal':
    default:
      return base;
  }
}
