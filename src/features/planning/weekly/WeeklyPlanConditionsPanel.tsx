import { Gauge, Truck } from 'lucide-solid';
import { For, Show, createMemo } from 'solid-js';
import type { WeeklyPlan } from '../../../core/api/planning';
import { mergeWeekCalendarDays } from '../../../core/planning/weeklyPlanCalendar';
import { weeklyPlanScheduledPointCount } from '../../../core/planning/weeklyPlanUx';
import type { ScenarioId } from '../../../data/types/simulation';

interface WeeklyPlanConditionsPanelProps {
  plan: WeeklyPlan;
  scenarios: Array<{ id: ScenarioId; label: string }>;
}

/**
 * Resumen de las condiciones iniciales con las que se ejecutará el algoritmo:
 * escenario, caso, flota y cobertura.
 */
export function WeeklyPlanConditionsPanel(props: WeeklyPlanConditionsPanelProps) {
  const workdays = createMemo(() =>
    mergeWeekCalendarDays(props.plan.weekStartDate, props.plan.days ?? []).filter(
      (day) => day.weekday <= 4,
    ),
  );
  const activeDays = createMemo(
    () => workdays().filter((day) => day.collectionPointIds.length > 0).length,
  );
  const pointCount = createMemo(() => weeklyPlanScheduledPointCount(props.plan));
  const sectorCount = createMemo(() => {
    const ids = new Set<number>();
    for (const day of workdays()) {
      for (const id of day.sectorIds) ids.add(id);
    }
    return ids.size;
  });
  const fleetEntries = createMemo(() => Object.entries(props.plan.fleetByType ?? {}));
  const scenarioLabel = createMemo(
    () =>
      props.scenarios.find((row) => row.id === props.plan.scenarioId)?.label ??
      props.plan.scenarioId,
  );
  const caseLabel = createMemo(
    () => props.plan.caseStudyName ?? props.plan.caseStudyCode ?? null,
  );

  return (
    <section
      class="space-y-3 rounded-xl border border-border bg-surface/40 p-4 dark:border-dark-border"
      data-testid="weekly-plan-conditions"
    >
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="flex items-start gap-2">
          <Gauge size={18} class="mt-0.5 shrink-0 text-fero-blue" aria-hidden="true" />
          <div>
            <p class="text-sm font-semibold text-text-primary dark:text-white">
              Condiciones de la semana
            </p>
            <p class="mt-0.5 text-xs text-text-muted">
              Con esto se ejecuta el algoritmo ACO: escenario, caso, flota y cobertura.
            </p>
          </div>
        </div>
      </div>

      <dl class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-lg border border-border bg-surface/70 px-3 py-2 dark:border-dark-border">
          <dt class="text-xs text-text-muted">Condición</dt>
          <dd class="mt-0.5 text-sm font-semibold text-text-primary dark:text-white">
            {scenarioLabel()}
          </dd>
        </div>
        <div class="rounded-lg border border-border bg-surface/70 px-3 py-2 dark:border-dark-border">
          <dt class="text-xs text-text-muted">Caso de estudio</dt>
          <dd class="mt-0.5 text-sm font-semibold text-text-primary dark:text-white">
            {caseLabel() ?? 'Sin caso (puntos manuales)'}
          </dd>
        </div>
        <div class="rounded-lg border border-border bg-surface/70 px-3 py-2 dark:border-dark-border">
          <dt class="text-xs text-text-muted">Cobertura configurada</dt>
          <dd class="mt-0.5 text-sm text-text-secondary">
            <span class="font-semibold text-text-primary dark:text-white">{pointCount()}</span>{' '}
            punto(s) · <span class="font-semibold text-text-primary dark:text-white">{sectorCount()}</span>{' '}
            zona(s) · {activeDays()} día(s) activo(s)
          </dd>
        </div>
        <div class="rounded-lg border border-border bg-surface/70 px-3 py-2 dark:border-dark-border">
          <dt class="flex items-center gap-1 text-xs text-text-muted">
            <Truck size={12} aria-hidden="true" /> Flota por tipo
          </dt>
          <dd class="mt-1 flex flex-wrap gap-1.5">
            <Show
              when={fleetEntries().length > 0}
              fallback={<span class="text-sm text-text-secondary">Toda la flota disponible</span>}
            >
              <For each={fleetEntries()}>
                {([type, count]) => (
                  <span class="inline-flex items-center gap-1 rounded-full border border-border bg-elevated px-2 py-0.5 text-[11px] text-text-secondary dark:border-dark-border dark:bg-dark-surface">
                    {type}
                    <span class="font-semibold text-text-primary dark:text-white">{count}</span>
                  </span>
                )}
              </For>
            </Show>
          </dd>
        </div>
      </dl>
    </section>
  );
}
