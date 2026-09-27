import { For, Show, createMemo } from 'solid-js';
import type { WeeklyPlan, WeeklyPlanDay } from '../../../core/api/planning';
import { formatWeekdayLabel } from '../../../core/planning/weeklyPlanCalendar';
import { buildWeeklyPlanSectorRows } from '../../../core/planning/weeklyPlanSectors';
import { weeklyPlanSavingPct } from '../../../core/planning/weeklyPlanUx';
import { getCollectionPointRef } from '../../../core/stores/weeklyPlanStore';

interface WeeklyPlanApprovedDayTableProps {
  plan: WeeklyPlan;
}

/**
 * Resumen de lo que se hará cada día una vez aprobada la semana. Se alimenta de
 * la cobertura persistida del plan (`plan.days`), no de la previsualización no
 * persistida, para que siga visible al recargar o cambiar de semana.
 */
export function WeeklyPlanApprovedDayTable(props: WeeklyPlanApprovedDayTableProps) {
  const workdays = createMemo(() => (props.plan.days ?? []).filter((day) => day.weekday <= 4));
  const activeDays = createMemo(() => workdays().filter((day) => day.collectionPointIds.length > 0));
  const totalPoints = createMemo(() =>
    workdays().reduce((sum, day) => sum + day.collectionPointIds.length, 0),
  );
  const hasVehicleColumn = createMemo(() =>
    workdays().some((day) => (day.expectedVehicleCount ?? 0) > 0),
  );
  const sectorRows = (day: WeeklyPlanDay) => buildWeeklyPlanSectorRows(day, getCollectionPointRef);

  return (
    <section
      class="space-y-3 rounded-xl border border-border bg-surface/40 p-4 dark:border-dark-border"
      data-testid="weekly-plan-approved-days"
    >
      <div>
        <p class="text-sm font-semibold text-text-primary dark:text-white">Qué se hará cada día</p>
        <p class="mt-0.5 text-xs text-text-muted">
          Cobertura congelada al aprobar la semana: {activeDays().length} día(s) con puntos y{' '}
          {totalPoints()} punto(s) programado(s) en total.
        </p>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full min-w-180 text-sm" data-testid="weekly-plan-approved-days-table">
          <thead>
            <tr class="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted dark:border-dark-border">
              <th class="px-2 py-2 font-semibold">Día</th>
              <th class="px-2 py-2 font-semibold">Fecha</th>
              <th class="px-2 py-2 text-center font-semibold">Puntos</th>
              <Show when={hasVehicleColumn()}>
                <th class="px-2 py-2 text-center font-semibold">Camiones prev.</th>
              </Show>
              <th class="px-2 py-2 text-right font-semibold">Km</th>
              <th class="px-2 py-2 text-right font-semibold">Duración</th>
              <th class="px-2 py-2 text-right font-semibold">Cobertura</th>
              <th class="px-2 py-2 text-right font-semibold">Ahorro</th>
              <th class="px-2 py-2 font-semibold">Zonas</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border dark:divide-dark-border">
            <For each={workdays()}>
              {(day) => {
                const rows = createMemo(() => sectorRows(day));
                const forecastDay = () => props.plan.expectedKpis?.days?.[day.operationDate] ?? null;
                const saving = () => {
                  const entry = forecastDay();
                  return entry
                    ? weeklyPlanSavingPct(entry.baselineDistanceKm ?? null, entry.distanceKm)
                    : null;
                };
                return (
                  <tr>
                    <td class="px-2 py-2 font-medium text-text-primary dark:text-white">
                      {formatWeekdayLabel(day.weekday)}
                    </td>
                    <td class="px-2 py-2 text-text-secondary">{day.operationDate}</td>
                    <td class="px-2 py-2 text-center font-semibold text-text-primary dark:text-white">
                      {day.collectionPointIds.length}
                    </td>
                    <Show when={hasVehicleColumn()}>
                      <td class="px-2 py-2 text-center text-text-secondary">
                        {day.expectedVehicleCount ?? '—'}
                      </td>
                    </Show>
                    <td class="px-2 py-2 text-right text-text-secondary">
                      {forecastDay() ? forecastDay()!.distanceKm.toFixed(1) : '—'}
                    </td>
                    <td class="px-2 py-2 text-right text-text-secondary">
                      {forecastDay() ? `${forecastDay()!.durationHours.toFixed(1)} h` : '—'}
                    </td>
                    <td class="px-2 py-2 text-right text-text-secondary">
                      {forecastDay()?.coveragePct != null
                        ? `${forecastDay()!.coveragePct!.toFixed(1)}%`
                        : '—'}
                    </td>
                    <td class="px-2 py-2 text-right font-semibold text-fero-green-dark">
                      {saving() != null ? `${saving()!.toFixed(1)}%` : '—'}
                    </td>
                    <td class="px-2 py-2 align-top">
                      <Show
                        when={rows().length > 0}
                        fallback={<span class="text-xs text-text-muted">Sin puntos asignados.</span>}
                      >
                        <details class="group">
                          <summary class="cursor-pointer list-none text-xs font-medium text-fero-blue marker:content-none">
                            {rows().length} zona(s)
                          </summary>
                          <div class="mt-1.5 flex flex-wrap gap-1.5">
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
                          </div>
                        </details>
                      </Show>
                    </td>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
      </div>
    </section>
  );
}
