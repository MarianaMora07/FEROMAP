export const optimizationPageMeta = {
  title: 'Planificación operativa',
  subtitle: 'Uso diario de rutas — genere y despache rutas para la operación del día.',
};

export const optimizationTabs = [
  { id: 'nueva', label: 'Nueva optimización' },
  { id: 'historial', label: 'Historial operativo' },
] as const;

export type OptimizationTabId = (typeof optimizationTabs)[number]['id'];

export const algorithms = [
  { id: 'aco', label: 'Colonia de Hormigas (ACO)' },
  { id: 'ga', label: 'Algoritmo Genético' },
  { id: 'sa', label: 'Recocido Simulado' },
];

export const objectives = [
  { id: 'distance_time', label: 'Minimizar distancia y tiempo' },
  { id: 'fuel', label: 'Minimizar consumo de combustible' },
  { id: 'coverage', label: 'Maximizar cobertura crítica' },
];

export const availableVehicles = [
  { id: 'TR-08', tone: 'blue' as const },
  { id: 'TR-04', tone: 'green' as const },
  { id: 'TR-11', tone: 'purple' as const },
];

export const constraints = [
  { id: 'avoid_traffic', label: 'Evitar vías con tráfico alto', checked: true },
  { id: 'fill_level', label: 'Considerar nivel de llenado', checked: true },
  { id: 'time_window', label: 'Ventana de tiempo', checked: false },
  { id: 'critical_first', label: 'Priorizar contenedores críticos', checked: true },
];

export const scenarioInfo = [
  { label: 'Puntos a visitar', value: '48', icon: 'map-pin' as const },
  { label: 'Distancia total estimada', value: '85.6 km', icon: 'route' as const },
  { label: 'Tiempo estimado', value: '3 h 42 min', icon: 'clock' as const },
  { label: 'Toneladas estimadas', value: '28.4 ton', icon: 'weight' as const },
];

export const routeResults = [
  {
    id: 'TR-08',
    tone: 'blue' as const,
    distanceKm: 29.4,
    duration: '1 h 18 min',
    points: 17,
    tons: 9.8,
    capacityPct: 95,
  },
  {
    id: 'TR-04',
    tone: 'green' as const,
    distanceKm: 27.1,
    duration: '1 h 12 min',
    points: 15,
    tons: 9.1,
    capacityPct: 87,
  },
  {
    id: 'TR-11',
    tone: 'purple' as const,
    distanceKm: 29.1,
    duration: '1 h 12 min',
    points: 16,
    tons: 9.5,
    capacityPct: 90,
  },
];

export const resultsTotals = {
  distanceKm: 85.6,
  duration: '3 h 42 min',
  tons: 28.4,
  fuelL: 18.7,
};

export const comparisonRows = [
  {
    metric: 'Distancia total',
    current: '112.4 km',
    optimized: '85.6 km',
    delta: -23.8,
  },
  {
    metric: 'Tiempo total',
    current: '5 h 16 min',
    optimized: '3 h 42 min',
    delta: -29.5,
  },
  {
    metric: 'Combustible',
    current: '28.6 L',
    optimized: '18.7 L',
    delta: -34.6,
  },
  {
    metric: 'Costo operativo',
    current: '$412',
    optimized: '$270',
    delta: -34.5,
  },
];

export const savingsBanner = {
  text: 'Ahorro estimado: 23.8 km, 1 h 34 min y 9.9 L de combustible',
};

export const mapLegendVehicles = [
  { id: 'TR-08', class: 'text-fero-blue' },
  { id: 'TR-04', class: 'text-fero-green-dark' },
  { id: 'TR-11', class: 'text-violet-600' },
];

export const mapLegendContainers = [
  { label: 'Crítico', class: 'text-red-500' },
  { label: 'Lleno', class: 'text-amber-500' },
  { label: 'Normal', class: 'text-fero-green-dark' },
  { label: 'Parcial', class: 'text-slate-400' },
];
