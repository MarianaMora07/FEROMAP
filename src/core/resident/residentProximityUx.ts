import type { ResidentProximityStatus } from '../api/resident';

export function residentProximityStatusLabel(status: ResidentProximityStatus): string {
  switch (status) {
    case 'approaching':
      return 'En camino';
    case 'in_sector':
      return 'En tu sector';
    case 'completed':
      return 'Ya pasó hoy';
    case 'not_scheduled':
      return 'Sin recolección hoy';
    case 'no_active_route':
      return 'Sin camión en ruta';
  }
}

export function residentProximityBadgeVariant(
  status: ResidentProximityStatus,
): 'success' | 'info' | 'warning' | 'default' {
  switch (status) {
    case 'in_sector':
      return 'success';
    case 'approaching':
      return 'info';
    case 'completed':
      return 'default';
    default:
      return 'warning';
  }
}

/** Clases extra para contraste en badges de proximidad (WCAG en dark mode). */
export function residentProximityBadgeClass(status: ResidentProximityStatus): string {
  switch (status) {
    case 'in_sector':
      return 'font-semibold dark:bg-fero-green/25 dark:text-emerald-200 dark:border-emerald-500/50';
    case 'approaching':
      return 'font-semibold dark:bg-sky-950/50 dark:text-sky-100 dark:border-sky-400/50';
    case 'completed':
      return 'font-semibold dark:bg-slate-800 dark:text-slate-100 dark:border-slate-500/50';
    case 'not_scheduled':
      return 'font-semibold dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-400/50';
    default:
      return 'font-semibold dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-400/50';
  }
}

export function residentProximityDetail(status: ResidentProximityStatus): string {
  switch (status) {
    case 'approaching':
      return 'El camión va hacia tu sector. Puedes seguirlo en el mapa.';
    case 'in_sector':
      return 'Recolección activa en tu barrio ahora mismo.';
    case 'completed':
      return 'El camión ya completó las paradas de tu sector hoy.';
    case 'not_scheduled':
      return 'Hoy no hay recolección programada según el calendario del sector.';
    case 'no_active_route':
      return 'No hay vehículos despachados hacia tu sector en este momento.';
  }
}
