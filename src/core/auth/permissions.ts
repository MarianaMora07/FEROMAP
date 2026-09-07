import type { UserRole } from '../types/auth';

export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  '/': ['administrador', 'planificador', 'conductor', 'residente'],
  '/operator': ['administrador', 'planificador', 'conductor'],
  '/operator/plan': ['administrador', 'planificador', 'conductor'],
  '/optimization': ['administrador', 'planificador'],
  '/planning': ['administrador', 'planificador'],
  '/planning/weekly': ['administrador', 'planificador'],
  '/planning/history': ['administrador', 'planificador'],
  '/map': ['administrador', 'planificador', 'conductor', 'residente'],
  '/vehicles': ['administrador', 'planificador'],
  '/drivers': ['administrador', 'planificador'],
  '/collection-points': ['administrador', 'planificador', 'residente'],
  '/case-studies': ['administrador', 'planificador'],
  '/simulation': ['administrador', 'planificador'],
  '/demostracion': ['administrador', 'planificador'],
  '/monitoring': ['administrador', 'planificador', 'conductor'],
  '/analytics': ['administrador', 'planificador'],
  '/reports': ['administrador', 'planificador'],
  '/resident': ['residente'],
  '/alerts': ['administrador', 'planificador', 'conductor', 'residente'],
  '/admin': ['administrador'],
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
  /** Texto secundario bajo la etiqueta en el menú lateral */
  description?: string;
  /** Enlace visible siempre en la parte superior del sidebar */
  sidebarPrimary?: boolean;
  /** Clasificación demo/producto mostrada como badge solo para admin (docs/ux §3) */
  kind?: 'demo' | 'producto';
}

export const DEMO_NAV_HIDDEN_HREFS = new Set<string>(['/analytics']);

/**
 * Grupos colapsables del sidebar (admin/planificador).
 * Fuente de verdad de la IA: docs/ux/arquitectura-navegacion.md §3.
 * Orden de los primarios = ciclo planificar → operar → supervisar.
 */
export const SIDEBAR_SECTION_GROUPS: Record<string, readonly string[]> = {
  'Consulta y reportes': ['/planning/history', '/reports'],
  Catálogos: ['/vehicles', '/drivers', '/collection-points'],
  'Tesis y demostración': ['/simulation', '/case-studies', '/demostracion'],
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
  { href: '/', label: 'Dashboard', sidebarPrimary: true, roles: ['administrador', 'planificador', 'conductor'] },
  {
    href: '/planning/weekly',
    label: 'Plan semanal',
    description: 'Directivo — configura, valida y aprueba la semana',
    sidebarPrimary: true,
    roles: ['administrador', 'planificador'],
  },
  {
    href: '/optimization',
    label: 'Plan del día',
    description: 'Optimiza, simula y despacha la jornada',
    sidebarPrimary: true,
    roles: ['administrador', 'planificador'],
  },
  {
    href: '/monitoring',
    label: 'Monitoreo en vivo',
    description: 'Flota, rutas e incidencias en tiempo real',
    sidebarPrimary: true,
    roles: ['administrador', 'planificador', 'conductor'],
  },
  { href: '/map', label: 'Mapa GIS', sidebarPrimary: true, roles: ['administrador', 'planificador', 'conductor'] },
  {
    href: '/planning/history',
    label: 'Historial unificado',
    description: 'Semana, día e incidencias',
    roles: ['administrador', 'planificador'],
  },
  { href: '/reports', label: 'Reportes', roles: ['administrador', 'planificador'] },
  { href: '/vehicles', label: 'Vehículos', roles: ['administrador', 'planificador'] },
  { href: '/drivers', label: 'Conductores', roles: ['administrador', 'planificador'] },
  {
    href: '/collection-points',
    label: 'Puntos de Recolección',
    roles: ['administrador', 'planificador'],
  },
  {
    href: '/simulation',
    label: 'Simulación ACO',
    description: 'Baseline vs ACO — escenario normal',
    kind: 'demo',
    roles: ['administrador', 'planificador'],
  },
  {
    href: '/case-studies',
    label: 'Casos de estudio',
    description: 'Subconjuntos aislados para la tesis',
    kind: 'demo',
    roles: ['administrador', 'planificador'],
  },
  {
    href: '/demostracion',
    label: 'Demostración ACO',
    description: 'Convergencia del algoritmo (~2 min)',
    kind: 'demo',
    roles: ['administrador', 'planificador'],
  },
];

/** Nav lateral reducida para residentes (vista ciudadano). */
export const RESIDENT_MAIN_NAV_ITEMS: NavItemDef[] = [
  {
    href: '/resident',
    label: 'Mi Recolección',
    description: 'Horario y estado en tu sector',
    sidebarPrimary: true,
    roles: ['residente'],
  },
  {
    href: '/map?scope=sector',
    label: 'Mapa mi sector',
    description: 'Camión y contenedores',
    sidebarPrimary: true,
    roles: ['residente'],
  },
  {
    href: '/collection-points',
    label: 'Puntos de recolección',
    description: 'Contenedores de tu barrio',
    sidebarPrimary: true,
    roles: ['residente'],
  },
  {
    href: '/alerts?scope=sector',
    label: 'Alertas',
    description: 'Avisos de tu sector',
    sidebarPrimary: true,
    roles: ['residente'],
  },
];

/** Nav lateral reducida para conductores en campo. */
export const OPERATOR_MAIN_NAV_ITEMS: NavItemDef[] = [
  { href: '/', label: 'Dashboard', sidebarPrimary: true, roles: ['conductor'] },
  {
    href: '/operator',
    label: 'Mi operación',
    description: 'Tu ruta en campo',
    sidebarPrimary: true,
    roles: ['conductor'],
  },
  { href: '/map', label: 'Mapa GIS', sidebarPrimary: true, roles: ['conductor'] },
  { href: '/alerts', label: 'Alertas', sidebarPrimary: true, roles: ['conductor'] },
];

export const BOTTOM_NAV_ITEMS: NavItemDef[] = [
  { href: '/admin', label: 'Administración', roles: ['administrador'] },
  { href: '/profile', label: 'Perfil', roles: ['administrador', 'planificador', 'conductor', 'residente'] },
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
  return normalized === '/operator' || normalized === '/monitoring';
}

export function canOptimize(role: UserRole | undefined): boolean {
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
