import type { PlanForecast, PlanVsReal, WeeklyPlanForecast } from '../api/planning';

/**
 * Normalizadores del contrato de KPIs (Fase 0). La API entrega JSON ya parseado,
 * pero puede venir parcial (seeds, mocks o versiones antiguas); estas funciones
 * garantizan la forma del contrato o devuelven `null`.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asCount(value: unknown): number {
  const parsed = asNumber(value);
  return parsed == null ? 0 : Math.max(0, Math.round(parsed));
}

export function normalizePlanForecast(value: unknown): PlanForecast | null {
  const record = asRecord(value);
  if (!record) return null;
  const distanceKm = asNumber(record.distanceKm);
  if (distanceKm == null) return null;
  return {
    distanceKm,
    durationHours: asNumber(record.durationHours) ?? 0,
    baselineDistanceKm: asNumber(record.baselineDistanceKm),
    savingPct: asNumber(record.savingPct),
    scheduledPoints: asCount(record.scheduledPoints),
    coveredPoints: asCount(record.coveredPoints),
    uncoveredPoints: asCount(record.uncoveredPoints),
    coveragePct: asNumber(record.coveragePct),
    vehicleCount: asCount(record.vehicleCount),
  };
}

export function normalizePlanVsReal(value: unknown): PlanVsReal | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    plannedDistanceKm: asNumber(record.plannedDistanceKm),
    actualDistanceKm: asNumber(record.actualDistanceKm),
    plannedDurationMin: asNumber(record.plannedDurationMin),
    actualDurationMin: asNumber(record.actualDurationMin),
    scheduledPoints: asCount(record.scheduledPoints),
    servedPoints: asCount(record.servedPoints),
    collectedKg: asNumber(record.collectedKg) ?? 0,
    completionPct: asNumber(record.completionPct),
  };
}

export function normalizeWeeklyPlanForecast(value: unknown): WeeklyPlanForecast | null {
  const record = asRecord(value);
  if (!record) return null;
  const base = normalizePlanForecast(record);
  if (!base) return null;
  const rawDays = asRecord(record.days) ?? {};
  const days: Record<string, PlanForecast> = {};
  for (const [operationDate, dayValue] of Object.entries(rawDays)) {
    const day = normalizePlanForecast(dayValue);
    if (day) days[operationDate] = day;
  }
  return {
    ...base,
    weekStartDate: typeof record.weekStartDate === 'string' ? record.weekStartDate : '',
    days,
  };
}
