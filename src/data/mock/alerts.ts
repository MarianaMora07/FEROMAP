export const alertsPageMeta = {
  title: 'Alertas',
  subtitle: 'Gestiona y da seguimiento a las alertas generadas en el sistema.',
};

export type AlertPriority = 'critica' | 'advertencia' | 'informativa';
export type AlertStatus = 'nueva' | 'en-progreso' | 'informativa' | 'resuelta';
export type AlertCategory = 'contenedores' | 'trafico' | 'vehiculos' | 'mantenimiento' | 'sistema';

export interface SystemAlert {
  id: string;
  priority: AlertPriority;
  title: string;
  detail: string;
  source: string;
  location: string;
  datetime: string;
  status: AlertStatus;
  category: AlertCategory;
  lng: number;
  lat: number;
}

export const alertsKpis = [
  {
    id: 'critical',
    title: 'Críticas',
    value: 5,
    subtitle: 'Requieren atención inmediata',
    iconTone: 'red' as const,
    icon: 'alert' as const,
  },
  {
    id: 'warning',
    title: 'Advertencias',
    value: 12,
    subtitle: 'Requieren seguimiento',
    iconTone: 'amber' as const,
    icon: 'alert' as const,
  },
  {
    id: 'info',
    title: 'Informativas',
    value: 18,
    subtitle: 'Para tu conocimiento',
    iconTone: 'blue' as const,
    icon: 'info' as const,
  },
  {
    id: 'resolved',
    title: 'Resueltas hoy',
    value: 8,
    subtitle: 'Alertas atendidas',
    iconTone: 'green' as const,
    icon: 'check' as const,
  },
  {
    id: 'all',
    title: 'Todas las alertas',
    value: 35,
    subtitle: '+15% vs ayer',
    iconTone: 'blue' as const,
    icon: 'chart' as const,
    sparkline: [18, 20, 19, 24, 26, 28, 30, 32, 33, 35],
  },
];

export const alertCategoryOptions = [
  { value: '', label: 'Todas las categorías' },
  { value: 'contenedores', label: 'Contenedores' },
  { value: 'trafico', label: 'Tráfico y rutas' },
  { value: 'vehiculos', label: 'Vehículos' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'sistema', label: 'Sistema' },
];

export const alertStatusOptions = [
  { value: '', label: 'Todos los estados' },
  { value: 'nueva', label: 'Nueva' },
  { value: 'en-progreso', label: 'En progreso' },
  { value: 'informativa', label: 'Informativa' },
  { value: 'resuelta', label: 'Resuelta' },
];

export const alertsList: SystemAlert[] = [
  {
    id: 'al-01',
    priority: 'critica',
    title: 'Contenedor crítico lleno',
    detail: 'Nivel > 95%',
    source: 'Contenedor #121',
    location: 'Av. Principal con Calle Sucre',
    datetime: '25/06/2026 10:24 AM',
    status: 'nueva',
    category: 'contenedores',
    lng: -62.72,
    lat: 8.297,
  },
  {
    id: 'al-02',
    priority: 'advertencia',
    title: 'Tráfico alto en ruta',
    detail: 'Retraso estimado 25 min',
    source: 'Ruta Norte 01',
    location: 'Av. Guayana',
    datetime: '25/06/2026 10:15 AM',
    status: 'en-progreso',
    category: 'trafico',
    lng: -62.714,
    lat: 8.294,
  },
  {
    id: 'al-03',
    priority: 'informativa',
    title: 'Vehículo en mantenimiento',
    detail: 'Unidad fuera de operación',
    source: 'Vehículo TR-02',
    location: 'Taller Central',
    datetime: '25/06/2026 09:48 AM',
    status: 'informativa',
    category: 'mantenimiento',
    lng: -62.728,
    lat: 8.29,
  },
  {
    id: 'al-04',
    priority: 'critica',
    title: 'GPS sin señal',
    detail: 'Última posición hace 18 min',
    source: 'Vehículo TR-06',
    location: 'Sector Unare II',
    datetime: '25/06/2026 09:40 AM',
    status: 'nueva',
    category: 'vehiculos',
    lng: -62.71,
    lat: 8.291,
  },
  {
    id: 'al-05',
    priority: 'advertencia',
    title: 'Contenedor lleno',
    detail: 'Nivel 82%',
    source: 'Contenedor #078',
    location: 'Plaza Bolívar Unare',
    datetime: '25/06/2026 09:22 AM',
    status: 'en-progreso',
    category: 'contenedores',
    lng: -62.725,
    lat: 8.299,
  },
  {
    id: 'al-06',
    priority: 'informativa',
    title: 'Actualización de sistema',
    detail: 'Sincronización completada',
    source: 'Sistema',
    location: '—',
    datetime: '25/06/2026 08:55 AM',
    status: 'resuelta',
    category: 'sistema',
    lng: -62.715,
    lat: 8.295,
  },
  {
    id: 'al-07',
    priority: 'critica',
    title: 'Bloqueo de vía',
    detail: 'Desvío obligatorio',
    source: 'Ruta Centro 02',
    location: 'Calle Comercio',
    datetime: '25/06/2026 08:30 AM',
    status: 'nueva',
    category: 'trafico',
    lng: -62.718,
    lat: 8.288,
  },
  {
    id: 'al-08',
    priority: 'advertencia',
    title: 'Retraso en recolección',
    detail: '+18 min vs planificado',
    source: 'Ruta Sur 01',
    location: 'Villa Asia',
    datetime: '25/06/2026 08:05 AM',
    status: 'en-progreso',
    category: 'trafico',
    lng: -62.708,
    lat: 8.285,
  },
];

export const alertsDistribution = {
  total: 35,
  items: [
    { label: 'Críticas', pct: 14, count: 5, color: '#ef4444' },
    { label: 'Advertencias', pct: 34, count: 12, color: '#f59e0b' },
    { label: 'Informativas', pct: 52, count: 18, color: '#1143F3' },
  ],
};

export const alertsByCategory = [
  { label: 'Contenedores llenos', count: 12, color: '#34D634' },
  { label: 'Tráfico y rutas', count: 9, color: '#f59e0b' },
  { label: 'Vehículos', count: 6, color: '#7c3aed' },
  { label: 'Mantenimiento', count: 4, color: '#1143F3' },
  { label: 'Sistema', count: 4, color: '#94a3b8' },
];

export const recentAlertActivity = [
  {
    id: 'ra1',
    time: '10:24 AM',
    title: 'Contenedor #121 crítico',
    detail: 'Nivel > 95% · Av. Principal',
    status: 'nueva' as AlertStatus,
  },
  {
    id: 'ra2',
    time: '10:15 AM',
    title: 'Tráfico alto en Ruta Norte 01',
    detail: 'Retraso estimado 25 min',
    status: 'en-progreso' as AlertStatus,
  },
  {
    id: 'ra3',
    time: '09:48 AM',
    title: 'TR-02 en mantenimiento',
    detail: 'Unidad fuera de operación',
    status: 'informativa' as AlertStatus,
  },
  {
    id: 'ra4',
    time: '09:40 AM',
    title: 'TR-06 sin señal GPS',
    detail: 'Última posición hace 18 min',
    status: 'nueva' as AlertStatus,
  },
];

export const mapAlertLegend = [
  { id: 'critica', label: 'Crítica', color: '#ef4444' },
  { id: 'advertencia', label: 'Advertencia', color: '#f59e0b' },
  { id: 'informativa', label: 'Informativa', color: '#1143F3' },
  { id: 'contenedor', label: 'Contenedor', color: '#34D634', icon: 'trash' as const },
  { id: 'vehiculo', label: 'Vehículo', color: '#7c3aed', icon: 'truck' as const },
];

export const priorityColor: Record<AlertPriority, string> = {
  critica: '#ef4444',
  advertencia: '#f59e0b',
  informativa: '#1143F3',
};
