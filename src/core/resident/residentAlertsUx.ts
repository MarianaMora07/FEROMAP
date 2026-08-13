import type { SystemAlert, AlertPriority, AlertCategory, AlertStatus } from '../types/alert';
import type { ResidentActiveRoute, ResidentOverview, ResidentProximity } from '../api/resident';
import { UNARE_CENTER } from '../../data/types/geo';

export type ResidentAlertKind = 'horario' | 'retraso' | 'critico' | 'servicio';

export interface ResidentAlertContext {
  sectorName?: string | null;
  activeRoutes?: ResidentActiveRoute[];
  proximity?: ResidentProximity | null;
  vehicleCodes?: string[];
}

export interface ResidentSectorAlert {
  id: string;
  kind: ResidentAlertKind | 'sistema';
  title: string;
  detail: string;
  priority: AlertPriority;
  datetime: string;
  source: string;
  location: string;
  status: AlertStatus;
  category: AlertCategory;
  lng: number;
  lat: number;
  systemAlertId?: string;
}

const INTERNAL_FLEET_PATTERN =
  /planificaci[oó]n|taller central|sincronizaci[oó]n|actualizaci[oó]n de sistema|flota interna|central de operaciones/i;

const KIND_SORT: Record<ResidentSectorAlert['kind'], number> = {
  retraso: 100,
  critico: 95,
  servicio: 70,
  horario: 65,
  sistema: 50,
};

const PRIORITY_SORT: Record<AlertPriority, number> = {
  critica: 3,
  advertencia: 2,
  informativa: 1,
};

export function parseResidentAlertScope(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'sector';
}

export function buildResidentAlertContext(overview: ResidentOverview): ResidentAlertContext {
  const vehicleCodes = [
    overview.proximity?.vehicleCode,
    ...overview.activeRoutesInSector.map((route) => route.vehicle),
  ].filter((code): code is string => Boolean(code));

  return {
    sectorName: overview.sectorName,
    activeRoutes: overview.activeRoutesInSector,
    proximity: overview.proximity,
    vehicleCodes: [...new Set(vehicleCodes)],
  };
}

function normalizeToken(value: string): string {
  return value.trim().toUpperCase().replace(/^CNT-/i, '');
}

function sectorMentioned(alert: SystemAlert, sector: string): boolean {
  const normalized = sector.trim();
  if (!normalized) return false;
  const blob = `${alert.location} ${alert.source} ${alert.detail} ${alert.title}`.toLowerCase();
  return blob.includes(normalized.toLowerCase());
}

function vehicleMentioned(alert: SystemAlert, vehicleCodes: string[]): boolean {
  const blob = `${alert.source} ${alert.detail} ${alert.title}`.toUpperCase();
  return vehicleCodes.some((code) => blob.includes(code.trim().toUpperCase()));
}

export function isInternalFleetAlert(alert: SystemAlert, ctx: ResidentAlertContext): boolean {
  if (alert.category === 'mantenimiento' || alert.category === 'sistema') return true;
  if (INTERNAL_FLEET_PATTERN.test(`${alert.source} ${alert.title} ${alert.detail}`)) return true;
  if (alert.category === 'vehiculos') {
    const sector = ctx.sectorName?.trim();
    const inSector = sector ? sectorMentioned(alert, sector) : false;
    const assigned = vehicleMentioned(alert, ctx.vehicleCodes ?? []);
    return !inSector && !assigned;
  }
  return false;
}

export function scoreResidentAlert(alert: SystemAlert, ctx: ResidentAlertContext): number {
  if (isInternalFleetAlert(alert, ctx)) return 0;

  const sector = ctx.sectorName?.trim();
  if (sector && sectorMentioned(alert, sector)) {
    if (alert.category === 'contenedores') return 92;
    if (alert.category === 'trafico') return 90;
    return 85;
  }

  for (const route of ctx.activeRoutes ?? []) {
    if (vehicleMentioned(alert, [route.vehicle])) {
      if (alert.category === 'trafico') return 88;
      return 82;
    }
    if (route.nextStop) {
      const code = normalizeToken(route.nextStop);
      const blob = `${alert.source} ${alert.detail} ${alert.location}`.toUpperCase();
      if (blob.includes(code) || blob.includes(`CNT-${code}`)) return 78;
    }
  }

  if (alert.category === 'trafico' && alert.detail.toLowerCase().includes('retraso')) return 40;
  return 0;
}

export function filterResidentAlerts(
  alerts: SystemAlert[],
  ctx: ResidentAlertContext,
  minScore = 60,
): SystemAlert[] {
  return alerts
    .map((alert) => ({ alert, score: scoreResidentAlert(alert, ctx) }))
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.alert);
}

function abbreviateCollectionDays(days: string): string {
  const map: Record<string, string> = {
    lunes: 'L',
    martes: 'M',
    miércoles: 'X',
    miercoles: 'X',
    jueves: 'J',
    viernes: 'V',
    sábado: 'S',
    sabado: 'S',
    domingo: 'D',
  };
  const parts = days
    .split(/[,/·]+/)
    .map((part) => map[part.trim().toLowerCase()] ?? part.trim().slice(0, 1).toUpperCase())
    .filter(Boolean);
  return parts.length > 0 ? parts.join('-') : days;
}

function formatWindow(window: string): string {
  return window.replace(/\s*—\s*/g, '–').replace(/\s*-\s*/g, '–');
}

function alertTimestamp(): string {
  return new Date().toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function baseResidentAlert(
  partial: Pick<ResidentSectorAlert, 'id' | 'kind' | 'title' | 'detail' | 'priority'> &
    Partial<ResidentSectorAlert>,
): ResidentSectorAlert {
  return {
    datetime: alertTimestamp(),
    source: 'Tu sector',
    location: partial.location ?? '—',
    status: partial.status ?? 'informativa',
    category: partial.category ?? kindToCategory(partial.kind),
    lng: partial.lng ?? UNARE_CENTER[0],
    lat: partial.lat ?? UNARE_CENTER[1],
    ...partial,
  };
}

function kindToCategory(kind: ResidentSectorAlert['kind']): AlertCategory {
  switch (kind) {
    case 'critico':
      return 'contenedores';
    case 'retraso':
      return 'trafico';
    case 'horario':
    case 'servicio':
      return 'sistema';
    default:
      return 'sistema';
  }
}

export function buildResidentDerivedAlerts(overview: ResidentOverview): ResidentSectorAlert[] {
  const alerts: ResidentSectorAlert[] = [];
  const sector = overview.sectorName;
  const schedule = overview.schedule;
  const proximity = overview.proximity;

  if (schedule.hasSchedule) {
    const days = abbreviateCollectionDays(schedule.collectionDays);
    const window = formatWindow(schedule.window);
    alerts.push(
      baseResidentAlert({
        id: 'resident-horario',
        kind: 'horario',
        title: `Recolección ${days} ${window}`,
        detail: `Ventana de recolección en ${sector}.`,
        priority: 'informativa',
        location: sector,
        source: 'Horario programado',
      }),
    );
  } else {
    alerts.push(
      baseResidentAlert({
        id: 'resident-horario-none',
        kind: 'horario',
        title: 'Sin recolección programada',
        detail: `${sector} no tiene visitas en el plan semanal aprobado.`,
        priority: 'advertencia',
        location: sector,
        source: 'Horario programado',
        status: 'en-progreso',
      }),
    );
  }

  if (overview.stats.criticalPoints > 0) {
    const count = overview.stats.criticalPoints;
    alerts.push(
      baseResidentAlert({
        id: 'resident-critico',
        kind: 'critico',
        title: `${count} contenedor${count === 1 ? '' : 'es'} crítico${count === 1 ? '' : 's'} en ${sector}`,
        detail: 'Nivel de llenado ≥ 80 % en contenedores de tu sector.',
        priority: 'critica',
        location: sector,
        source: 'Contenedores del sector',
        status: 'nueva',
      }),
    );
  }

  const vehicle = proximity?.vehicleCode ?? overview.activeRoutesInSector[0]?.vehicle;
  const eta = proximity?.estimatedMinutes;
  if (
    vehicle &&
    eta != null &&
    eta >= 15 &&
    (proximity?.status === 'approaching' || proximity?.status === 'in_sector')
  ) {
    alerts.push(
      baseResidentAlert({
        id: 'resident-retraso',
        kind: 'retraso',
        title: `Ruta ${vehicle} con retraso estimado ${eta} min en tu sector`,
        detail: `El camión tardará aproximadamente ${eta} minutos en atender ${sector}.`,
        priority: 'advertencia',
        location: sector,
        source: vehicle,
        status: 'en-progreso',
      }),
    );
  }

  if (proximity?.status === 'completed') {
    alerts.push(
      baseResidentAlert({
        id: 'resident-servicio',
        kind: 'servicio',
        title: 'Recolección completada hoy en tu sector',
        detail: vehicle
          ? `${vehicle} finalizó las paradas programadas en ${sector}.`
          : `El servicio de recolección en ${sector} fue completado hoy.`,
        priority: 'informativa',
        location: sector,
        source: vehicle ?? 'Servicio de recolección',
        status: 'resuelta',
      }),
    );
  }

  return alerts;
}

function systemAlertToResidentAlert(alert: SystemAlert): ResidentSectorAlert {
  return {
    id: `system-${alert.id}`,
    kind: 'sistema',
    title: alert.title,
    detail: alert.detail,
    priority: alert.priority,
    datetime: alert.datetime,
    source: alert.source,
    location: alert.location,
    status: alert.status,
    category: alert.category,
    lng: alert.lng,
    lat: alert.lat,
    systemAlertId: alert.id,
  };
}

function dedupeAlerts(alerts: ResidentSectorAlert[]): ResidentSectorAlert[] {
  const seen = new Set<string>();
  return alerts.filter((alert) => {
    const key = `${alert.kind}::${alert.title}::${alert.detail}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortResidentAlerts(alerts: ResidentSectorAlert[]): ResidentSectorAlert[] {
  return [...alerts].sort((a, b) => {
    const kindDiff = KIND_SORT[b.kind] - KIND_SORT[a.kind];
    if (kindDiff !== 0) return kindDiff;
    const priorityDiff = PRIORITY_SORT[b.priority] - PRIORITY_SORT[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.datetime.localeCompare(a.datetime);
  });
}

export function buildResidentSectorAlerts(params: {
  overview: ResidentOverview;
  systemAlerts?: SystemAlert[];
  limit?: number;
}): ResidentSectorAlert[] {
  const ctx = buildResidentAlertContext(params.overview);
  const derived = buildResidentDerivedAlerts(params.overview);
  const filteredSystem = filterResidentAlerts(params.systemAlerts ?? [], ctx).map(systemAlertToResidentAlert);
  const merged = dedupeAlerts(sortResidentAlerts([...derived, ...filteredSystem]));
  const limit = params.limit;
  return limit != null ? merged.slice(0, limit) : merged;
}

export function residentAlertsPreview(
  overview: ResidentOverview,
  systemAlerts: SystemAlert[] = [],
  limit = 3,
): ResidentSectorAlert[] {
  return buildResidentSectorAlerts({ overview, systemAlerts, limit });
}

export function residentAlertToSystemAlert(alert: ResidentSectorAlert): SystemAlert {
  return {
    id: alert.systemAlertId ?? alert.id,
    priority: alert.priority,
    title: alert.title,
    detail: alert.detail,
    source: alert.source,
    location: alert.location,
    datetime: alert.datetime,
    status: alert.status,
    category: alert.category,
    lng: alert.lng,
    lat: alert.lat,
  };
}

export function residentAlertsAsSystemAlerts(alerts: ResidentSectorAlert[]): SystemAlert[] {
  return alerts.map(residentAlertToSystemAlert);
}
