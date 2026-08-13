import type { UserRole } from '../types/auth';

export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  '/': ['administrador', 'planificador', 'conductor', 'residente'],
  '/operator': ['administrador', 'planificador', 'conductor'],
  '/operator/plan': ['administrador', 'planificador', 'conductor'],
  '/optimization': ['administrador', 'planificador'],
  '/planning': ['administrador', 'planificador'],
  '/planning/history': ['administrador', 'planificador'],
  '/map': ['administrador', 'planificador', 'conductor', 'residente'],
  '/vehicles': ['administrador', 'planificador'],
  '/drivers': ['administrador', 'planificador'],
  '/collection-points': ['administrador', 'planificador', 'residente'],
  '/simulation': ['administrador', 'planificador'],
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
  const allowed = ROUTE_PERMISSIONS[path];
  if (!allowed) return true;
  return allowed.includes(role);
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
  /** Muestra un encabezado de sección antes de este ítem */
  sectionBefore?: string;
}

export const MAIN_NAV_ITEMS: NavItemDef[] = [
  { href: '/', label: 'Dashboard', roles: ['administrador', 'planificador', 'conductor'] },
  {
    href: '/simulation',
    label: 'Simulación de escenarios',
    description: 'Tesis — evaluar algoritmo ACO',
    sectionBefore: 'Investigación',
    roles: ['administrador', 'planificador'],
  },
  { href: '/map', label: 'Mapa GIS', roles: ['administrador', 'planificador', 'conductor'] },
  { href: '/vehicles', label: 'Vehículos', roles: ['administrador', 'planificador'] },
  { href: '/drivers', label: 'Conductores', roles: ['administrador', 'planificador'] },
  {
    href: '/collection-points',
    label: 'Puntos de Recolección',
    roles: ['administrador', 'planificador'],
  },
  {
    href: '/monitoring',
    label: 'Monitoreo en Tiempo Real',
    description: 'Monitoreo en caliente',
    roles: ['administrador', 'planificador', 'conductor'],
  },
  {
    href: '/planning',
    label: 'Hub de planificación',
    description: 'Tu operación del día',
    sectionBefore: 'Operación',
    roles: ['administrador', 'planificador'],
  },
  {
    href: '/optimization',
    label: 'Planificación operativa',
    description: 'Día a día — optimizar y despachar',
    roles: ['administrador', 'planificador'],
  },
  {
    href: '/planning/history',
    label: 'Historial de planificación',
    description: 'Semana, día e incidencias',
    roles: ['administrador', 'planificador'],
  },
  {
    href: '/reports',
    label: 'Reportes',
    sectionBefore: 'Resultados',
    roles: ['administrador', 'planificador'],
  },
  { href: '/analytics', label: 'Analítica', roles: ['administrador', 'planificador'] },
  { href: '/alerts', label: 'Alertas', roles: ['administrador', 'planificador', 'conductor'] },
];

/** Nav lateral reducida para residentes (vista ciudadano). */
export const RESIDENT_MAIN_NAV_ITEMS: NavItemDef[] = [
  {
    href: '/resident',
    label: 'Mi Recolección',
    description: 'Horario y estado en tu sector',
    sectionBefore: 'Mi zona',
    roles: ['residente'],
  },
  {
    href: '/map?scope=sector',
    label: 'Mapa mi sector',
    description: 'Camión y contenedores',
    roles: ['residente'],
  },
  {
    href: '/collection-points',
    label: 'Puntos de recolección',
    description: 'Contenedores de tu barrio',
    roles: ['residente'],
  },
  {
    href: '/alerts?scope=sector',
    label: 'Alertas',
    description: 'Avisos de tu sector',
    roles: ['residente'],
  },
];

/** Nav lateral reducida para conductores en campo. */
export const OPERATOR_MAIN_NAV_ITEMS: NavItemDef[] = [
  { href: '/', label: 'Dashboard', roles: ['conductor'] },
  {
    href: '/operator',
    label: 'Mi operación',
    description: 'Tu ruta en campo',
    sectionBefore: 'Campo',
    roles: ['conductor'],
  },
  { href: '/map', label: 'Mapa GIS', roles: ['conductor'] },
  { href: '/alerts', label: 'Alertas', roles: ['conductor'] },
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
    main: MAIN_NAV_ITEMS.filter((item) => item.roles.includes(role)),
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
