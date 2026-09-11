import { TrendingDown } from 'lucide-solid';
import { For, Show, createMemo } from 'solid-js';
import type { WeeklyPlanForecast } from '../../../core/api/planning';
import { normalizeWeeklyPlanForecast } from '../../../core/planning/planKpis';
import { formatWeekdayLabel, isoWeekdayMon0 } from '../../../core/planning/weeklyPlanCalendar';

interface WeeklyPlanForecastPanelProps {
  forecast: WeeklyPlanForecast | null | undefined;
  /** Etiqueta del origen del dato (p. ej. "validación en curso" vs "plan aprobado"). */
  source?: string;
}

function formatHours(hours: number | null | undefined): string {
  if (hours == null) return '—';
  return `${hours.toFixed(1)} h`;
}

function formatSaving(pct: number | null | undefined): string {
  if (pct == null) return '—';
  return `${pct.toFixed(1)}%`;
}

function formatCoverage(pct: number | null | undefined): string {
  if (pct == null) return '—';
  return `${pct.toFixed(1)}%`;
}

/**
 * Presenta las mejoras previstas del plan (contrato `WeeklyPlanForecast`): KPIs de la
 * semana y desglose por día, incluido el ahorro vs. línea base cuando está disponible.
 */
export function WeeklyPlanForecastPanel(props: WeeklyPlanForecastPanelProps) {
  const forecast = createMemo(() => normalizeWeeklyPlanForecast(props.forecast));
  const dayRows = createMemo(() => {
    const days = forecast()?.days ?? {};
    return Object.entries(days)
      .map(([operationDate, day]) => ({ operationDate, day }))
      .sort((a, b) => a.operationDate.localeCompare(b.operationDate));
  });

  return (
    <Show when={forecast()}>
      {(data) => (
        <section
          class="space-y-3 rounded-xl border border-fero-green/30 bg-fero-green/5 p-4 dark:border-fero-green/20 dark:bg-fero-green/10"
          data-testid="weekly-plan-forecast"
        >
          <div class="flex items-start gap-2">
            <TrendingDown size={18} class="mt-0.5 shrink-0 text-fero-green-dark" aria-hidden="true" />
            <div>
              <p class="text-sm font-semibold text-fero-green-dark">Mejoras previstas</p>
              <p class="mt-0.5 text-xs text-text-muted">
                {props.source
                  ? `${props.source}: el plan estima recorrer ${data().distanceKm.toFixed(1)} km.`
                  : `El plan estima recorrer ${data().distanceKm.toFixed(1)} km.`}
              </p>
            </div>
          </div>

          <dl class="grid gap-3 sm:grid-cols-4">
            <div class="rounded-lg border border-border bg-surface/70 px-3 py-2 dark:border-dark-border">
              <dt class="text-xs text-text-muted">Distancia</dt>
              <dd class="mt-0.5 text-xl font-bold text-text-primary dark:text-white">
                {data().distanceKm.toFixed(1)}
              </dd>
            </div>
            <div class="rounded-lg border border-border bg-surface/70 px-3 py-2 dark:border-dark-border">
              <dt class="text-xs text-text-muted">Duración</dt>
              <dd class="mt-0.5 text-xl font-bold text-text-primary dark:text-white">
                {formatHours(data().durationHours)}
              </dd>
            </div>
            <div class="rounded-lg border border-border bg-surface/70 px-3 py-2 dark:border-dark-border">
              <dt class="text-xs text-text-muted">Cobertura</dt>
              <dd class="mt-0.5 text-xl font-bold text-text-primary dark:text-white">
                {formatCoverage(data().coveragePct)}
              </dd>
              <p class="text-xs text-text-muted">
                {data().coveredPoints} de {data().scheduledPoints} puntos
              </p>
            </div>
            <div class="rounded-lg border border-border bg-surface/70 px-3 py-2 dark:border-dark-border">
              <dt class="text-xs text-text-muted">Ahorro vs. línea base</dt>
              <dd class="mt-0.5 text-xl font-bold text-fero-green-dark">
                {formatSaving(data().savingPct)}
              </dd>
              <Show when={data().baselineDistanceKm != null}>
                <p class="text-xs text-text-muted">
                  base {data().baselineDistanceKm!.toFixed(1)} km
                </p>
              </Show>
            </div>
          </dl>

          <Show when={dayRows().length > 0}>
            <div class="overflow-x-auto rounded-xl border border-border dark:border-dark-border">
              <table class="w-full min-w-130 text-sm" data-testid="weekly-plan-forecast-table">
                <thead>
                  <tr class="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted dark:border-dark-border">
                    <th class="px-3 py-2 font-semibold">Día</th>
                    <th class="px-3 py-2 text-right font-semibold">Km</th>
                    <th class="px-3 py-2 text-right font-semibold">Duración</th>
                    <th class="px-3 py-2 text-right font-semibold">Puntos</th>
                    <th class="px-3 py-2 text-right font-semibold">Cobertura</th>
                    <th class="px-3 py-2 text-right font-semibold">Ahorro</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border dark:divide-dark-border">
                  <For each={dayRows()}>
                    {(row) => (
                      <tr>
                        <td class="px-3 py-2 font-medium text-text-primary dark:text-white">
                          {formatWeekdayLabel(isoWeekdayMon0(row.operationDate))}
                          <span class="ml-2 text-xs font-normal text-text-muted">
                            {row.operationDate}
                          </span>
                        </td>
                        <td class="px-3 py-2 text-right text-text-secondary">
                          {row.day.distanceKm.toFixed(1)}
                        </td>
                        <td class="px-3 py-2 text-right text-text-secondary">
                          {formatHours(row.day.durationHours)}
                        </td>
                        <td class="px-3 py-2 text-right text-text-secondary">
                          {row.day.coveredPoints}/{row.day.scheduledPoints}
                        </td>
                        <td class="px-3 py-2 text-right text-text-secondary">
                          {row.day.coveragePct != null ? `${row.day.coveragePct.toFixed(1)}%` : '—'}
                        </td>
                        <td class="px-3 py-2 text-right font-semibold text-fero-green-dark">
                          {formatSaving(row.day.savingPct)}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </section>
      )}
    </Show>
  );
}
