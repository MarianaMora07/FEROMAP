import type { ResidentFieldContext } from './residentUx';
import {
  residentAlertsHref,
  residentHubScheduleHref,
  residentMapHref,
  residentPointsHref,
} from './residentDeepLinks';
import { residentProximityStatusLabel } from './residentProximityUx';

export interface ResidentQuickAction {
  id: 'map' | 'alerts' | 'points';
  label: string;
  href: string;
  description: string;
}

export function getResidentQuickActions(params?: {
  sectorId?: number | null;
  focus?: 'truck' | 'sector' | 'routes';
}): ResidentQuickAction[] {
  return [
    {
      id: 'map',
      label: 'Mapa mi sector',
      href: residentMapHref({
        focus: params?.focus ?? 'sector',
        sectorId: params?.sectorId ?? undefined,
      }),
      description: 'Camión y contenedores',
    },
    {
      id: 'alerts',
      label: 'Alertas',
      href: residentAlertsHref(),
      description: 'Avisos de tu sector',
    },
    {
      id: 'points',
      label: 'Puntos de recolección',
      href: residentPointsHref(),
      description: 'Contenedores del barrio',
    },
  ];
}

export interface ResidentNextAction {
  message: string;
  detail: string;
  href: string;
  label: string;
  tone: 'warning' | 'info' | 'success' | 'error';
}

export function residentServiceStatusLabel(context: ResidentFieldContext): string {
  if (context.proximity) {
    return residentProximityStatusLabel(context.proximity.status);
  }
  switch (context.phase) {
    case 'no_sector':
      return 'Sin sector';
    case 'approaching':
      return 'Camión en camino';
    case 'in_sector':
      return 'Recolección en curso';
    case 'completed_today':
      return 'Ya pasó hoy';
    case 'no_active_route':
      return context.isWithinWindow ? 'Sin ruta activa' : 'Fuera de horario';
  }
}

export function deriveNextResidentAction(
  context: ResidentFieldContext,
  linkParams?: { sectorId?: number | null },
): ResidentNextAction {
  const sectorId = linkParams?.sectorId ?? undefined;
  const route = context.primaryRoute;
  const eta = context.estimatedMinutes;

  if (!context.hasSector) {
    return {
      message: 'Tu cuenta no tiene sector asignado',
      detail: 'Contacta a la administración municipal para vincular tu domicilio a un sector.',
      href: '',
      label: '',
      tone: 'error',
    };
  }

  if (context.phase === 'approaching' && route) {
    const etaLabel = eta != null ? `~${eta} min` : 'pronto';
    const vehicleLabel = context.proximity?.vehicleCode ?? route.vehicle;
    const stopsBefore = context.proximity?.stopsBeforeSector;
    return {
      message: `El camión ${vehicleLabel} está en camino — ${etaLabel}`,
      detail:
        stopsBefore != null && stopsBefore > 0
          ? `${stopsBefore} parada(s) antes de llegar a tu sector.`
          : route.nextStop
            ? `Próxima parada en tu sector: ${route.nextStop}.`
            : `${route.pendingStops} parada(s) pendientes en tu zona.`,
      href: residentMapHref({ focus: 'truck', sectorId }),
      label: 'Ver en mapa',
      tone: 'info',
    };
  }

  if (context.phase === 'in_sector' && route) {
    const done = context.proximity?.completedStopsInSector ?? route.stopsInSector - route.pendingStops;
    const total = context.proximity?.totalStopsInSector ?? route.stopsInSector;
    return {
      message: 'Recolección en curso en tu zona',
      detail: `${done} de ${total} paradas completadas en ${context.sectorName}.`,
      href: residentMapHref({ focus: 'routes', sectorId }),
      label: 'Ver avance',
      tone: 'success',
    };
  }

  if (context.phase === 'completed_today') {
    const vehicleLabel = context.proximity?.vehicleCode ?? route?.vehicle ?? 'El camión';
    return {
      message: `${vehicleLabel} ya pasó por tu sector hoy`,
      detail: 'La recolección de hoy en tu barrio fue completada.',
      href: residentHubScheduleHref(),
      label: 'Ver horario',
      tone: 'success',
    };
  }

  if (context.phase === 'no_active_route' && context.schedule.isCollectionDay) {
    return {
      message: 'Hoy hay recolección en tu sector',
      detail: `Ventana horaria ${context.schedule.window}. El camión puede pasar en cualquier momento dentro de ese horario.`,
      href: residentHubScheduleHref(),
      label: 'Ver horario',
      tone: 'info',
    };
  }

  const nextLabel = context.schedule.nextCollection || 'consulta el calendario';
  return {
    message: `Próxima recolección: ${nextLabel}`,
    detail: context.isWithinWindow
      ? 'No hay camión en ruta ahora. Revisa el horario de tu sector.'
      : `Fuera de la ventana horaria (${context.schedule.window}).`,
    href: residentHubScheduleHref(),
    label: 'Ver horario',
    tone: 'warning',
  };
}
