import type { UserRole } from '../types/auth';

export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  '/': ['administrador', 'planificador', 'conductor', 'residente'],
  '/optimization': ['administrador', 'planificador'],
  '/map': ['administrador', 'planificador', 'conductor', 'residente'],
  '/vehicles': ['administrador', 'planificador'],
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
  conductor: '/monitoring',
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
}

export const MAIN_NAV_ITEMS: NavItemDef[] = [
  { href: '/', label: 'Dashboard', roles: ['administrador', 'planificador', 'conductor', 'residente'] },
  { href: '/optimization', label: 'Optimización de Rutas', roles: ['administrador', 'planificador'] },
  { href: '/map', label: 'Mapa GIS', roles: ['administrador', 'planificador', 'conductor', 'residente'] },
  { href: '/vehicles', label: 'Vehículos', roles: ['administrador', 'planificador'] },
  { href: '/collection-points', label: 'Puntos de Recolección', roles: ['administrador', 'planificador', 'residente'] },
  { href: '/resident', label: 'Mi Recolección', roles: ['residente'] },
  { href: '/simulation', label: 'Simulación', roles: ['administrador', 'planificador'] },
  { href: '/monitoring', label: 'Monitoreo en Tiempo Real', roles: ['administrador', 'planificador', 'conductor'] },
  { href: '/reports', label: 'Reportes', roles: ['administrador', 'planificador'] },
  { href: '/analytics', label: 'Analítica', roles: ['administrador', 'planificador'] },
  { href: '/alerts', label: 'Alertas', roles: ['administrador', 'planificador', 'conductor', 'residente'] },
];

export const BOTTOM_NAV_ITEMS: NavItemDef[] = [
  { href: '/admin', label: 'Administración', roles: ['administrador'] },
  { href: '/profile', label: 'Perfil', roles: ['administrador', 'planificador', 'conductor', 'residente'] },
];

export function navItemsForRole(role: UserRole | undefined) {
  if (!role) return { main: [], bottom: [] };
  return {
    main: MAIN_NAV_ITEMS.filter((item) => item.roles.includes(role)),
    bottom: BOTTOM_NAV_ITEMS.filter((item) => item.roles.includes(role)),
  };
}

export function canOptimize(role: UserRole | undefined): boolean {
  return role === 'administrador' || role === 'planificador';
}

export function canAdvanceFleet(role: UserRole | undefined): boolean {
  return role === 'administrador' || role === 'planificador' || role === 'conductor';
}

export function canReportBreakdown(role: UserRole | undefined): boolean {
  return role === 'administrador' || role === 'planificador' || role === 'conductor';
}
