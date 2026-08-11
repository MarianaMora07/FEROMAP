export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'default' | 'outline';

export type PlanningLevel = 'directivo' | 'administrativo' | 'operativo';

export type PlanningStatusKey =
  | 'draft'
  | 'approved'
  | 'optimized'
  | 'dispatched'
  | 'completed'
  | 'partial'
  | 'archived'
  | 'open'
  | 'incorporated'
  | 'cancelled';

export interface PlanningLevelMeta {
  id: PlanningLevel;
  label: string;
  shortLabel: string;
  glossary: string;
  toneClass: string;
  titleClass: string;
}

export const PLANNING_LEVELS: Record<PlanningLevel, PlanningLevelMeta> = {
  directivo: {
    id: 'directivo',
    label: 'Nivel directivo',
    shortLabel: 'Directivo',
    glossary: 'Semana — qué puntos visitar cada día',
    toneClass: 'border-violet-300/50 bg-violet-50/80 dark:border-violet-900/40 dark:bg-violet-950/20',
    titleClass: 'text-violet-800 dark:text-violet-200',
  },
  administrativo: {
    id: 'administrativo',
    label: 'Nivel administrativo',
    shortLabel: 'Administrativo',
    glossary: 'Día — optimizar, despachar y cerrar jornada',
    toneClass: 'border-fero-blue/30 bg-fero-blue/10',
    titleClass: 'text-fero-blue',
  },
  operativo: {
    id: 'operativo',
    label: 'Nivel operativo',
    shortLabel: 'Operativo',
    glossary: 'Monitoreo en caliente — averías y recálculos',
    toneClass: 'border-amber-300/60 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/20',
    titleClass: 'text-amber-800 dark:text-amber-200',
  },
};

export const PLANNING_STATUS: Record<
  PlanningStatusKey,
  { label: string; variant: BadgeVariant }
> = {
  draft: { label: 'Borrador', variant: 'default' },
  approved: { label: 'Aprobado', variant: 'success' },
  optimized: { label: 'Optimizado', variant: 'info' },
  dispatched: { label: 'Despachado', variant: 'success' },
  completed: { label: 'Cerrado', variant: 'success' },
  partial: { label: 'Cerrado parcial', variant: 'warning' },
  archived: { label: 'Archivado', variant: 'outline' },
  open: { label: 'Abierto', variant: 'warning' },
  incorporated: { label: 'Incorporado', variant: 'info' },
  cancelled: { label: 'Cancelado', variant: 'default' },
};

const STATUS_ALIASES: Record<string, PlanningStatusKey> = {
  draft: 'draft',
  borrador: 'draft',
  approved: 'approved',
  aprobado: 'approved',
  optimized: 'optimized',
  optimizado: 'optimized',
  dispatched: 'dispatched',
  despachado: 'dispatched',
  completed: 'completed',
  cerrado: 'completed',
  partial: 'partial',
  'cerrado parcial': 'partial',
  archived: 'archived',
  archivado: 'archived',
  open: 'open',
  incorporated: 'incorporated',
  cancelled: 'cancelled',
};

export function normalizePlanningStatus(status: string | null | undefined): PlanningStatusKey {
  if (!status) return 'draft';
  const key = STATUS_ALIASES[status.toLowerCase().trim()];
  return key ?? 'draft';
}

export function planningStatusLabel(status: string | null | undefined): string {
  return PLANNING_STATUS[normalizePlanningStatus(status)].label;
}

export function planningStatusVariant(status: string | null | undefined): BadgeVariant {
  return PLANNING_STATUS[normalizePlanningStatus(status)].variant;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function tomorrowIso(from = new Date()): string {
  const date = new Date(from);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function optimizationDateHref(operationDate: string): string {
  return `/optimization?date=${operationDate}`;
}
