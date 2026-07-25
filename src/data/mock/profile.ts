export const profilePageMeta = {
  title: 'Mi Perfil',
  subtitle: 'Gestiona tu información personal y preferencias de cuenta.',
  dateLabel: '25 de junio, 2026',
};

export const profileUser = {
  fullName: 'Mariana Mora',
  username: 'mariana.mora',
  email: 'mariana.mora@feromap.com',
  role: 'Administradora',
  phone: '+58 412-555-0198',
  language: 'es',
  address: 'Av. Principal con Calle Sucre, Torre Feromap, Piso 5 Caracas, Venezuela',
  avatarUrl:
    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=240&h=240&q=80',
  status: 'active' as const,
  registeredAt: '15 de enero de 2024',
  lastAccess: '25/06/2026 10:45 AM',
  ipAddress: '190.12.45.67',
  timezone: '(UTC-04:00) Caracas',
};

export const profileSecurity = {
  twoFactorEnabled: true,
  activeSessions: 3,
  registeredDevices: 2,
};

export const profilePreferencesDefaults = {
  theme: 'light',
  defaultView: 'dashboard',
  reportFrequency: 'daily',
  pageSize: '20',
  emailNotifications: true,
  systemNotifications: true,
};

export const profileRoleOptions = [
  { value: 'Administradora', label: 'Administradora' },
  { value: 'Supervisora', label: 'Supervisora' },
  { value: 'Operadora', label: 'Operadora' },
];

export const profileLanguageOptions = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
  { value: 'pt', label: 'Português' },
];

export const profileThemeOptions = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Sistema' },
];

export const profileDefaultViewOptions = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'monitoring', label: 'Monitoreo' },
  { value: 'map', label: 'Mapa GIS' },
  { value: 'alerts', label: 'Alertas' },
];

export const profileReportFrequencyOptions = [
  { value: 'daily', label: 'Diaria' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
];

export const profilePageSizeOptions = [
  { value: '10', label: '10' },
  { value: '20', label: '20' },
  { value: '50', label: '50' },
];
