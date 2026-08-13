import type { OperatorFieldContext } from './operatorUx';
import { operatorAlertsHref, operatorMapHref, operatorMonitoringHref } from './operatorDeepLinks';

export interface OperatorQuickAction {
  id: 'monitoring' | 'map' | 'alerts' | 'breakdown';
  label: string;
  href: string;
  description: string;
}

export function getOperatorQuickActions(params: {
  date?: string;
  vehicleId?: string;
  readOnly?: boolean;
}): OperatorQuickAction[] {
  const actions: OperatorQuickAction[] = [
    {
      id: 'monitoring',
      label: 'Monitoreo',
      href: operatorMonitoringHref(params),
      description: 'Mapa en vivo',
    },
    {
      id: 'map',
      label: 'Mapa mi ruta',
      href: operatorMapHref({ ...params, focus: 'route' }),
      description: 'GIS',
    },
    {
      id: 'alerts',
      label: 'Alertas',
      href: operatorAlertsHref({ ...params, scope: 'mine' }),
      description: 'Avisos',
    },
    {
      id: 'breakdown',
      label: 'Reportar avería',
      href: `${operatorMonitoringHref(params)}#reportar-averia`,
      description: 'Contingencia',
    },
  ];
  if (params.readOnly) {
    return actions.filter((action) => action.id !== 'breakdown');
  }
  return actions;
}

/** @deprecated Use getOperatorQuickActions for contextual hrefs */
export const OPERATOR_QUICK_ACTIONS = getOperatorQuickActions({});

export interface OperatorNextAction {
  message: string;
  detail: string;
  href: string;
  label: string;
  tone: 'warning' | 'info' | 'success';
}

export function operatorRouteStatusLabel(context: OperatorFieldContext): string {
  if (context.isDayClosed) {
    return context.planStatus === 'partial' ? 'Cerrado parcial' : 'Jornada cerrada';
  }
  if (!context.hasDispatchedPlan) return 'Sin despachar';
  if (!context.hasAssignedVehicle) return 'Sin vehículo asignado';
  if (!context.hasPendingStops) return 'Jornada completada';
  return 'En ruta';
}

export function deriveNextOperatorAction(
  context: OperatorFieldContext,
  linkParams?: { date?: string; vehicleId?: string },
): OperatorNextAction {
  const vehicle = context.vehicle;
  const date = linkParams?.date ?? context.operationDate;
  const vehicleId = linkParams?.vehicleId ?? vehicle?.id;
  const links = { date, vehicleId };

  if (context.isDayClosed) {
    return {
      message:
        context.planStatus === 'partial' ? 'Jornada cerrada parcialmente' : 'Jornada cerrada',
      detail:
        'Planificación cerró el día. Esta vista es solo consulta — no puedes despachar ni cerrar el plan.',
      href: '/operator/plan',
      label: 'Ver resumen del día',
      tone: 'success',
    };
  }

  if (!context.hasDispatchedPlan) {
    return {
      message: 'Tu ruta aún no está despachada',
      detail: 'Planificación debe activar la jornada. Revisa el estado en monitoreo.',
      href: operatorMonitoringHref(links),
      label: 'Ver estado',
      tone: 'warning',
    };
  }

  if (!context.hasAssignedVehicle) {
    return {
      message: 'Sin vehículo asignado',
      detail: 'Contacta a planificación antes de salir a campo.',
      href: '/operator',
      label: 'Actualizar',
      tone: 'warning',
    };
  }

  if (!context.hasPendingStops) {
    return {
      message: 'Jornada completada',
      detail: 'No quedan paradas pendientes en tu ruta de hoy.',
      href: operatorMapHref({ ...links, focus: 'route' }),
      label: 'Ver mapa',
      tone: 'success',
    };
  }

  if (vehicle) {
    return {
      message: `Siguiente parada: ${vehicle.nextPoint}`,
      detail: `${vehicle.id} · ${vehicle.route} · ${vehicle.progress}% de avance`,
      href: operatorMonitoringHref(links),
      label: 'Ir a siguiente parada',
      tone: 'info',
    };
  }

  return {
    message: 'Ruta activa',
    detail: 'Abre monitoreo para ver tu vehículo y el mapa en vivo.',
    href: operatorMonitoringHref(links),
    label: 'Abrir monitoreo',
    tone: 'info',
  };
}
