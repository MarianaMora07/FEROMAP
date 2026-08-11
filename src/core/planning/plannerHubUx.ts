import type { PlanningDashboardSnapshot } from '../api/planningAnalytics';
import { optimizationDateHref, todayIso } from './planningUx';
import { planningHistoryHref } from './planningHistoryLinks';

export interface PlannerNextAction {
  message: string;
  detail: string;
  href: string;
  label: string;
  tone: 'warning' | 'info' | 'success';
}

export const PLANNER_QUICK_ACTIONS = [
  { id: 'weekly', label: 'Plan semanal', href: '/simulation?view=weekly', description: 'Directivo' },
  { id: 'today', label: 'Plan de hoy', href: optimizationDateHref(todayIso()), description: 'Administrativo' },
  { id: 'pending', label: 'Pendientes', href: `${optimizationDateHref(todayIso())}#pendientes`, description: 'Carry-over' },
  { id: 'history', label: 'Historial', href: '/planning/history', description: 'Buscar' },
  { id: 'monitoring', label: 'Monitoreo', href: '/monitoring', description: 'Operativo' },
] as const;

export function deriveNextPlannerAction(snapshot: PlanningDashboardSnapshot): PlannerNextAction {
  const weekly = snapshot.weeklyPlan;
  const daily = snapshot.dailyPlan;
  const pending = snapshot.openPendingVisits;
  const incidents = snapshot.openIncidents;
  const today = todayIso();

  if (!weekly) {
    return {
      message: 'Semana sin plan',
      detail: 'Crea y aprueba el plan semanal antes de operar el día.',
      href: '/simulation?view=weekly',
      label: 'Ir al plan semanal',
      tone: 'warning',
    };
  }

  if (weekly.status === 'draft') {
    return {
      message: 'Semana sin aprobar',
      detail: `Borrador ${weekly.weekStartDate} — valida y aprueba antes de despachar.`,
      href: '/simulation?view=weekly',
      label: 'Aprobar semana',
      tone: 'warning',
    };
  }

  if (!daily) {
    return {
      message: 'Hoy sin plan del día',
      detail: 'Abre el plan del día para optimizar rutas.',
      href: optimizationDateHref(today),
      label: 'Abrir plan de hoy',
      tone: 'warning',
    };
  }

  const isDispatched = daily.dispatched || daily.status === 'dispatched';
  if (!isDispatched && daily.status !== 'completed' && daily.status !== 'partial') {
    return {
      message: 'Hoy sin despachar',
      detail: `${daily.pointCount} puntos en plan · estado ${daily.status}.`,
      href: optimizationDateHref(daily.operationDate),
      label: 'Ir a despachar',
      tone: 'warning',
    };
  }

  if (pending > 0) {
    return {
      message: `${pending} pendiente${pending === 1 ? '' : 's'} de ayer`,
      detail: 'Incorpora carry-over al plan de hoy o gestiona en pendientes.',
      href: `${optimizationDateHref(today)}#pendientes`,
      label: 'Ver pendientes',
      tone: 'info',
    };
  }

  if (incidents > 0) {
    return {
      message: `${incidents} incidencia${incidents === 1 ? '' : 's'} abierta${incidents === 1 ? '' : 's'}`,
      detail: 'Revisa averías y recálculos en monitoreo.',
      href: '/monitoring',
      label: 'Ir a monitoreo',
      tone: 'info',
    };
  }

  return {
    message: 'Operación al día',
    detail: 'Semana aprobada y jornada despachada. Revisa historial si necesitas auditar.',
    href: planningHistoryHref({ operationDate: today }),
    label: 'Ver historial',
    tone: 'success',
  };
}
