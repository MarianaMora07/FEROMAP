import { For, Show } from 'solid-js';
import { ChevronLeft, ChevronRight } from 'lucide-solid';
import { Button } from '../../design-system/components';
import {
  DAILY_CALENDAR_STATUS_STYLES,
  shiftWeek,
  weekDayLabels,
} from '../../core/planning/dailyPlanningUx';
import {
  optimizationState,
  refreshWeekCalendar,
} from '../../core/stores/optimizationStore';

interface OptimizationWeekCalendarProps {
  selectedDate: string;
  onDateSelect: (date: string) => void;
}

export function OptimizationWeekCalendar(props: OptimizationWeekCalendarProps) {
  const labels = weekDayLabels();

  const handlePrevWeek = () => {
    const prev = shiftWeek(optimizationState.weekStartDate, -1);
    void refreshWeekCalendar(prev);
  };

  const handleNextWeek = () => {
    const next = shiftWeek(optimizationState.weekStartDate, 1);
    void refreshWeekCalendar(next);
  };

  return (
    <div class="rounded-xl border border-default bg-elevated/50 p-3">
      <div class="mb-3 flex items-center justify-between gap-2">
        <p class="text-sm font-semibold text-text-primary">Semana operativa</p>
        <div class="flex items-center gap-1">
          <Button size="sm" variant="outline" class="px-2" onClick={handlePrevWeek}>
            <ChevronLeft size={14} />
          </Button>
          <span class="min-w-28 text-center text-xs text-text-muted">
            {optimizationState.weekStartDate}
          </span>
          <Button size="sm" variant="outline" class="px-2" onClick={handleNextWeek}>
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
      <Show
        when={!optimizationState.isLoadingCalendar}
        fallback={<p class="py-4 text-center text-xs text-text-muted">Cargando calendario…</p>}
      >
        <div class="grid grid-cols-7 gap-1.5">
          <For each={labels}>
            {(label) => (
              <p class="text-center text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                {label}
              </p>
            )}
          </For>
          <For each={optimizationState.weekCalendar}>
            {(day) => {
              const style = () => DAILY_CALENDAR_STATUS_STYLES[day.status];
              const selected = () => props.selectedDate === day.operationDate;
              const dayNumber = () => day.operationDate.slice(8, 10);
              return (
                <button
                  type="button"
                  title={`${day.operationDate} — ${style().label}${day.pendingCount > 0 ? ` · ${day.pendingCount} pendiente(s)` : ''}`}
                  class={`relative rounded-lg border px-1 py-2 text-center transition-all ${style().cell} ${
                    selected() ? 'ring-2 ring-fero-green-mid ring-offset-1 dark:ring-offset-dark-surface' : 'hover:opacity-90'
                  }`}
                  onClick={() => props.onDateSelect(day.operationDate)}
                >
                  <span class="text-sm font-bold">{dayNumber()}</span>
                  <Show when={day.pendingCount > 0}>
                    <span class="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
                      {day.pendingCount}
                    </span>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
        <ul class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-text-muted">
          <For each={Object.entries(DAILY_CALENDAR_STATUS_STYLES)}>
            {([status, meta]) => (
              <li class="inline-flex items-center gap-1">
                <span class={`inline-block h-2.5 w-2.5 rounded-sm border ${meta.cell}`} />
                {meta.label}
              </li>
            )}
          </For>
          <li class="inline-flex items-center gap-1">
            <span class="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white">
              n
            </span>
            Carry-over pendientes
          </li>
        </ul>
      </Show>
    </div>
  );
}
