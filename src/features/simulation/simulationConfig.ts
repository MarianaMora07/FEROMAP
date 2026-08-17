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

/** Jornada operativa de referencia para KPI exceedsWorkday (turno típico 06:00–18:00). */
export const DEFAULT_SHIFT_REFERENCE_HOURS = '12';

export const durationOptions = [
  { value: '6', label: '6 horas' },
  { value: '8', label: '8 horas' },
  { value: '10', label: '10 horas' },
  { value: '12', label: '12 horas (turno típico)' },
];

export const acoPresetOptions = [
  { value: 'fast', label: 'Rápido (6 × 10)', ants: 6, iterations: 10 },
  { value: 'standard', label: 'Estándar (12 × 20)', ants: 12, iterations: 20 },
  { value: 'precise', label: 'Preciso (20 × 40)', ants: 20, iterations: 40 },
  { value: 'custom', label: 'Personalizado', ants: 12, iterations: 20 },
] as const;

export type AcoPresetId = (typeof acoPresetOptions)[number]['value'];

export function resolveDefaultAcoPreset(): AcoPresetId {
  const fromEnv = import.meta.env.VITE_ACO_PRESET_DEFAULT?.trim().toLowerCase();
  if (fromEnv === 'fast' || fromEnv === 'standard' || fromEnv === 'precise' || fromEnv === 'custom') {
    return fromEnv;
  }
  return 'standard';
}

export function acoValuesForPreset(preset: AcoPresetId): { ants: string; iterations: string } {
  const match = acoPresetOptions.find((option) => option.value === preset) ?? acoPresetOptions[1]!;
  return { ants: String(match.ants), iterations: String(match.iterations) };
}

export const acoAntsOptions = [
  { value: '4', label: '4 hormigas' },
  { value: '6', label: '6 hormigas' },
  { value: '8', label: '8 hormigas' },
  { value: '12', label: '12 hormigas' },
  { value: '16', label: '16 hormigas' },
  { value: '20', label: '20 hormigas' },
  { value: '24', label: '24 hormigas' },
  { value: '30', label: '30 hormigas' },
];

export const acoIterationsOptions = [
  { value: '5', label: '5 iteraciones' },
  { value: '10', label: '10 iteraciones' },
  { value: '15', label: '15 iteraciones' },
  { value: '20', label: '20 iteraciones' },
  { value: '30', label: '30 iteraciones' },
  { value: '40', label: '40 iteraciones' },
  { value: '50', label: '50 iteraciones' },
  { value: '60', label: '60 iteraciones' },
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

export const mapManualRouteLegend = [
  { id: 'current', label: 'Ruta planificada a mano', style: 'dashed-slate' as const },
];

export const mapMarkerLegend = [
  { id: 'normal', label: 'Contenedor normal', icon: 'trash' as const, class: 'text-fero-green-dark' },
  { id: 'full', label: 'Contenedor lleno', icon: 'trash' as const, class: 'text-amber-500' },
  { id: 'critical', label: 'Contenedor crítico', icon: 'trash' as const, class: 'text-red-500' },
];

/** Leyenda neutra en planificación — aún no se conoce el nivel de llenado. */
export const mapPlanningMarkerLegend = [
  { id: 'containers', label: 'Contenedores', icon: 'trash' as const, class: 'text-fero-green-dark' },
];

export const PLANNING_CONTAINER_MARKER_COLOR = '#22c55e';
export const PLANNING_CONTAINER_MARKER_HALO_COLOR = 'rgba(34, 197, 94, 0.35)';
export const DEFAULT_PLANNING_CONTAINER_MARKER_SIZE_PX = 48;

export const planningContainerMarkerSizeOptions = [
  { value: 24, label: '24 px — muy pequeño' },
  { value: 32, label: '32 px — pequeño' },
  { value: 48, label: '48 px — medio' },
  { value: 64, label: '64 px — grande' },
  { value: 80, label: '80 px' },
  { value: 100, label: '100 px' },
  { value: 120, label: '120 px' },
  { value: 150, label: '150 px' },
  { value: 200, label: '200 px — muy grande' },
] as const;

export function planningContainerCircleMetrics(sizePx: number) {
  const radius = sizePx / 2;
  return {
    radius,
    haloRadius: radius + Math.max(10, Math.round(radius * 0.18)),
    strokeWidth: Math.max(2, Math.min(10, Math.round(sizePx / 22))),
  };
}

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
