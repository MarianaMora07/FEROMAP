export const adminPageMeta = {
  title: 'Configuración',
  subtitle: 'Administra las preferencias y parámetros del sistema.',
  dateLabel: '25 de junio, 2026',
};

export type AdminTabId =
  | 'general'
  | 'routes'
  | 'collection'
  | 'notifications'
  | 'integrations'
  | 'users'
  | 'security'
  | 'api';

export type AdminCategoryId =
  | 'info'
  | 'params'
  | 'units'
  | 'personalization'
  | 'backup'
  | 'import-export'
  | 'algorithm'
  | 'weights'
  | 'constraints'
  | 'schedules'
  | 'thresholds'
  | 'channels'
  | 'alerts-cfg'
  | 'gis'
  | 'telemetry'
  | 'roles'
  | 'accounts'
  | 'auth'
  | 'sessions'
  | 'keys'
  | 'limits';

export interface AdminTab {
  id: AdminTabId;
  label: string;
}

export interface AdminCategory {
  id: AdminCategoryId;
  label: string;
  icon: 'info' | 'sliders' | 'ruler' | 'palette' | 'database' | 'share' | 'route' | 'scale' | 'lock' | 'clock' | 'bell' | 'plug' | 'users' | 'shield' | 'key';
  tab: AdminTabId;
}

export const adminTabs: AdminTab[] = [
  { id: 'general', label: 'General' },
  { id: 'routes', label: 'Rutas y Optimización' },
  { id: 'collection', label: 'Recolección' },
  { id: 'notifications', label: 'Notificaciones' },
  { id: 'integrations', label: 'Integraciones' },
  { id: 'users', label: 'Usuarios y Roles' },
  { id: 'security', label: 'Seguridad' },
  { id: 'api', label: 'API' },
];

export const adminCategories: AdminCategory[] = [
  { id: 'info', label: 'Información general', icon: 'info', tab: 'general' },
  { id: 'params', label: 'Parámetros del sistema', icon: 'sliders', tab: 'general' },
  { id: 'units', label: 'Unidades y medidas', icon: 'ruler', tab: 'general' },
  { id: 'personalization', label: 'Personalización', icon: 'palette', tab: 'general' },
  { id: 'backup', label: 'Respaldo y restauración', icon: 'database', tab: 'general' },
  { id: 'import-export', label: 'Importar / Exportar datos', icon: 'share', tab: 'general' },

  { id: 'algorithm', label: 'Algoritmo de rutas', icon: 'route', tab: 'routes' },
  { id: 'weights', label: 'Pesos y prioridades', icon: 'scale', tab: 'routes' },
  { id: 'constraints', label: 'Restricciones', icon: 'lock', tab: 'routes' },

  { id: 'schedules', label: 'Horarios operativos', icon: 'clock', tab: 'collection' },
  { id: 'thresholds', label: 'Umbrales de llenado', icon: 'sliders', tab: 'collection' },

  { id: 'channels', label: 'Canales', icon: 'bell', tab: 'notifications' },
  { id: 'alerts-cfg', label: 'Alertas automáticas', icon: 'bell', tab: 'notifications' },

  { id: 'gis', label: 'GIS / Mapas', icon: 'plug', tab: 'integrations' },
  { id: 'telemetry', label: 'Telemetría', icon: 'plug', tab: 'integrations' },

  { id: 'roles', label: 'Roles y permisos', icon: 'users', tab: 'users' },
  { id: 'accounts', label: 'Cuentas', icon: 'users', tab: 'users' },

  { id: 'auth', label: 'Autenticación', icon: 'shield', tab: 'security' },
  { id: 'sessions', label: 'Sesiones', icon: 'lock', tab: 'security' },

  { id: 'keys', label: 'Claves de API', icon: 'key', tab: 'api' },
  { id: 'limits', label: 'Límites y cuotas', icon: 'sliders', tab: 'api' },
];

export const languageOptions = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
  { value: 'pt', label: 'Português' },
];

export const timezoneOptions = [
  { value: 'America/Caracas', label: '(UTC-04:00) Caracas' },
  { value: 'America/Bogota', label: '(UTC-05:00) Bogotá' },
  { value: 'America/Mexico_City', label: '(UTC-06:00) Ciudad de México' },
];

export const dateFormatOptions = [
  { value: 'dd/mm/yyyy', label: 'dd/mm/yyyy' },
  { value: 'mm/dd/yyyy', label: 'mm/dd/yyyy' },
  { value: 'yyyy-mm-dd', label: 'yyyy-mm-dd' },
];

export const refreshOptions = [
  { value: '10', label: '10 segundos' },
  { value: '30', label: '30 segundos' },
  { value: '60', label: '1 minuto' },
  { value: '300', label: '5 minutos' },
];

export const idleOptions = [
  { value: '5', label: '5 minutos' },
  { value: '15', label: '15 minutos' },
  { value: '30', label: '30 minutos' },
  { value: '60', label: '1 hora' },
];

export const distanceUnitOptions = [
  { value: 'km', label: 'Kilómetros (km)' },
  { value: 'mi', label: 'Millas (mi)' },
];

export const volumeUnitOptions = [
  { value: 'm3', label: 'Metros cúbicos (m³)' },
  { value: 'l', label: 'Litros (L)' },
];

export const weightUnitOptions = [
  { value: 't', label: 'Toneladas (t)' },
  { value: 'kg', label: 'Kilogramos (kg)' },
];

export const timeUnitOptions = [
  { value: 'min', label: 'Minutos' },
  { value: 'h', label: 'Horas' },
];

export const themeOptions = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
];

export const backupFrequencyOptions = [
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
];

export const exportFormatOptions = [
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
  { value: 'xlsx', label: 'Excel (XLSX)' },
];

export const algorithmOptions = [
  { value: 'vrp', label: 'VRP clásico' },
  { value: 'genetic', label: 'Algoritmo genético' },
  { value: 'hybrid', label: 'Híbrido (recomendado)' },
];

export const fillThresholdOptions = [
  { value: '70', label: '70%' },
  { value: '80', label: '80%' },
  { value: '90', label: '90%' },
];

export const sessionTimeoutOptions = [
  { value: '30', label: '30 minutos' },
  { value: '60', label: '1 hora' },
  { value: '480', label: '8 horas' },
];

export const rateLimitOptions = [
  { value: '100', label: '100 req/min' },
  { value: '500', label: '500 req/min' },
  { value: '1000', label: '1000 req/min' },
];

export const defaultAdminSettings = {
  systemName: 'FEROMAP - Sistema Inteligente de Recolección de Residuos',
  language: 'es',
  timezone: 'America/Caracas',
  dateFormat: 'dd/mm/yyyy',
  refreshSeconds: '30',
  maxLoadTons: '25',
  idleMinutes: '15',
  defaultSpeed: '30',
  maxAssignDistance: '5',
  autoRecalcRoutes: true,
  distanceUnit: 'km',
  volumeUnit: 'm3',
  weightUnit: 't',
  timeUnit: 'min',
  theme: 'system',
  accentColor: '#1143F3',
  backupFrequency: 'daily',
  lastBackup: '24 de junio, 2026 — 02:00',
  exportFormat: 'csv',
  algorithm: 'hybrid',
  timeWeight: '40',
  distanceWeight: '35',
  fillWeight: '25',
  maxStops: '45',
  avoidTolls: true,
  workStart: '06:00',
  workEnd: '18:00',
  fillThreshold: '80',
  emailNotifications: true,
  pushNotifications: true,
  smsCritical: true,
  autoEscalate: true,
  mapProvider: 'OpenStreetMap',
  telemetryInterval: '30',
  require2fa: false,
  sessionTimeout: '60',
  apiKeyMasked: 'fero_live_••••••••••••9a2c',
  rateLimit: '500',
};
