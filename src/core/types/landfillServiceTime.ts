/**
 * Contrato de vertedero y jornada operativa (ADR-004).
 * @see docs/fase-9/adr-vertedero-multi-viaje.md
 */

export const DEFAULT_DEPOT_LAT = 8.295;
export const DEFAULT_DEPOT_LON = -62.715;
export const DEFAULT_LANDFILL_LAT = 8.28;
export const DEFAULT_LANDFILL_LON = -62.69;
export const DEFAULT_LANDFILL_UNLOAD_MINUTES = 15;
export const DEFAULT_LANDFILL_UNLOAD_SECONDS = DEFAULT_LANDFILL_UNLOAD_MINUTES * 60;
export const DEFAULT_WORK_START = '06:00';
export const DEFAULT_WORK_END = '18:00';
export const DEFAULT_SHIFT_BUDGET_SECONDS = 12 * 3600;

/** Campos de instalaciones operativas (GET/PATCH admin — Fase 1). */
export interface OperationalFacilitiesFields {
  depotLat: number;
  depotLon: number;
  landfillLat: number;
  landfillLon: number;
  landfillUnloadMinutes: number;
  workStart: string;
  workEnd: string;
}

/** Desglose de duración con vertedero y jornada (respuesta KPI — Fase 2). */
export interface LandfillDurationBreakdown {
  travelHours: number;
  serviceHours: number;
  unloadHours: number;
  landfillTrips: number;
  shiftBudgetHours: number;
  shiftUsedHours: number;
  shiftUtilizationPct: number;
  uncoveredPoints: number;
  crewLabel?: string;
}

export interface LandfillRouteBreakdown {
  travelSeconds: number;
  collectionStopCount: number;
  serviceSecondsPerStop: number;
  serviceSecondsTotal: number;
  landfillVisitCount: number;
  unloadSecondsPerVisit: number;
  unloadSecondsTotal: number;
  elapsedSeconds: number;
  shiftBudgetSeconds: number;
  shiftUtilizationPct: number;
  unloadHours: number;
  shiftBudgetHours: number;
  shiftUsedHours: number;
}

const TIME_HHMM_RE = /^(\d{1,2}):(\d{2})$/;

export function landfillNodeIndex(nCustomers: number): number {
  return nCustomers + 1;
}

export function normalizeLandfillUnloadMinutes(value: number | null | undefined): number {
  if (value == null) return DEFAULT_LANDFILL_UNLOAD_MINUTES;
  return Math.max(1, Math.min(value, 120));
}

export function landfillUnloadSeconds(unloadMinutes?: number | null): number {
  return normalizeLandfillUnloadMinutes(unloadMinutes) * 60;
}

export function parseTimeHhmm(value: string): { hours: number; minutes: number } {
  const match = TIME_HHMM_RE.exec(value.trim());
  if (!match) {
    throw new Error(`Hora inválida (esperado HH:MM): ${value}`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new Error(`Hora fuera de rango: ${value}`);
  }
  return { hours, minutes };
}

export function secondsSinceMidnight(value: string): number {
  const { hours, minutes } = parseTimeHhmm(value);
  return hours * 3600 + minutes * 60;
}

export function shiftBudgetSeconds(
  workStart: string = DEFAULT_WORK_START,
  workEnd: string = DEFAULT_WORK_END,
): number {
  const start = secondsSinceMidnight(workStart);
  const end = secondsSinceMidnight(workEnd);
  if (end <= start) {
    throw new Error(`work_end debe ser posterior a work_start: ${workStart} – ${workEnd}`);
  }
  return end - start;
}

export function routeLandfillUnloadSeconds(
  landfillVisitCount: number,
  unloadMinutes?: number | null,
): number {
  if (landfillVisitCount <= 0) return 0;
  return landfillVisitCount * landfillUnloadSeconds(unloadMinutes);
}

export function routeOperationalElapsedSeconds(
  travelSeconds: number,
  collectionStopCount: number,
  serviceSecondsPerStop: number,
  landfillVisitCount: number,
  options?: { unloadMinutes?: number | null },
): number {
  const travel = Math.round(travelSeconds);
  const serviceTotal = Math.max(0, collectionStopCount) * serviceSecondsPerStop;
  const unloadTotal = routeLandfillUnloadSeconds(landfillVisitCount, options?.unloadMinutes);
  return travel + serviceTotal + unloadTotal;
}

export function canFitStopInShift(
  elapsedSec: number,
  travelToSec: number,
  serviceAtSec: number,
  shiftBudgetSec: number,
): boolean {
  return elapsedSec + travelToSec + serviceAtSec <= shiftBudgetSec;
}

export function shiftUtilizationPct(elapsedSec: number, shiftBudgetSec: number): number {
  if (shiftBudgetSec <= 0) return 0;
  return Math.min(100, (elapsedSec / shiftBudgetSec) * 100);
}

export function buildLandfillRouteBreakdown(params: {
  travelSeconds: number;
  collectionStopCount: number;
  serviceSecondsPerStop: number;
  landfillVisitCount: number;
  unloadMinutes?: number | null;
  workStart?: string;
  workEnd?: string;
}): LandfillRouteBreakdown {
  const travelSeconds = Math.round(params.travelSeconds);
  const serviceSecondsTotal = Math.max(0, params.collectionStopCount) * params.serviceSecondsPerStop;
  const unloadSecondsPerVisit = landfillUnloadSeconds(params.unloadMinutes);
  const unloadSecondsTotal = params.landfillVisitCount * unloadSecondsPerVisit;
  const elapsedSeconds = travelSeconds + serviceSecondsTotal + unloadSecondsTotal;
  const shiftBudgetSecondsValue = shiftBudgetSeconds(
    params.workStart ?? DEFAULT_WORK_START,
    params.workEnd ?? DEFAULT_WORK_END,
  );

  return {
    travelSeconds,
    collectionStopCount: params.collectionStopCount,
    serviceSecondsPerStop: params.serviceSecondsPerStop,
    serviceSecondsTotal,
    landfillVisitCount: params.landfillVisitCount,
    unloadSecondsPerVisit,
    unloadSecondsTotal,
    elapsedSeconds,
    shiftBudgetSeconds: shiftBudgetSecondsValue,
    shiftUtilizationPct: shiftUtilizationPct(elapsedSeconds, shiftBudgetSecondsValue),
    unloadHours: Math.round((unloadSecondsTotal / 3600) * 100) / 100,
    shiftBudgetHours: Math.round((shiftBudgetSecondsValue / 3600) * 10) / 10,
    shiftUsedHours: Math.round((elapsedSeconds / 3600) * 100) / 100,
  };
}

/**
 * Matriz objetivo vs reporte (ADR-004).
 * - ACO: minimiza distancia
 * - KPIs/rutas: viaje + paradas + vertedero + jornada
 */
export const LANDFILL_OBJECTIVE_MATRIX = {
  acoFitness: { distance: true, landfillUnload: false, shiftLimit: false },
  kpiDuration: { travel: true, serviceTime: true, landfillUnload: true, shiftLimit: true },
} as const;
