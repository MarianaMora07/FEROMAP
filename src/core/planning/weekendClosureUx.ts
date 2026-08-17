import type { PlanningAnalyticsSummary, PlanningDashboardSnapshot } from '../api/planningAnalytics';
import type { WeeklyPlan } from '../api/planning';
import { addWeeksToMonday, mondayIso } from '../api/planning';
import { weeklyPlanHref as planningWeeklyPath } from './weeklyPlanLinks';

export interface WeekendClosureItem {
  id: 'days-closed' | 'pending-incorporated' | 'next-week-plan';
  label: string;
  detail: string;
  done: boolean;
  actionHref?: string;
  actionLabel?: string;
}

export function weeklyPlanHref(planId?: number): string {
  return planId ? `${planningWeeklyPath}?planId=${planId}` : planningWeeklyPath;
}

export function isFriday(reference = new Date()): boolean {
  return reference.getDay() === 5;
}

/** Viernes a domingo — ventana típica de cierre semanal. */
export function isWeekendClosureWindow(reference = new Date()): boolean {
  const day = reference.getDay();
  return day === 5 || day === 6 || day === 0;
}

export function deriveWeekendClosureItems(
  analytics: PlanningAnalyticsSummary,
  snapshot: PlanningDashboardSnapshot | null,
  weeklyPlans: WeeklyPlan[],
): WeekendClosureItem[] {
  const admin = analytics.levels.administrativo;
  const scheduled = admin.scheduledDays ?? admin.dailyPlans ?? 5;
  const closed = admin.closedDays ?? 0;
  const openPending = admin.openPendingVisits ?? snapshot?.openPendingVisits ?? 0;

  const nextMonday = addWeeksToMonday(mondayIso(), 1);
  const nextWeekPlan = weeklyPlans.find((row) => row.weekStartDate === nextMonday);
  const nextWeekReady =
    nextWeekPlan != null &&
    (nextWeekPlan.status === 'approved' || nextWeekPlan.status === 'draft');

  return [
    {
      id: 'days-closed',
      label: '¿Días cerrados?',
      detail: `${closed} de ${scheduled} jornadas cerradas en la semana`,
      done: scheduled > 0 && closed >= scheduled,
      actionHref: '/optimization',
      actionLabel: 'Cerrar jornadas',
    },
    {
      id: 'pending-incorporated',
      label: '¿Pendientes incorporados?',
      detail:
        openPending === 0
          ? 'Sin pendientes abiertos en el sistema'
          : `${openPending} pendiente(s) aún sin incorporar`,
      done: openPending === 0,
      actionHref: '/optimization#pendientes',
      actionLabel: 'Revisar pendientes',
    },
    {
      id: 'next-week-plan',
      label: '¿Plan próxima semana?',
      detail: nextWeekPlan
        ? `Plan ${nextWeekPlan.status === 'approved' ? 'aprobado' : 'en borrador'} (${nextWeekPlan.weekStartDate})`
        : 'Aún no hay borrador para la próxima semana',
      done: nextWeekReady,
      actionHref: weeklyPlanHref(),
      actionLabel: nextWeekPlan ? 'Abrir plan semanal' : 'Crear plan semanal',
    },
  ];
}

export function canArchiveWeeklyFromClosure(
  snapshot: PlanningDashboardSnapshot | null,
  items: WeekendClosureItem[],
): boolean {
  const weekly = snapshot?.weeklyPlan;
  if (!weekly || weekly.status !== 'approved') return false;
  const operationalReady = items
    .filter((item) => item.id !== 'next-week-plan')
    .every((item) => item.done);
  return operationalReady && (isWeekendClosureWindow() || items.every((item) => item.done));
}

export function weekendClosureProgress(items: WeekendClosureItem[]): number {
  if (items.length === 0) return 0;
  return Math.round((items.filter((item) => item.done).length / items.length) * 100);
}
