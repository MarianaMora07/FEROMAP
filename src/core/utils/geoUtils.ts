import length from '@turf/length';
import type { Feature, LineString } from 'geojson';
import type { ContainerPriority } from '../../data/types/geo';

export function fillLevelColor(level: number): string {
  if (level >= 80) return '#ef4444';
  if (level >= 60) return '#f59e0b';
  if (level >= 40) return '#94a3b8';
  return '#34D634';
}

export function fillLevelLabel(level: number): string {
  if (level >= 80) return 'Crítico';
  if (level >= 60) return 'Lleno';
  if (level >= 40) return 'Parcial';
  return 'Normal';
}

export function priorityBadgeClass(priority: ContainerPriority): string {
  switch (priority) {
    case 'critica':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
    case 'alta':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300';
    case 'media':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
}

export function routeLengthKm(route: Feature<LineString>): number {
  return Math.round(length(route, { units: 'kilometers' }) * 10) / 10;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function pctSaved(current: number, optimized: number): number {
  if (current === 0) return 0;
  return Math.round(((current - optimized) / current) * 100);
}
