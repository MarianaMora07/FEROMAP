import type { UserRole } from '../types/auth';

/**
 * Ruta de la consola de calibración del motor (Fase 13 · decisión D-C).
 * Se centraliza aquí para poder moverla sin tocar componentes; hereda los
 * permisos de `/settings` por la regla de prefijo de `canAccessRoute`.
 */
export const CALIBRATION_ROUTE = '/settings/calibration';

/**
 * Página de evidencias de la evaluación (`/evidence`): comparativa, validación
 * estadística y casos de estudio del capítulo de resultados. Es hermana de
 * Configuración en el sidebar (no cuelga de `/settings`).
 */
export const EVIDENCE_ROUTE = '/evidence';

export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  '/': ['administrador', 'planificador', 'conductor', 'residente'],
  '/operator': ['administrador', 'planificador', 'conductor'],
  '/operator/plan': ['administrador', 'planificador', 'conductor'],
  '/operator/notifications': ['administrador', 'planificador', 'conductor'],
  '/operator/week': ['administrador', 'planificador', 'conductor'],
  '/optimization': ['administrador', 'planificador'],
  '/planning': ['administrador', 'planificador'],
  '/planning/weekly': ['administrador', 'planificador'],
  '/planning/weeks': ['administrador', 'planificador'],
  '/planning/history': ['administrador', 'planificador'],
  '/map': ['administrador', 'planificador', 'conductor', 'residente'],
  '/vehicles': ['administrador', 'planificador'],
  '/drivers': ['administrador', 'planificador'],
  '/collection-points': ['administrador', 'planificador', 'residente'],
  '/case-studies': ['administrador', 'planificador'],
  '/simulation': ['administrador', 'planificador'],
  '/demostracion': ['administrador', 'planificador'],
  '/monitoring': ['administrador', 'planificador'],
  '/analytics': ['administrador', 'planificador'],
  '/reports': ['administrador', 'planificador'],
  '/resident': ['residente'],
  '/alerts': ['administrador', 'planificador', 'conductor', 'residente'],
  '/admin': ['administrador'],
  '/settings': ['administrador', 'planificador'],
  [CALIBRATION_ROUTE]: ['administrador', 'planificador'],
  [EVIDENCE_ROUTE]: ['administrador', 'planificador'],
  '/profile': ['administrador', 'planificador', 'conductor', 'residente'],
};

export const DEFAULT_HOME_BY_ROLE: Record<UserRole, string> = {
  administrador: '/',
  planificador: '/',
  conductor: '/operator',
  residente: '/resident',
};

export function canAccessRoute(role: UserRole | undefined, path: string): boolean {
  if (!role) return false;
  const normalized = path.split('?')[0] ?? path;
  const allowed = ROUTE_PERMISSIONS[normalized];
  if (allowed) return allowed.includes(role);
  for (const [route, roles] of Object.entries(ROUTE_PERMISSIONS)) {
    if (route !== '/' && normalized.startsWith(`${route}/`)) {
      return roles.includes(role);
    }
  }
  return true;
}

export function homePathForRole(role: UserRole): string {
  return DEFAULT_HOME_BY_ROLE[role] ?? '/';
}

export interface NavItemDef {
  href: string;
  label: string;
  roles: UserRole[];
  /** Clave i18n de la etiqueta; `label` es el respaldo en español (F8). */
  labelKey?: string;
  /** Texto secundario bajo la etiqueta en el menú lateral */
  description?: string;
  /** Clave i18n de la descripción; `description` es el respaldo (F8). */
  descriptionKey?: string;
  /** Enlace visible siempre en la parte superior del sidebar */
  sidebarPrimary?: boolean;
  /** Clasificación demo/producto mostrada como badge solo para admin (docs/ux §3) */
  kind?: 'demo' | 'producto';
}

/**
 * Destinos ocultos del menú lateral (admin/planificador).
 *
 * Los módulos de tesis/demostración siguen definidos y accesibles por URL directa, pero no
 * se listan en el sidebar para no mezclar el andamiaje de evaluación con la operación
 * diaria. Vaciar el set los vuelve a mostrar.
 */
export const DEMO_NAV_HIDDEN_HREFS = new Set<string>([
  '/simulation',
  '/case-studies',
  '/demostracion',
]);

/**
 * Grupos colapsables del sidebar (admin/planificador).
 * Fuente de verdad de la IA: docs/ux/arquitectura-navegacion.md §3.
 * Orden de los primarios = ciclo planificar → operar → supervisar.
 */
export const SIDEBAR_SECTION_GROUPS: Record<string, readonly string[]> = {
  'Consulta y reportes': ['/planning/history', '/reports', '/analytics'],
  Catálogos: ['/vehicles', '/drivers', '/collection-points'],
  'Tesis y demostración': ['/simulation', '/case-studies', '/demostracion'],
};

/** Clave i18n de cada sección del sidebar (la clave del mapa sigue siendo la ES). */
export const SIDEBAR_SECTION_LABEL_KEYS: Record<string, string> = {
  'Consulta y reportes': 'sections.consulta',
  Catálogos: 'sections.catalogos',
  'Tesis y demostración': 'sections.tesis',
};

export interface SidebarNavSection {
  label: string;
  items: NavItemDef[];
}

export function sidebarNavLayout(role: UserRole | undefined): {
  primary: NavItemDef[];
  sections: SidebarNavSection[];
} {
  const { main } = navItemsForRole(role);

  return {
    primary: main.filter((item) => item.sidebarPrimary),
    sections: Object.entries(SIDEBAR_SECTION_GROUPS)
      .map(([label, hrefs]) => ({
        label,
        items: main.filter((item) => hrefs.includes(item.href)),
      }))
      .filter((section) => section.items.length > 0),
  };
}

export const MAIN_NAV_ITEMS: NavItemDef[] = [
  {
    href: '/',
    label: 'Dashboard',
    labelKey: 'nav.dashboard',
    sidebarPrimary: true,
    roles: ['administrador', 'planificador', 'conductor'],
  },
  {
    href: '/planning/weeks',
    label: 'Planes semanales',
    labelKey: 'nav.weeklyPlans',
    description: 'Semanas: estado, flota y exportación',
    descriptionKey: 'nav.weeklyPlans.description',
    sidebarPrimary: true,
    roles: ['administrador', 'planificador'],
  },
  {
    href: '/optimization',
    label: 'Plan del día',
    labelKey: 'nav.day',
    description: 'Optimiza, simula y despacha la jornada',
    descriptionKey: 'nav.day.description',
    sidebarPrimary: true,
    roles: ['administrador', 'planificador'],
  },
  {
    href: '/monitoring',
    label: 'Monitoreo',
    labelKey: 'nav.monitoring',
    description: 'Flota, rutas e incidencias del día',
    descriptionKey: 'nav.monitoring.description',
    sidebarPrimary: true,
    roles: ['administrador', 'planificador'],
  },
  {
    href: '/map',
    label: 'Mapa GIS',
    labelKey: 'nav.map',
    sidebarPrimary: true,
    roles: ['administrador', 'planificador', 'conductor'],
  },
  {
    href: '/planning/history',
    label: 'Historial unificado',
    labelKey: 'nav.history',
    description: 'Semana, día e incidencias',
    descriptionKey: 'nav.history.description',
    roles: ['administrador', 'planificador'],
  },
  { href: '/reports', label: 'Reportes', labelKey: 'nav.reports', roles: ['administrador', 'planificador'] },
  {
    href: '/analytics',
    label: 'Analítica',
    labelKey: 'nav.analytics',
    description: 'KPIs agregados del histórico operativo',
    descriptionKey: 'nav.analytics.description',
    roles: ['administrador', 'planificador'],
  },
  { href: '/vehicles', label: 'Vehículos', labelKey: 'nav.vehicles', roles: ['administrador', 'planificador'] },
  { href: '/drivers', label: 'Conductores', labelKey: 'nav.drivers', roles: ['administrador', 'planificador'] },
  {
    href: '/collection-points',
    label: 'Puntos de Recolección',
    labelKey: 'nav.collectionPoints',
    roles: ['administrador', 'planificador'],
  },
  {
    href: '/simulation',
    label: 'Simulación ACO (tesis)',
    labelKey: 'nav.simulation',
    description: 'Baseline vs ACO — escenario normal',
    descriptionKey: 'nav.simulation.description',
    kind: 'demo',
    roles: ['administrador', 'planificador'],
  },
  {
    href: '/case-studies',
    label: 'Casos de estudio',
    labelKey: 'nav.caseStudies',
    description: 'Subconjuntos aislados para la tesis',
    descriptionKey: 'nav.caseStudies.description',
    kind: 'demo',
    roles: ['administrador', 'planificador'],
  },
  {
    href: '/demostracion',
    label: 'Demostración ACO',
    labelKey: 'nav.demostracion',
    description: 'Convergencia del algoritmo (~2 min)',
    descriptionKey: 'nav.demostracion.description',
    kind: 'demo',
    roles: ['administrador', 'planificador'],
  },
  {
    href: '/settings',
    label: 'Configuración',
    labelKey: 'nav.settings',
    // La consola de calibración es una sección de Configuración (D-C), no un
    // destino propio: el ítem queda activo en todo `/settings/*`.
    description: 'Parámetros del motor, calibración y preferencias',
    descriptionKey: 'nav.settings.description',
    sidebarPrimary: true,
    roles: ['administrador', 'planificador'],
  },
  {
    href: EVIDENCE_ROUTE,
    label: 'Evidencias',
    labelKey: 'nav.evidence',
    description: 'Comparativa, validación y casos del capítulo',
    descriptionKey: 'nav.evidence.description',
    sidebarPrimary: true,
    roles: ['administrador', 'planificador'],
  },
];

/** Nav lateral reducida para residentes (vista ciudadano). */
export const RESIDENT_MAIN_NAV_ITEMS: NavItemDef[] = [
  {
    href: '/resident',
    label: 'Mi Recolección',
    labelKey: 'nav.residentHome',
    description: 'Horario y estado en tu sector',
    descriptionKey: 'nav.residentHome.description',
    sidebarPrimary: true,
    roles: ['residente'],
  },
  {
    href: '/map?scope=sector',
    label: 'Mapa mi sector',
    labelKey: 'nav.residentMap',
    description: 'Camión y contenedores',
    descriptionKey: 'nav.residentMap.description',
    sidebarPrimary: true,
    roles: ['residente'],
  },
  {
    href: '/collection-points',
    label: 'Puntos de recolección',
    labelKey: 'nav.residentPoints',
    description: 'Contenedores de tu barrio',
    descriptionKey: 'nav.residentPoints.description',
    sidebarPrimary: true,
    roles: ['residente'],
  },
  {
    href: '/alerts?scope=sector',
    label: 'Alertas',
    labelKey: 'nav.alerts',
    description: 'Avisos de tu sector',
    descriptionKey: 'nav.alerts.description',
    sidebarPrimary: true,
    roles: ['residente'],
  },
];

/** Nav lateral reducida para conductores en campo. */
export const OPERATOR_MAIN_NAV_ITEMS: NavItemDef[] = [
  {
    href: '/operator',
    label: 'Mi operación',
    labelKey: 'nav.operatorHome',
    description: 'Tu ruta en campo',
    descriptionKey: 'nav.operatorHome.description',
    sidebarPrimary: true,
    roles: ['conductor'],
  },
  { href: '/', label: 'Dashboard', labelKey: 'nav.dashboard', sidebarPrimary: true, roles: ['conductor'] },
  {
    href: '/operator/notifications',
    label: 'Notificaciones',
    labelKey: 'nav.notifications',
    description: 'Avisos y acuses',
    descriptionKey: 'nav.notifications.description',
    sidebarPrimary: true,
    roles: ['conductor'],
  },
  {
    href: '/operator/week',
    label: 'Mi semana',
    labelKey: 'nav.operatorWeek',
    description: 'Días y frecuencias',
    descriptionKey: 'nav.operatorWeek.description',
    sidebarPrimary: true,
    roles: ['conductor'],
  },
  { href: '/map', label: 'Mapa GIS', labelKey: 'nav.map', sidebarPrimary: true, roles: ['conductor'] },
  { href: '/alerts', label: 'Alertas', labelKey: 'nav.alerts', sidebarPrimary: true, roles: ['conductor'] },
];

export const BOTTOM_NAV_ITEMS: NavItemDef[] = [
  { href: '/admin', label: 'Administración', labelKey: 'nav.admin', roles: ['administrador'] },
  {
    href: '/profile',
    label: 'Perfil',
    labelKey: 'nav.profile',
    roles: ['administrador', 'planificador', 'conductor', 'residente'],
  },
];

/** Bottom nav fijo para conductor en campo (móvil). */
export const CONDUCTOR_BOTTOM_NAV_ITEMS: NavItemDef[] = [
  { href: '/operator', label: 'Ruta', labelKey: 'nav.operatorHome', roles: ['conductor'] },
  { href: '/operator/notifications', label: 'Avisos', labelKey: 'nav.notifications', roles: ['conductor'] },
  { href: '/operator/week', label: 'Semana', labelKey: 'nav.operatorWeek', roles: ['conductor'] },
  { href: '/map', label: 'Mapa', labelKey: 'nav.map', roles: ['conductor'] },
  { href: '/alerts', label: 'Alertas', labelKey: 'nav.alerts', roles: ['conductor'] },
  { href: '/profile', label: 'Perfil', labelKey: 'nav.profile', roles: ['conductor'] },
];

/** Bottom nav móvil para residente (vista ciudadano). */
export const RESIDENT_BOTTOM_NAV_ITEMS: NavItemDef[] = [
  { href: '/resident', label: 'Mi rec.', labelKey: 'nav.residentHome', roles: ['residente'] },
  { href: '/map?scope=sector', label: 'Mapa', labelKey: 'nav.residentMap', roles: ['residente'] },
  { href: '/collection-points', label: 'Puntos', labelKey: 'nav.residentPoints', roles: ['residente'] },
  { href: '/alerts?scope=sector', label: 'Alertas', labelKey: 'nav.alerts', roles: ['residente'] },
  { href: '/profile', label: 'Perfil', labelKey: 'nav.profile', roles: ['residente'] },
];

export function navItemsForRole(role: UserRole | undefined) {
  if (!role) return { main: [], bottom: [] };
  if (isConductor(role)) {
    return {
      main: OPERATOR_MAIN_NAV_ITEMS,
      bottom: BOTTOM_NAV_ITEMS.filter((item) => item.roles.includes(role)),
    };
  }
  if (isResident(role)) {
    return {
      main: RESIDENT_MAIN_NAV_ITEMS,
      bottom: BOTTOM_NAV_ITEMS.filter((item) => item.roles.includes(role)),
    };
  }
  return {
    main: MAIN_NAV_ITEMS.filter(
      (item) => item.roles.includes(role) && !DEMO_NAV_HIDDEN_HREFS.has(item.href),
    ),
    bottom: BOTTOM_NAV_ITEMS.filter((item) => item.roles.includes(role)),
  };
}

export function isConductor(role: UserRole | undefined): boolean {
  return role === 'conductor';
}

export function isResident(role: UserRole | undefined): boolean {
  return role === 'residente';
}

export function isOperatorHome(path: string): boolean {
  const normalized = path.split('?')[0] ?? path;
  return normalized === '/operator' || normalized.startsWith('/operator/');
}

export function canOptimize(role: UserRole | undefined): boolean {
  return role === 'administrador' || role === 'planificador';
}

/** Solo planificación/admin puede crear el plan del día (`POST .../ensure`). */
export function canEnsureDailyPlan(role: UserRole | undefined): boolean {
  return role === 'administrador' || role === 'planificador';
}

export function canManageCollectionPoints(role: UserRole | undefined): boolean {
  return role === 'administrador' || role === 'planificador';
}

export function canManageVehicles(role: UserRole | undefined): boolean {
  return role === 'administrador' || role === 'planificador';
}

export function canAdvanceFleet(role: UserRole | undefined): boolean {
  return role === 'administrador' || role === 'planificador' || role === 'conductor';
}

/** Avance simulado de flota en mapa — solo conductor en campo (y admin en pruebas). */
export function canSimulateFleetAdvance(role: UserRole | undefined): boolean {
  return role === 'conductor' || role === 'administrador';
}

export function isOperationalSupervisor(role: UserRole | undefined): boolean {
  return role === 'administrador' || role === 'planificador';
}

export function canReportBreakdown(role: UserRole | undefined): boolean {
  return role === 'administrador' || role === 'planificador' || role === 'conductor';
}
