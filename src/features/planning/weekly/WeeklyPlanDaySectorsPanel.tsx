import { ChevronDown } from 'lucide-solid';
import { For, Show, createMemo } from 'solid-js';
import type { WeeklyPlanDay } from '../../../core/api/planning';
import { formatWeekdayLabel } from '../../../core/planning/weeklyPlanCalendar';
import { buildWeeklyPlanSectorRows } from '../../../core/planning/weeklyPlanSectors';
import { getCollectionPointRef } from '../../../core/stores/weeklyPlanStore';

interface WeeklyPlanDaySectorsPanelProps {
  days: WeeklyPlanDay[];
}

function buildSectorRows(day: WeeklyPlanDay) {
  return buildWeeklyPlanSectorRows(day, getCollectionPointRef);
}

export function WeeklyPlanDaySectorsPanel(props: WeeklyPlanDaySectorsPanelProps) {
  const workdays = createMemo(() => (props.days ?? []).filter((day) => day.weekday <= 4));

  return (
    <div
      class="rounded-xl border border-border bg-surface/40 p-4 dark:border-dark-border"
      data-testid="weekly-plan-day-sectors"
    >
      <p class="text-sm font-semibold text-text-primary dark:text-white">Sectores por día</p>
      <p class="mt-0.5 text-xs text-text-muted">
        Despliega cada jornada (Lun–Vie) para revisar qué sectores se visitarán y cuántos puntos
        se atienden en cada uno.
      </p>

      <div class="mt-3 space-y-2">
        <For each={workdays()}>
          {(day) => {
            const rows = createMemo(() => buildSectorRows(day));
            return (
              <details class="group rounded-lg border border-border bg-app/40 dark:border-dark-border">
                <summary class="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2 marker:content-none">
                  <span class="flex items-baseline gap-2">
                    <span class="text-sm font-semibold text-text-primary dark:text-white">
                      {formatWeekdayLabel(day.weekday)}
                    </span>
                    <span class="text-xs text-text-muted">{day.operationDate}</span>
                  </span>
                  <span class="flex items-center gap-2 text-xs text-text-muted">
                    {day.collectionPointIds.length} puntos · {rows().length} sectores
                    <ChevronDown
                      size={14}
                      class="shrink-0 transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </span>
                </summary>
                <div class="flex flex-wrap gap-1.5 border-t border-border px-3 py-2 dark:border-dark-border">
                  <Show
                    when={rows().length > 0}
                    fallback={<span class="text-xs text-text-muted">Sin puntos asignados.</span>}
                  >
                    <For each={rows()}>
                      {(row) => (
                        <span class="inline-flex items-center gap-1 rounded-full border border-border bg-elevated px-2 py-0.5 text-[11px] text-text-secondary dark:border-dark-border dark:bg-dark-surface">
                          {row.name}
                          <span class="font-semibold text-text-primary dark:text-white">
                            {row.count}
                          </span>
                        </span>
                      )}
                    </For>
                  </Show>
                </div>
              </details>
            );
          }}
        </For>
      </div>
    </div>
  );
}
