import type { JSX } from 'solid-js';
import { CheckCircle2, MapPin, Radio, Truck } from 'lucide-solid';

export interface OperatorEmptyPreset {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  testId: string;
  icon: JSX.Element;
}

export const OPERATOR_EMPTY_PRESETS = {
  noDispatchedRoute: {
    testId: 'empty-operator-no-route',
    title: 'Sin ruta despachada',
    description:
      'Planificación aún no ha despachado tu jornada. Cuando esté lista, verás tu ruta aquí y en monitoreo.',
    actionLabel: 'Ver estado en monitoreo',
    actionHref: '/monitoring',
    icon: <Radio size={22} />,
  },
  noVehicleAssigned: {
    testId: 'empty-operator-no-vehicle',
    title: 'Sin vehículo asignado',
    description:
      'No encontramos un vehículo vinculado a tu usuario. Contacta a planificación antes de salir a ruta.',
    icon: <Truck size={22} />,
  },
  noPendingStops: {
    testId: 'empty-operator-no-stops',
    title: 'Sin paradas pendientes',
    description: 'Completaste las paradas de tu ruta o aún no hay puntos activos para hoy.',
    actionLabel: 'Ver mapa',
    actionHref: '/map',
    icon: <CheckCircle2 size={22} />,
  },
  noFleetInMonitoring: {
    testId: 'empty-operator-no-fleet',
    title: 'Sin vehículos en operación',
    description:
      'No hay flota despachada en este momento. Revisa Mi operación cuando planificación active tu jornada.',
    actionLabel: 'Ir a Mi operación',
    actionHref: '/operator',
    icon: <Truck size={22} />,
  },
  noFleetMatch: {
    testId: 'empty-operator-fleet-filter',
    title: 'Ningún vehículo coincide',
    description: 'Prueba otro término de búsqueda o quita el filtro de estado.',
    icon: <MapPin size={22} />,
  },
  noAlertsOnRoute: {
    testId: 'empty-operator-no-alerts',
    title: 'Sin alertas en tu ruta',
    description:
      'No hay avisos que afecten tu vehículo, tus paradas o tu sector en este momento.',
    actionLabel: 'Ver mapa de mi ruta',
    actionHref: '/map?focus=route',
    icon: <CheckCircle2 size={22} />,
  },
  dayClosedByPlanning: {
    testId: 'empty-operator-day-closed',
    title: 'Jornada cerrada por planificación',
    description:
      'El día operativo ya fue cerrado. Revisa el resumen y el plan en modo solo lectura.',
    actionLabel: 'Ver plan del día',
    actionHref: '/operator/plan',
    icon: <CheckCircle2 size={22} />,
  },
} satisfies Record<string, OperatorEmptyPreset>;
