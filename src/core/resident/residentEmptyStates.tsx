import type { JSX } from 'solid-js';
import { Calendar, CheckCircle2, MapPin, Trash2, UserX } from 'lucide-solid';
import { residentHubScheduleHref, residentMapHref } from './residentDeepLinks';

export interface ResidentEmptyPreset {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  testId: string;
  icon: JSX.Element;
}

export const RESIDENT_EMPTY_PRESETS = {
  noSectorAssigned: {
    testId: 'empty-resident-no-sector',
    title: 'Sin sector asignado',
    description:
      'Tu cuenta no está vinculada a un sector de recolección. Contacta a la administración municipal.',
    icon: <UserX size={22} />,
  },
  noRouteToday: {
    testId: 'empty-resident-no-route',
    title: 'Sin camión en ruta ahora',
    description:
      'No hay recolección activa en este momento. Consulta el calendario para la próxima visita a tu sector.',
    actionLabel: 'Ver horario',
    actionHref: residentHubScheduleHref(),
    icon: <Calendar size={22} />,
  },
  noWeeklySchedule: {
    testId: 'empty-resident-no-weekly-schedule',
    title: 'Sin recolección programada esta semana',
    description:
      'Tu sector no aparece en el plan semanal aprobado. Contacta a la administración si crees que es un error.',
    icon: <Calendar size={22} />,
  },
  notScheduledToday: {
    testId: 'empty-resident-not-scheduled-today',
    title: 'Hoy no hay recolección programada',
    description: 'Según el calendario de tu sector, el camión no tiene visita prevista para hoy.',
    actionLabel: 'Ver horario',
    actionHref: residentHubScheduleHref(),
    icon: <Calendar size={22} />,
  },
  outsideCollectionWindow: {
    testId: 'empty-resident-outside-window',
    title: 'Fuera del horario de recolección',
    description:
      'El servicio de recolección opera en la ventana horaria de tu sector. Vuelve durante ese horario para ver el camión en vivo.',
    actionLabel: 'Ver horario',
    actionHref: residentHubScheduleHref(),
    icon: <Calendar size={22} />,
  },
  noActiveRoutesInWindow: {
    testId: 'empty-resident-no-active-routes',
    title: 'Sin rutas activas en tu sector',
    description:
      'Hoy no hay vehículos despachados hacia tu barrio. La próxima recolección sigue el calendario programado.',
    actionLabel: 'Mapa mi sector',
    actionHref: residentMapHref({ focus: 'sector' }),
    icon: <MapPin size={22} />,
  },
  noSectorAlerts: {
    testId: 'empty-resident-no-alerts',
    title: 'Sin avisos en tu sector',
    description: 'No hay alertas que afecten tu barrio en este momento.',
    actionLabel: 'Mapa mi sector',
    actionHref: residentMapHref({ focus: 'sector' }),
    icon: <CheckCircle2 size={22} />,
  },
  noContainersInSector: {
    testId: 'empty-resident-no-containers',
    title: 'Sin contenedores en tu sector',
    description: 'No hay puntos de recolección registrados para tu barrio en este momento.',
    actionLabel: 'Mapa mi sector',
    actionHref: residentMapHref({ focus: 'sector' }),
    icon: <Trash2 size={22} />,
  },
} satisfies Record<string, ResidentEmptyPreset>;
