import type { SystemAlert } from '../types/alert';
import type { OperatorRouteStop } from '../api/operator';

export interface OperatorAlertContext {
  vehicleId?: string | null;
  routeStopCodes?: string[];
  routeSectors?: string[];
  ownIncidentAlertIds?: string[];
}

export function buildOperatorAlertContext(params: {
  vehicleId?: string | null;
  stops?: OperatorRouteStop[];
  incidentAlertIds?: string[];
}): OperatorAlertContext {
  const stops = params.stops ?? [];
  return {
    vehicleId: params.vehicleId,
    routeStopCodes: stops.map((stop) => stop.code),
    routeSectors: [...new Set(stops.map((stop) => stop.sectorName).filter(Boolean) as string[])],
    ownIncidentAlertIds: params.incidentAlertIds,
  };
}

export function scoreOperatorAlert(alert: SystemAlert, ctx: OperatorAlertContext): number {
  if (ctx.ownIncidentAlertIds?.includes(alert.id)) return 100;
  if (ctx.vehicleId && alert.source.toUpperCase().includes(ctx.vehicleId.toUpperCase())) return 95;
  if (alert.id.startsWith('al-inc-')) return 90;
  if (alert.category === 'mantenimiento' && ctx.vehicleId && alert.source.includes(ctx.vehicleId)) {
    return 88;
  }
  for (const code of ctx.routeStopCodes ?? []) {
    const normalized = code.replace(/^CNT-/i, '');
    if (
      alert.source.includes(code) ||
      alert.source.includes(normalized) ||
      alert.detail.includes(code) ||
      alert.location.includes(code)
    ) {
      return 82;
    }
  }
  for (const sector of ctx.routeSectors ?? []) {
    if (alert.location.includes(sector) || alert.source.includes(sector)) {
      return 65;
    }
  }
  if (alert.category === 'trafico') return 40;
  return 0;
}

export function filterOperatorAlerts(
  alerts: SystemAlert[],
  ctx: OperatorAlertContext,
  minScore = 60,
): SystemAlert[] {
  return alerts
    .map((alert) => ({ alert, score: scoreOperatorAlert(alert, ctx) }))
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.alert);
}
