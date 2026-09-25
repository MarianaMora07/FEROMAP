import { For, Show, createResource } from 'solid-js';
import { A } from '@solidjs/router';
import { CalendarDays } from 'lucide-solid';
import { Card, CardHeader, LoadingPanel } from '../../design-system/components';
import { fetchActiveVisitSchedules } from '../../core/api/visitSchedules';

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAY_KEYS = [1, 2, 3, 4, 5, 6, 0];

function summarizeByDay(items: ReturnType<typeof filterSchedules>) {
  const byDay = new Map<number, { points: number; visits: number }>();
  for (const day of DAY_KEYS) byDay.set(day, { points: 0, visits: 0 });
  for (const item of items) {
    for (const wd of item.weekdays) {
      const agg = byDay.get(wd);
      if (agg) {
        agg.points += 1;
        agg.visits += item.visitsPerWeek;
      }
    }
  }
  return byDay;
}

function filterSchedules(items: { weekdays: number[]; visitsPerWeek: number; pointCode: string }[]) {
  return items.filter((item) => item.weekdays.length > 0);
}

export default function OperatorWeekPage() {
  const [schedules] = createResource(() => fetchActiveVisitSchedules());
  const filtered = () => filterSchedules(schedules() ?? []);
  const byDay = () => summarizeByDay(filtered());

  return (
    <div class="space-y-4" data-testid="operator-week">
      <div class="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Campo
          </p>
          <h1 id="page-title" class="font-heading text-xl font-bold text-text-primary dark:text-white">Mi semana</h1>
          <p class="mt-1 text-sm text-text-secondary">
            Frecuencias de recolección — solo lectura. La operación planifica el calendario.
          </p>
        </div>
        <A href="/operator" class="text-sm font-medium text-fero-blue hover:underline">
          Volver a mi operación
        </A>
      </div>

      <Card>
        <CardHeader
          title="Días de operación"
          subtitle="Puntos con visita programada por día de la semana"
          action={<CalendarDays size={18} class="text-fero-blue" aria-hidden="true" />}
        />
        <Show when={schedules.loading}>
          <LoadingPanel label="Cargando frecuencias…" indeterminate />
        </Show>
        <Show when={!schedules.loading}>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <For each={DAY_KEYS}>
              {(day) => {
                const agg = () => byDay().get(day) ?? { points: 0, visits: 0 };
                return (
                  <div
                    class="rounded-lg border border-default bg-surface px-3 py-3 text-center"
                    data-testid={`week-day-${day}`}
                  >
                    <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      {DAY_LABELS[DAY_KEYS.indexOf(day)]}
                    </p>
                    <p class="mt-1 text-xl font-bold text-text-primary dark:text-white">
                      {agg().points}
                    </p>
                    <p class="text-xs text-text-muted">puntos</p>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </Card>

      <Card>
        <CardHeader
          title="Frecuencias"
          subtitle={`${filtered().length} puntos con agenda activa`}
        />
        <Show when={schedules.loading}>
          <LoadingPanel label="Cargando…" indeterminate />
        </Show>
        <Show when={!schedules.loading && filtered().length === 0}>
          <p class="py-6 text-center text-sm text-text-secondary">
            Sin frecuencias activas por ahora.
          </p>
        </Show>
        <Show when={!schedules.loading && filtered().length > 0}>
          <ul class="max-h-[420px] divide-y divide-border overflow-y-auto" data-testid="week-schedules">
            <For each={filtered().slice(0, 80)}>
              {(item) => (
                <li class="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span class="font-medium text-text-primary dark:text-white">{item.pointCode}</span>
                  <span class="text-text-secondary">
                    {item.visitsPerWeek}×/sem ·{' '}
                    {item.weekdays
                      .map((wd) => DAY_LABELS[DAY_KEYS.indexOf(wd)] ?? String(wd))
                      .join(', ')}
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Card>
    </div>
  );
}
