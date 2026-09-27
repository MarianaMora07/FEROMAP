import type { AuthUser } from '../types/auth';
import type {
  ResidentActiveRoute,
  ResidentOverview,
  ResidentProximity,
  ResidentProximityStatus,
  ResidentSchedule,
} from '../api/resident';

export interface ResidentGlossaryTerm {
  id: string;
  label: string;
  definition: string;
  toneClass: string;
  titleClass: string;
}

export const RESIDENT_GLOSSARY: ResidentGlossaryTerm[] = [
  {
    id: 'sector',
    label: 'Sector',
    definition: 'Zona de recolección asignada a tu domicilio',
    toneClass: 'border-fero-blue/30 bg-fero-blue/10',
    titleClass: 'text-fero-blue',
  },
  {
    id: 'window',
    label: 'Ventana horaria',
    definition: 'Franja del día en la que pasa el camión por tu barrio',
    toneClass: 'border-amber-300/60 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/20',
    titleClass: 'text-amber-800 dark:text-amber-200',
  },
  {
    id: 'truck',
    label: 'Camión en camino',
    definition: 'Vehículo de recolección activo que atiende tu sector hoy',
    toneClass: 'border-fero-green/40 bg-fero-green/10',
    titleClass: 'text-fero-green-dark',
  },
  {
    id: 'critical',
    label: 'Contenedor crítico',
    definition: 'Punto con nivel de llenado alto (≥ 80 %) en tu sector',
    toneClass: 'border-red-300/50 bg-red-50/80 dark:border-red-900/40 dark:bg-red-950/20',
    titleClass: 'text-red-700 dark:text-red-300',
  },
];

export type ResidentServicePhase =
  | 'no_sector'
  | 'approaching'
  | 'in_sector'
  | 'completed_today'
  | 'no_active_route';

export interface ResidentFieldContext {
  hasSector: boolean;
  sectorName: string;
  phase: ResidentServicePhase;
  proximityStatus: ResidentProximityStatus;
  primaryRoute: ResidentActiveRoute | null;
  proximity: ResidentProximity | null;
  isWithinWindow: boolean;
  schedule: ResidentSchedule;
  stats: ResidentOverview['stats'];
  estimatedMinutes: number | null;
}

export function phaseFromProximity(status: ResidentProximityStatus): ResidentServicePhase {
  switch (status) {
    case 'approaching':
      return 'approaching';
    case 'in_sector':
      return 'in_sector';
    case 'completed':
      return 'completed_today';
    default:
      return 'no_active_route';
  }
}

export function parseCollectionWindow(window: string): { startMinutes: number; endMinutes: number } | null {
  const match = window.match(/(\d{1,2}):(\d{2})\s*[—–-]\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const [, sh, sm, eh, em] = match;
  return {
    startMinutes: Number(sh) * 60 + Number(sm),
    endMinutes: Number(eh) * 60 + Number(em),
  };
}

export function isWithinCollectionWindow(
  window: string,
  now: Date = new Date(),
): boolean {
  const parsed = parseCollectionWindow(window);
  if (!parsed) return true;
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= parsed.startMinutes && current <= parsed.endMinutes;
}

export function primaryActiveRoute(
  routes: ResidentActiveRoute[],
): ResidentActiveRoute | null {
  return (
    routes.find((route) => route.status === 'in_progress') ??
    routes.find((route) => route.status === 'pending') ??
    routes[0] ??
    null
  );
}

function resolveServicePhaseFromRoutes(
  routes: ResidentActiveRoute[],
): Exclude<ResidentServicePhase, 'no_sector' | 'completed_today'> {
  const route = primaryActiveRoute(routes);
  if (!route) return 'no_active_route';
  if (route.status === 'in_progress') {
    const completedInSector = route.stopsInSector - route.pendingStops;
    if (completedInSector > 0 && route.pendingStops > 0) return 'in_sector';
    if (route.pendingStops > 0) return 'approaching';
  }
  if (route.status === 'pending' && route.pendingStops > 0) return 'approaching';
  return 'no_active_route';
}

export function deriveResidentFieldContext(params: {
  overview: ResidentOverview | null | undefined;
  user: AuthUser | null | undefined;
  now?: Date;
}): ResidentFieldContext {
  const user = params.user;
  const overview = params.overview;
  const proximity = overview?.proximity ?? null;
  const hasSector = user?.sectorId != null && Boolean(overview?.sectorName);
  const schedule = overview?.schedule ?? {
    collectionDays: '—',
    window: '07:00 — 12:00',
    nextCollection: '—',
    nextCollectionAt: null,
    frequency: '—',
    isCollectionDay: false,
    hasWeeklyPlan: false,
    hasSchedule: false,
    source: 'none' as const,
    calendar: [],
  };
  const stats = overview?.stats ?? {
    totalPoints: 0,
    criticalPoints: 0,
    routesServingSector: 0,
  };
  const routes = overview?.activeRoutesInSector ?? [];
  const primaryRoute = primaryActiveRoute(routes);
  const proximityStatus = proximity?.status ?? 'no_active_route';
  const phase: ResidentServicePhase = !hasSector
    ? 'no_sector'
    : proximity
      ? phaseFromProximity(proximity.status)
      : resolveServicePhaseFromRoutes(routes);
  const estimatedMinutes =
    proximity?.estimatedMinutes ??
    (primaryRoute && (phase === 'approaching' || phase === 'in_sector')
      ? Math.max(5, (proximity?.stopsBeforeSector ?? 0) * 5 + 5)
      : null);

  return {
    hasSector,
    sectorName: overview?.sectorName ?? user?.sectorName ?? '—',
    phase,
    proximityStatus,
    primaryRoute,
    proximity,
    isWithinWindow: isWithinCollectionWindow(schedule.window, params.now),
    schedule,
    stats,
    estimatedMinutes,
  };
}
