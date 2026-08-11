export const simulationPageMeta = {
  title: 'Simulación de Escenarios',
  subtitle: 'Simula distintas condiciones y analiza el impacto en las rutas de recolección.',
};

export const simulationSteps = [
  { id: 1, label: 'Configuración' },
  { id: 2, label: 'Ejecutar simulación' },
  { id: 3, label: 'Resultados' },
] as const;

export const scenarioPresets = [
  { id: 'custom', label: 'Escenario personalizado' },
  { id: 'peak_traffic', label: 'Tráfico alto' },
  { id: 'rain', label: 'Lluvia intensa' },
  { id: 'saturated', label: 'Contenedor crítico' },
  { id: 'waste_surge', label: 'Aumento de desechos' },
];

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
  { id: 'rain' as const, label: 'Lluvia intensa', defaultOn: true, icon: 'cloud-rain' as const },
  { id: 'broken_vehicle' as const, label: 'Vehículo averiado', defaultOn: false, icon: 'truck' as const },
  { id: 'critical_bin' as const, label: 'Contenedor crítico', defaultOn: true, icon: 'trash' as const },
  { id: 'roadblock' as const, label: 'Bloqueo de vía', defaultOn: false, icon: 'cone' as const },
  { id: 'waste_surge' as const, label: 'Aumento de desechos', defaultOn: true, icon: 'chart' as const },
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

export const currentScenarioSummary = {
  title: 'Lluvia intensa + Tráfico alto',
  icon: 'cloud-rain' as const,
};

export const simulationImpactRows = [
  { metric: 'Distancia total', current: '112.3 km', simulated: '98.7 km', delta: -12.1 },
  { metric: 'Tiempo total', current: '5 h 16 min', simulated: '4 h 32 min', delta: -13.9 },
  { metric: 'Combustible', current: '28.6 L', simulated: '24.3 L', delta: -15.0 },
  { metric: 'Costo operativo', current: '$142.5', simulated: '$113.2', delta: -20.6 },
];

export const simulationSavings = {
  distanceKm: 13.6,
  timeMin: 44,
  fuelL: 4.3,
  costUsd: 29.3,
};

export const simulationEfficiency = 86;

export const performanceIndicators = [
  { id: 'coverage', label: 'Cobertura', value: 92 },
  { id: 'punctuality', label: 'Puntualidad', value: 78 },
  { id: 'fleet', label: 'Uso de flota', value: 85 },
  { id: 'service', label: 'Nivel de servicio', value: 89 },
];

export const mapRouteLegend = [
  { id: 'current', label: 'Ruta actual', style: 'dashed-slate' as const },
  { id: 'optimized', label: 'Ruta optimizada', style: 'solid-green' as const },
  { id: 'deviation', label: 'Desvíos por condiciones', style: 'dashed-red' as const },
];

export const mapMarkerLegend = [
  { id: 'normal', label: 'Contenedor normal', icon: 'trash' as const, class: 'text-fero-green-dark' },
  { id: 'full', label: 'Contenedor lleno', icon: 'trash' as const, class: 'text-amber-500' },
  { id: 'critical', label: 'Contenedor crítico', icon: 'trash' as const, class: 'text-red-500' },
  { id: 'vehicle', label: 'Vehículo en mantenimiento', icon: 'truck' as const, class: 'text-violet-600' },
  { id: 'block', label: 'Bloqueo de vía', icon: 'cone' as const, class: 'text-red-600' },
];

export const simulationHistory = [
  {
    id: 'sim-01',
    name: 'Lluvia + Tráfico',
    datetime: '25/06/2026 09:12',
    conditionIcons: ['cloud-rain', 'car'] as const,
    result: 'completado' as const,
    efficiency: 86,
  },
  {
    id: 'sim-02',
    name: 'Contenedores saturados',
    datetime: '24/06/2026 16:40',
    conditionIcons: ['trash'] as const,
    result: 'completado' as const,
    efficiency: 91,
  },
  {
    id: 'sim-03',
    name: 'Tráfico pico matutino',
    datetime: '24/06/2026 07:05',
    conditionIcons: ['car'] as const,
    result: 'completado' as const,
    efficiency: 78,
  },
  {
    id: 'sim-04',
    name: 'Accidente + desvío',
    datetime: '23/06/2026 11:22',
    conditionIcons: ['cone', 'car'] as const,
    result: 'completado' as const,
    efficiency: 74,
  },
];

/** GeoJSON overlays for the scenario map (Unare area). */
export const simulationMapRoutes = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      properties: { kind: 'current' },
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [-62.728, 8.3],
          [-62.722, 8.297],
          [-62.716, 8.294],
          [-62.71, 8.291],
          [-62.705, 8.288],
        ],
      },
    },
    {
      type: 'Feature' as const,
      properties: { kind: 'optimized' },
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [-62.728, 8.3],
          [-62.724, 8.296],
          [-62.718, 8.293],
          [-62.712, 8.29],
          [-62.705, 8.288],
        ],
      },
    },
    {
      type: 'Feature' as const,
      properties: { kind: 'deviation' },
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [-62.722, 8.297],
          [-62.72, 8.3],
          [-62.716, 8.298],
          [-62.716, 8.294],
        ],
      },
    },
  ],
};

export const simulationMapPoints = [
  { id: 'n1', lng: -62.728, lat: 8.3, status: 'normal' as const },
  { id: 'f1', lng: -62.722, lat: 8.297, status: 'full' as const },
  { id: 'c1', lng: -62.716, lat: 8.294, status: 'critical' as const },
  { id: 'n2', lng: -62.71, lat: 8.291, status: 'normal' as const },
  { id: 'f2', lng: -62.705, lat: 8.288, status: 'full' as const },
  { id: 'c2', lng: -62.72, lat: 8.3, status: 'critical' as const },
  { id: 'v1', lng: -62.714, lat: 8.296, status: 'vehicle' as const },
  { id: 'b1', lng: -62.72, lat: 8.299, status: 'block' as const },
];
