import { mondayIso } from '../api/planning';

export type DailyCalendarStatus = 'none' | 'draft' | 'optimized' | 'dispatched' | 'closed';

export const DAILY_CALENDAR_STATUS_STYLES: Record<
  DailyCalendarStatus,
  { cell: string; label: string }
> = {
  none: {
    cell: 'border-dashed border-slate-300 bg-slate-50 text-slate-400 dark:border-slate-600 dark:bg-slate-900/40',
    label: 'Sin plan',
  },
  draft: {
    cell: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800/60',
    label: 'Borrador',
  },
  optimized: {
    cell: 'border-fero-blue/40 bg-fero-blue/15 text-fero-blue',
    label: 'Optimizado',
  },
  dispatched: {
    cell: 'border-fero-green/40 bg-fero-green/15 text-fero-green-dark',
    label: 'Despachado',
  },
  closed: {
    cell: 'border-fero-green/50 bg-fero-green/25 text-fero-green-dark',
    label: 'Cerrado',
  },
};

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function mapDailyStatusToCalendar(status: string | null | undefined): DailyCalendarStatus {
  if (!status) return 'none';
  const normalized = status.toLowerCase();
  if (normalized === 'draft' || normalized === 'open') return 'draft';
  if (normalized === 'optimized') return 'optimized';
  if (normalized === 'dispatched') return 'dispatched';
  if (normalized === 'completed' || normalized === 'partial') return 'closed';
  return 'draft';
}

export function weekDaysFromMonday(weekStartIso: string): string[] {
  const days: string[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(weekStartIso);
    date.setDate(date.getDate() + offset);
    days.push(date.toISOString().slice(0, 10));
  }
  return days;
}

export function weekDayLabels(): string[] {
  return WEEKDAY_LABELS;
}

export function mondayOfDate(isoDate: string): string {
  return mondayIso(new Date(isoDate));
}

export function shiftWeek(weekStartIso: string, weeks: number): string {
  const date = new Date(weekStartIso);
  date.setDate(date.getDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}

export type DailyTimelineStepId = 'open' | 'optimize' | 'dispatch' | 'close';

export const DAILY_TIMELINE_STEPS: { id: DailyTimelineStepId; label: string }[] = [
  { id: 'open', label: 'Abrir' },
  { id: 'optimize', label: 'Optimizar' },
  { id: 'dispatch', label: 'Despachar' },
  { id: 'close', label: 'Cerrar' },
];

export function deriveDailyTimelineStep(
  status: string | null | undefined,
  hasOptimization: boolean,
): DailyTimelineStepId {
  const calendar = mapDailyStatusToCalendar(status);
  if (calendar === 'closed') return 'close';
  if (calendar === 'dispatched') return 'dispatch';
  if (calendar === 'optimized' || hasOptimization) return 'optimize';
  if (calendar === 'draft') return 'open';
  return 'open';
}

export function isTimelineStepComplete(
  step: DailyTimelineStepId,
  status: string | null | undefined,
  hasOptimization: boolean,
): boolean {
  const current = deriveDailyTimelineStep(status, hasOptimization);
  const order: DailyTimelineStepId[] = ['open', 'optimize', 'dispatch', 'close'];
  return order.indexOf(step) < order.indexOf(current);
}
