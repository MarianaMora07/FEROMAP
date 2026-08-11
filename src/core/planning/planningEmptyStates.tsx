import type { JSX } from 'solid-js';
import { CalendarDays, ClipboardList, History, Search, Truck } from 'lucide-solid';

export interface PlanningEmptyPreset {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  testId: string;
  icon: JSX.Element;
}

export const PLANNING_EMPTY_PRESETS = {
  noWeeklyPlan: {
    testId: 'empty-no-weekly-plan',
    title: 'Sin plan semanal para esta semana',
    description:
      'Aprueba primero qué puntos visitar cada día. Sin plan directivo no puedes optimizar ni despachar rutas.',
    actionLabel: 'Ir al plan semanal',
    actionHref: '/simulation?view=weekly',
    icon: <CalendarDays size={22} />,
  },
  noWeeklyApproved: {
    testId: 'empty-weekly-not-approved',
    title: 'Semana sin aprobar',
    description:
      'El plan semanal debe estar aprobado antes de generar rutas del día. Configura días, valida con ACO y aprueba.',
    actionLabel: 'Completar plan semanal',
    actionHref: '/simulation?view=weekly',
    icon: <CalendarDays size={22} />,
  },
  noDailyPlan: {
    testId: 'empty-no-daily-plan',
    title: 'Sin plan del día',
    description:
      'Abre la jornada desde el calendario o espera a que el sistema incorpore los puntos programados de la semana.',
    actionLabel: 'Ver calendario semanal',
    actionHref: '/optimization',
    icon: <ClipboardList size={22} />,
  },
  noVehicles: {
    testId: 'empty-no-vehicles',
    title: 'Sin vehículos en operación',
    description:
      'No hay flota despachada en este momento. Despacha rutas desde optimización o revisa el módulo de vehículos.',
    actionLabel: 'Ir a optimización',
    actionHref: '/optimization',
    icon: <Truck size={22} />,
  },
  noFleetMatch: {
    testId: 'empty-fleet-filter',
    title: 'Ningún vehículo coincide',
    description: 'Prueba otro término de búsqueda o quita el filtro de estado para ver toda la flota.',
    icon: <Search size={22} />,
  },
  noHistory: {
    testId: 'empty-no-history',
    title: 'Sin resultados en el historial',
    description:
      'Ajusta semana, fecha o número de incidencia. El historial unifica plan semanal, día e incidencias.',
    actionLabel: 'Limpiar filtros',
    actionHref: '/planning/history',
    icon: <History size={22} />,
  },
  noWeeklyPlansList: {
    testId: 'empty-weekly-plans-list',
    title: 'No hay planes semanales',
    description: 'Crea un borrador para la semana actual o la próxima para comenzar el ciclo directivo.',
    icon: <CalendarDays size={22} />,
  },
} satisfies Record<string, PlanningEmptyPreset>;
