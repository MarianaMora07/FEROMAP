export const reportsPageMeta = {
  title: 'Reportes',
  subtitle: 'Genera y analiza reportes de rendimiento y operación del sistema.',
  dateLabel: '1 - 25 de junio, 2026',
};

export const reportsKpis = [
  {
    id: 'collections',
    title: 'Total recolecciones',
    value: '1,248',
    trend: 12,
    iconTone: 'green' as const,
    icon: 'trash' as const,
  },
  {
    id: 'tons',
    title: 'Toneladas recolectadas',
    value: '286.4 t',
    trend: 8,
    iconTone: 'blue' as const,
    icon: 'truck' as const,
  },
  {
    id: 'distance',
    title: 'Distancia recorrida',
    value: '4,562 km',
    trend: 5,
    iconTone: 'amber' as const,
    icon: 'route' as const,
  },
  {
    id: 'time',
    title: 'Tiempo operativo',
    value: '152 h 36 min',
    trend: 3,
    iconTone: 'purple' as const,
    icon: 'clock' as const,
  },
  {
    id: 'efficiency',
    title: 'Eficiencia promedio',
    value: '86%',
    trend: 4,
    iconTone: 'green' as const,
    icon: 'leaf' as const,
  },
];

export const performanceSeries = {
  labels: ['1 jun', '5 jun', '9 jun', '13 jun', '17 jun', '21 jun', '25 jun'],
  collections: [42, 55, 61, 70, 78, 88, 96],
  tons: [18, 24, 28, 32, 36, 40, 45],
  distance: [95, 110, 118, 125, 132, 140, 148],
  efficiency: [72, 75, 78, 80, 83, 85, 86],
};

export const reportTypeOptions = [
  { value: 'performance', label: 'Reporte de desempeño' },
  { value: 'routes', label: 'Reporte de rutas' },
  { value: 'waste', label: 'Reporte de residuos' },
  { value: 'fleet', label: 'Reporte de flota' },
];

export const reportPeriodOptions = [
  { value: 'week', label: 'Última semana' },
  { value: 'month', label: 'Último mes' },
  { value: 'quarter', label: 'Último trimestre' },
  { value: 'custom', label: 'Personalizado' },
];

export const wasteTypeDistribution = {
  totalLabel: '286.4 t',
  items: [
    { label: 'Orgánicos', pct: 49, color: '#34D634' },
    { label: 'Reciclables', pct: 27, color: '#1143F3' },
    { label: 'No reciclables', pct: 16, color: '#f59e0b' },
    { label: 'Peligrosos', pct: 4, color: '#ef4444' },
    { label: 'Otros', pct: 2, color: '#94a3b8' },
  ],
};

export const routePerformance = [
  { id: 'norte', label: 'Norte 01', tons: 68.4, color: '#34D634' },
  { id: 'centro', label: 'Centro 02', tons: 62.1, color: '#1143F3' },
  { id: 'sur', label: 'Sur 01', tons: 54.8, color: '#7c3aed' },
  { id: 'oeste', label: 'Oeste 03', tons: 48.2, color: '#f59e0b' },
  { id: 'este', label: 'Este 04', tons: 52.9, color: '#06b6d4' },
];

export const periodComparison = [
  { metric: 'Total recolecciones', current: '1,248', previous: '1,114', delta: 12 },
  { metric: 'Toneladas', current: '286.4 t', previous: '265.2 t', delta: 8 },
  { metric: 'Distancia', current: '4,562 km', previous: '4,345 km', delta: 5 },
  { metric: 'Tiempo operativo', current: '152 h 36 min', previous: '148 h 10 min', delta: 3 },
  { metric: 'Eficiencia', current: '86%', previous: '82%', delta: 4 },
];

export const savedReports = [
  {
    id: 'r1',
    name: 'Reporte de desempeño - Junio 2026',
    type: 'Desempeño',
    period: '01/06 – 25/06/2026',
    format: 'pdf' as const,
    generatedAt: '25/06/2026 10:42 AM',
  },
  {
    id: 'r2',
    name: 'Reporte de rutas - Mayo 2026',
    type: 'Rutas',
    period: '01/05 – 31/05/2026',
    format: 'excel' as const,
    generatedAt: '01/06/2026 09:15 AM',
  },
  {
    id: 'r3',
    name: 'Reporte de residuos - Abril 2026',
    type: 'Residuos',
    period: '01/04 – 30/04/2026',
    format: 'pdf' as const,
    generatedAt: '02/05/2026 08:30 AM',
  },
];
