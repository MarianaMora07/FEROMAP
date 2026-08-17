import type { WeeklyPlanDay } from '../api/planning';
import type { VisitSchedule } from '../api/visitSchedules';

export const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

export type WeeklyPlanLoadLevel = 'none' | 'low' | 'medium' | 'high';

export interface WeeklyPlanMissingPoint {
  collectionPointId: number;
  pointCode: string;
  visitsPerWeek: number;
}

export function parseIsoDateLocal(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year!, month! - 1, day);
}

export function formatIsoDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysToIso(iso: string, days: number): string {
  const date = parseIsoDateLocal(iso);
  date.setDate(date.getDate() + days);
  return formatIsoDateLocal(date);
}

export function isoWeekdayMon0(iso: string): number {
  const day = parseIsoDateLocal(iso).getDay();
  return day === 0 ? 6 : day - 1;
}

export function formatWeekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday] ?? 'Día';
}

export function mergeWeekCalendarDays(weekStartDate: string, existingDays: WeeklyPlanDay[]): WeeklyPlanDay[] {
  const byDate = new Map(existingDays.map((day) => [day.operationDate, day]));
  const byWeekday = new Map<number, WeeklyPlanDay>();
  for (const day of existingDays) {
    if (!byWeekday.has(day.weekday)) {
      byWeekday.set(day.weekday, day);
    }
  }

  const days: WeeklyPlanDay[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const operationDate = addDaysToIso(weekStartDate, offset);
    const existing = byDate.get(operationDate) ?? byWeekday.get(offset);
    days.push(
      existing
        ? {
            ...existing,
            operationDate,
            weekday: offset,
          }
        : {
            operationDate,
            weekday: offset,
            sectorIds: [],
            collectionPointIds: [],
          },
    );
  }
  return days;
}

export function compactWeeklyPlanDaysForSave(weekStartDate: string, days: WeeklyPlanDay[]): WeeklyPlanDay[] {
  return days
    .filter((day) => day.collectionPointIds.length > 0)
    .map((day) => ({
      ...day,
      operationDate: addDaysToIso(weekStartDate, day.weekday),
      weekday: day.weekday,
    }));
}

export function weeklyPlanDayLoadLevel(pointCount: number, maxCount: number): WeeklyPlanLoadLevel {
  if (pointCount <= 0) return 'none';
  if (maxCount <= 0) return 'low';
  const ratio = pointCount / maxCount;
  if (ratio <= 0.34) return 'low';
  if (ratio <= 0.67) return 'medium';
  return 'high';
}

export const weeklyPlanLoadCardClass: Record<WeeklyPlanLoadLevel, string> = {
  none: 'border-border bg-surface/40 text-text-muted dark:border-dark-border',
  low: 'border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100',
  medium: 'border-amber-200 bg-amber-50/90 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100',
  high: 'border-orange-300 bg-orange-50 text-orange-950 dark:border-orange-900/40 dark:bg-orange-950/30 dark:text-orange-100',
};

export function findWeeklyPlanMissingFromSchedules(
  days: WeeklyPlanDay[],
  schedules: VisitSchedule[],
): WeeklyPlanMissingPoint[] {
  const assigned = new Set<number>();
  for (const day of days) {
    for (const pointId of day.collectionPointIds) {
      assigned.add(pointId);
    }
  }
  return schedules
    .filter((schedule) => !assigned.has(schedule.collectionPointId))
    .map((schedule) => ({
      collectionPointId: schedule.collectionPointId,
      pointCode: schedule.pointCode,
      visitsPerWeek: schedule.visitsPerWeek,
    }));
}

export function summarizeWeeklyPlanAssignment(days: WeeklyPlanDay[]): {
  pointCount: number;
  activeDays: number;
} {
  const pointIds = new Set<number>();
  let activeDays = 0;
  for (const day of days) {
    if (day.collectionPointIds.length > 0) activeDays += 1;
    for (const pointId of day.collectionPointIds) {
      pointIds.add(pointId);
    }
  }
  return { pointCount: pointIds.size, activeDays };
}
