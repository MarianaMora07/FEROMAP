import type { PlanningDashboardSnapshot } from '../api/planningAnalytics';
import {
  monitoringPlaybackHref,
  optimizationHref,
  optimizationPlaybackHref,
} from './operationalLinks';
import { optimizationDateHref, todayIso } from './planningUx';
import { planningHistoryHref } from './planningHistoryLinks';
import { weeklyPlanHref as planningWeeklyPath } from './weeklyPlanLinks';

export interface PlannerNextAction {
  message: string;
  detail: string;
  href: string;
  label: string;
  tone: 'warning' | 'info' | 'success';
}

export const PLANNER_QUICK_ACTIONS = [
  { id: 'weekly', label: 'Plan semanal', href: planningWeeklyPath, description: 'Directivo' },
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
      href: planningWeeklyPath,
      label: 'Ir al plan semanal',
      tone: 'warning',
    };
  }

  if (weekly.status === 'draft') {
    return {
      message: 'Semana sin aprobar',
      detail: `Borrador ${weekly.weekStartDate} — valida y aprueba antes de despachar.`,
      href: planningWeeklyPath,
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

  if (daily.status === 'optimized' && !isDispatched) {
    return {
      message: 'Rutas optimizadas — simula el recorrido',
      detail: 'Revisa el preview animado antes de despachar a campo.',
      href: optimizationPlaybackHref({ date: daily.operationDate, dailyPlanId: daily.id }),
      label: 'Simular recorrido',
      tone: 'info',
    };
  }

  if (!isDispatched && daily.status !== 'completed' && daily.status !== 'partial') {
    return {
      message: 'Hoy sin despachar',
      detail: `${daily.pointCount} puntos en plan · optimiza y despacha cuando esté listo.`,
      href: optimizationHref({ date: daily.operationDate, dailyPlanId: daily.id }),
      label: 'Optimizar hoy',
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
      href: monitoringPlaybackHref({
        date: daily.operationDate,
        dailyPlanId: daily.id,
      }),
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
