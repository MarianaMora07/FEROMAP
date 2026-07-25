export const dashboardSummary = {
  greeting: '¡Bienvenida, Mariana!',
  subtitle: 'Resumen general del sistema de recolección de residuos.',
  dateLabel: '25 de junio, 2026',
  notifications: 3,
  operatorsOnline: 12,
  user: { name: 'Mariana Mora', role: 'Administrador', initials: 'MM' },
};

export const dashboardKpis = {
  wasteTons: { value: '28.45', unit: 'toneladas', trend: 12 },
  routes: { done: 18, total: 24 },
  vehicles: { active: 14, total: 18 },
  alerts: { count: 7 },
};

export const fleetStatus = {
  total: 18,
  items: [
    { label: 'Activos', count: 14, pct: 78, color: '#34D634' },
    { label: 'En mantenimiento', count: 2, pct: 11, color: '#1143F3' },
    { label: 'Fuera de servicio', count: 1, pct: 6, color: '#f59e0b' },
    { label: 'Inactivos', count: 1, pct: 5, color: '#94a3b8' },
  ],
};

export const sectorFillLevels = [
  { name: 'Unare I', pct: 72 },
  { name: 'Unare II', pct: 58 },
  { name: 'Villa Brasil', pct: 85 },
  { name: 'Andrés Eloy', pct: 46 },
];

export const weeklyTons = {
  labels: ['19 jun', '20 jun', '21 jun', '22 jun', '23 jun', '24 jun', '25 jun'],
  values: [18.2, 21.5, 19.8, 24.1, 22.6, 26.3, 28.5],
};

export const activeRoutes = [
  { id: 'Norte 01', driver: 'Carlos Rivas', vehicle: 'TR-03', progress: 78, tone: 'info' as const },
  { id: 'Centro 02', driver: 'Ana Pérez', vehicle: 'TR-11', progress: 54, tone: 'success' as const },
  { id: 'Sur 01', driver: 'Luis Méndez', vehicle: 'TR-07', progress: 31, tone: 'success' as const },
];

export const recentAlerts = [
  {
    title: 'Contenedor crítico de llenado',
    detail: 'CNT-014 · Villa Brasil · 92%',
    time: '10:15 AM',
    tone: 'danger' as const,
  },
  {
    title: 'Tráfico denso detectado',
    detail: 'Av. Guayana · impacto en Norte 01',
    time: '09:42 AM',
    tone: 'warning' as const,
  },
  {
    title: 'Vehículo TR-06 detenido',
    detail: 'Más de 12 min sin movimiento',
    time: '09:10 AM',
    tone: 'info' as const,
  },
];
