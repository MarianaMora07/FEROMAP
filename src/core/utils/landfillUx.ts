import type { KpiMetrics } from '../../data/types/simulation';
import type { RouteCollection } from '../types/geo';
import { DEFAULT_OPERATIONAL_FACILITIES } from '../types/operationalSettings';

export interface MapFacilities {
  depotLat: number;
  depotLon: number;
  landfillLat: number;
  landfillLon: number;
  landfillUnloadMinutes: number;
  workStart: string;
  workEnd: string;
}

export const DEFAULT_MAP_FACILITIES: MapFacilities = {
  depotLat: DEFAULT_OPERATIONAL_FACILITIES.depotLat,
  depotLon: DEFAULT_OPERATIONAL_FACILITIES.depotLon,
  landfillLat: DEFAULT_OPERATIONAL_FACILITIES.landfillLat,
  landfillLon: DEFAULT_OPERATIONAL_FACILITIES.landfillLon,
  landfillUnloadMinutes: DEFAULT_OPERATIONAL_FACILITIES.landfillUnloadMinutes,
  workStart: DEFAULT_OPERATIONAL_FACILITIES.workStart,
  workEnd: DEFAULT_OPERATIONAL_FACILITIES.workEnd,
};

export function isLandfillStop(code?: string | null, stopType?: string | null): boolean {
  if (stopType === 'landfill') return true;
  return (code ?? '').toUpperCase() === 'VERTEDERO';
}

export function formatNextStopLabel(code?: string | null, stopType?: string | null): string {
  if (isLandfillStop(code, stopType)) return 'Vertedero — descarga';
  return code ?? '—';
}

export function formatShiftUsage(kpis: KpiMetrics): string | null {
  const breakdown = kpis.durationBreakdown?.optimized;
  const used = breakdown?.shiftUsedHours ?? kpis.durationHours.optimized;
  const budget = breakdown?.shiftBudgetHours ?? kpis.workdayHours ?? 12;
  if (used == null || budget == null) return null;
  return `Jornada utilizada: ${used.toFixed(1)} h / ${budget.toFixed(0)} h`;
}

export function countLandfillTripsInRoutes(routes: RouteCollection): number {
  return routes.features.reduce((sum, feature) => {
    const stops = feature.properties.stops ?? [];
    return sum + stops.filter((stop) => stop.stopType === 'landfill').length;
  }, 0);
}

export function landfillTripsForRouteFeature(feature: RouteCollection['features'][number]): number {
  return (feature.properties.stops ?? []).filter((stop) => stop.stopType === 'landfill').length;
}

export function uncoveredAlertMessage(kpis: KpiMetrics): string | null {
  const count = kpis.uncoveredPoints ?? kpis.uncoveredPointCodes?.length ?? 0;
  if (count <= 0) return null;
  return `${count} contenedor${count === 1 ? '' : 'es'} no caben en la jornada de hoy`;
}

export function landfillTripBadgeLabel(trips: number): string | null {
  if (trips <= 0) return null;
  return `${trips} viaje${trips === 1 ? '' : 's'} al vertedero`;
}
