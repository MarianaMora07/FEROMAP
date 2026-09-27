export const weeklyPlanHref = '/planning/weekly';

/** Deep link a la semana concreta (lunes ISO) del plan semanal. */
export function weeklyPlanWeekHref(weekStart: string): string {
  return `${weeklyPlanHref}?week=${encodeURIComponent(weekStart)}`;
}
