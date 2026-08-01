import type { Scenario, ScenarioId } from '../../data/types/simulation';

export const simulationSteps = [
  { id: 1, label: 'Configuración' },
  { id: 2, label: 'Ejecutar simulación' },
  { id: 3, label: 'Resultados' },
] as const;

export type ConditionId =
  | 'traffic'
  | 'rain'
  | 'broken_vehicle'
  | 'critical_bin'
  | 'roadblock'
  | 'waste_surge'
  | 'accident';

export const simulationConditions = [
  { id: 'traffic' as const, label: 'Tráfico alto', defaultOn: true, icon: 'car' as const },
  { id: 'rain' as const, label: 'Lluvia intensa', defaultOn: false, icon: 'cloud-rain' as const },
  { id: 'broken_vehicle' as const, label: 'Vehículo averiado', defaultOn: false, icon: 'truck' as const },
  { id: 'critical_bin' as const, label: 'Contenedor crítico', defaultOn: true, icon: 'trash' as const },
  { id: 'roadblock' as const, label: 'Bloqueo de vía', defaultOn: false, icon: 'cone' as const },
  { id: 'waste_surge' as const, label: 'Aumento de desechos', defaultOn: false, icon: 'chart' as const },
  { id: 'accident' as const, label: 'Accidente vial', defaultOn: false, icon: 'alert' as const },
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

export function scenarioPresetsFromApi(scenarios: Scenario[]) {
  return [
    { id: 'custom', label: 'Escenario personalizado' },
    ...scenarios.map((scenario) => ({ id: scenario.id, label: scenario.label })),
  ];
}

export function quickScenariosFromApi(scenarios: Scenario[]) {
  const icons: Record<ScenarioId, 'car' | 'cloud-rain' | 'trash' | 'chart' | 'truck'> = {
    normal: 'chart',
    peak_traffic: 'car',
    rain: 'cloud-rain',
    saturated: 'trash',
    broken_vehicle: 'truck',
  };

  return scenarios
    .filter((scenario) => scenario.id !== 'normal')
    .map((scenario) => ({
      id: scenario.id,
      title: scenario.label,
      description: scenario.description,
      icon: icons[scenario.id],
    }));
}

export const defaultConditions = (): Record<ConditionId, boolean> =>
  Object.fromEntries(simulationConditions.map((condition) => [condition.id, condition.defaultOn])) as Record<
    ConditionId,
    boolean
  >;
