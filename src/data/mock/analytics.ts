export const analyticsPageMeta = {
  title: 'Analítica',
  subtitle: 'Analiza datos clave y descubre patrones para mejorar la eficiencia del servicio.',
  dateLabel: '1 - 25 de junio, 2026',
};

export const analyticsKpis = [
  {
    id: 'collections',
    title: 'Total recolecciones',
    value: '1,248',
    trend: 12,
    iconTone: 'green' as const,
    icon: 'trash' as const,
    sparkline: [38, 42, 40, 48, 52, 55, 58, 62, 68, 72],
  },
  {
    id: 'tons',
    title: 'Toneladas recolectadas',
    value: '286.4 t',
    trend: 8,
    iconTone: 'blue' as const,
    icon: 'truck' as const,
    sparkline: [22, 24, 23, 28, 30, 32, 34, 36, 38, 42],
  },
  {
    id: 'distance',
    title: 'Distancia recorrida',
    value: '4,562 km',
    trend: 5,
    iconTone: 'amber' as const,
    icon: 'route' as const,
    sparkline: [90, 95, 92, 100, 108, 112, 118, 122, 130, 136],
  },
  {
    id: 'time',
    title: 'Tiempo operativo',
    value: '152 h 36 min',
    trend: 3,
    iconTone: 'purple' as const,
    icon: 'clock' as const,
    sparkline: [10, 11, 10, 12, 13, 12, 14, 15, 14, 16],
  },
  {
    id: 'efficiency',
    title: 'Eficiencia promedio',
    value: '86%',
    trend: 4,
    iconTone: 'green' as const,
    icon: 'leaf' as const,
    sparkline: [72, 74, 75, 78, 79, 81, 82, 84, 85, 86],
  },
];

export const evolutionSeries = {
  labels: ['1 jun', '5 jun', '9 jun', '13 jun', '17 jun', '21 jun', '25 jun'],
  collections: [42, 55, 61, 78, 88, 102, 118],
  tons: [16, 22, 26, 32, 38, 44, 52],
};

export const analyticsWasteTypes = {
  totalLabel: '286.4 t',
  items: [
    { label: 'Orgánicos', pct: 49, color: '#34D634' },
    { label: 'Reciclables', pct: 27, color: '#1143F3' },
    { label: 'No reciclables', pct: 16, color: '#f59e0b' },
    { label: 'Peligrosos', pct: 4, color: '#ef4444' },
    { label: 'Otros', pct: 2, color: '#7c3aed' },
  ],
};

export const analyticsRoutePerformance = [
  { id: 'norte', label: 'Ruta Norte 01', tons: 68.4, efficiency: 89 },
  { id: 'centro', label: 'Ruta Centro 02', tons: 62.1, efficiency: 86 },
  { id: 'sur', label: 'Ruta Sur 01', tons: 54.8, efficiency: 84 },
  { id: 'oeste', label: 'Ruta Oeste 03', tons: 48.2, efficiency: 82 },
  { id: 'este', label: 'Ruta Este 04', tons: 52.9, efficiency: 80 },
];

export const hourlyDistribution = {
  labels: ['00', '04', '08', '12', '16', '20'],
  toneladas: [4, 12, 38, 52, 44, 18],
  recolecciones: [2, 5, 22, 36, 30, 10],
};

export const hourlyMetricOptions = [
  { value: 'toneladas', label: 'Toneladas (t)' },
  { value: 'recolecciones', label: 'Recolecciones' },
] as const;

export type HourlyMetricId = (typeof hourlyMetricOptions)[number]['value'];

export const analyticsEfficiencyIndicators = [
  { id: 'coverage', label: 'Cobertura del servicio', value: 92 },
  { id: 'punctuality', label: 'Puntualidad en rutas', value: 88 },
  { id: 'fleet', label: 'Uso de la flota', value: 85 },
  { id: 'service', label: 'Nivel de servicio', value: 89 },
];

/** Points for MapLibre heatmap around Unare */
export const heatmapPoints = {
  type: 'FeatureCollection' as const,
  features: [
    { type: 'Feature' as const, properties: { weight: 0.9 }, geometry: { type: 'Point' as const, coordinates: [-62.722, 8.297] } },
    { type: 'Feature' as const, properties: { weight: 0.8 }, geometry: { type: 'Point' as const, coordinates: [-62.72, 8.295] } },
    { type: 'Feature' as const, properties: { weight: 0.95 }, geometry: { type: 'Point' as const, coordinates: [-62.718, 8.296] } },
    { type: 'Feature' as const, properties: { weight: 0.7 }, geometry: { type: 'Point' as const, coordinates: [-62.715, 8.293] } },
    { type: 'Feature' as const, properties: { weight: 0.85 }, geometry: { type: 'Point' as const, coordinates: [-62.712, 8.294] } },
    { type: 'Feature' as const, properties: { weight: 0.6 }, geometry: { type: 'Point' as const, coordinates: [-62.71, 8.29] } },
    { type: 'Feature' as const, properties: { weight: 0.75 }, geometry: { type: 'Point' as const, coordinates: [-62.725, 8.292] } },
    { type: 'Feature' as const, properties: { weight: 0.55 }, geometry: { type: 'Point' as const, coordinates: [-62.728, 8.298] } },
    { type: 'Feature' as const, properties: { weight: 0.65 }, geometry: { type: 'Point' as const, coordinates: [-62.716, 8.288] } },
    { type: 'Feature' as const, properties: { weight: 0.5 }, geometry: { type: 'Point' as const, coordinates: [-62.708, 8.286] } },
    { type: 'Feature' as const, properties: { weight: 0.9 }, geometry: { type: 'Point' as const, coordinates: [-62.721, 8.299] } },
    { type: 'Feature' as const, properties: { weight: 0.4 }, geometry: { type: 'Point' as const, coordinates: [-62.73, 8.285] } },
    { type: 'Feature' as const, properties: { weight: 0.7 }, geometry: { type: 'Point' as const, coordinates: [-62.714, 8.3] } },
    { type: 'Feature' as const, properties: { weight: 0.8 }, geometry: { type: 'Point' as const, coordinates: [-62.719, 8.291] } },
    { type: 'Feature' as const, properties: { weight: 0.45 }, geometry: { type: 'Point' as const, coordinates: [-62.705, 8.292] } },
    { type: 'Feature' as const, properties: { weight: 0.6 }, geometry: { type: 'Point' as const, coordinates: [-62.723, 8.287] } },
    { type: 'Feature' as const, properties: { weight: 0.35 }, geometry: { type: 'Point' as const, coordinates: [-62.732, 8.294] } },
    { type: 'Feature' as const, properties: { weight: 0.55 }, geometry: { type: 'Point' as const, coordinates: [-62.711, 8.298] } },
  ],
};

export const analyticsInsights = [
  {
    id: 'i1',
    tone: 'green' as const,
    icon: 'trend' as const,
    text: 'Las recolecciones aumentaron 12% respecto al período anterior; el desempeño general se mantiene sólido.',
  },
  {
    id: 'i2',
    tone: 'amber' as const,
    icon: 'clock' as const,
    text: 'El 65% de las recolecciones ocurre entre 08:00 y 16:00; conviene reforzar capacidad en horas pico.',
  },
  {
    id: 'i3',
    tone: 'purple' as const,
    icon: 'route' as const,
    text: 'Ruta Norte 01 lidera con 89% de eficiencia; sirve como referencia para optimizar otras rutas.',
  },
  {
    id: 'i4',
    tone: 'blue' as const,
    icon: 'leaf' as const,
    text: 'Los residuos orgánicos representan el 49% del total; evalúa estrategias de compostaje o separación en origen.',
  },
];
