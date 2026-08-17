import { For, Show } from 'solid-js';
import { Check, Loader2 } from 'lucide-solid';
import {
  DAILY_TIMELINE_STEPS,
  deriveDailyTimelineStep,
  isTimelineStepComplete,
  type DailyTimelineStepId,
} from '../../core/planning/dailyPlanningUx';
import { optimizationState } from '../../core/stores/optimizationStore';
import { weeklyPlanHref } from '../../core/planning/weeklyPlanLinks';

const WEEKLY_PLAN_TOOLTIP = 'Falta aprobar plan semanal';

function stepBlocked(step: DailyTimelineStepId): boolean {
  if (optimizationState.weeklyPlanApproved) return false;
  return step !== 'open';
}

function stepTooltip(step: DailyTimelineStepId): string | undefined {
  if (stepBlocked(step)) return WEEKLY_PLAN_TOOLTIP;
  return undefined;
}

export function DailyPlanTimeline() {
  const status = () => optimizationState.dailyPlan?.status ?? null;
  const hasOptimization = () =>
    optimizationState.lastSimulationId != null || optimizationState.kpis != null;
  const activeStep = () => deriveDailyTimelineStep(status(), hasOptimization());
  const loading = () => optimizationState.isLoadingDailyPlan;

  return (
    <nav
      aria-label="Ciclo administrativo del día"
      aria-busy={loading() ? 'true' : 'false'}
      data-testid="daily-timeline-stepper"
      class="rounded-xl border border-default bg-elevated/50 px-4 py-3"
    >
      <p id="daily-timeline-label" class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Ciclo del día
      </p>
      <ol class="flex flex-wrap items-center gap-2" aria-labelledby="daily-timeline-label">
        <For each={[...DAILY_TIMELINE_STEPS]}>
          {(step, index) => {
            const complete = () => isTimelineStepComplete(step.id, status(), hasOptimization());
            const active = () => activeStep() === step.id;
            const blocked = () => stepBlocked(step.id);
            const isLoadingStep = () => loading() && active();

            return (
              <li class="flex items-center gap-2">
                <div
                  title={stepTooltip(step.id)}
                  aria-current={active() ? 'step' : undefined}
                  aria-disabled={blocked() ? 'true' : undefined}
                  class={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                    blocked()
                      ? 'cursor-not-allowed bg-app text-slate-400 opacity-60'
                      : active()
                        ? 'bg-fero-green-dark text-white'
                        : complete()
                          ? 'bg-fero-green/15 text-fero-green-dark'
                          : 'bg-app text-text-muted'
                  }`}
                >
                  <span
                    class={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                      active() ? 'bg-elevated/20' : 'bg-elevated'
                    }`}
                    aria-hidden="true"
                  >
                    <Show
                      when={isLoadingStep()}
                      fallback={
                        <Show when={complete() && !blocked()} fallback={index() + 1}>
                          <Check size={12} />
                        </Show>
                      }
                    >
                      <Loader2 size={12} class="animate-spin" />
                    </Show>
                  </span>
                  <span>{step.label}</span>
                  <Show when={isLoadingStep()}>
                    <span class="sr-only">Cargando plan del día</span>
                  </Show>
                </div>
                <Show when={index() < DAILY_TIMELINE_STEPS.length - 1}>
                  <span class="hidden h-px w-4 bg-default sm:block" aria-hidden="true" />
                </Show>
              </li>
            );
          }}
        </For>
      </ol>
      <Show when={!optimizationState.weeklyPlanApproved}>
        <p class="mt-2 text-xs text-amber-700 dark:text-amber-400" role="status" aria-live="polite">
          {WEEKLY_PLAN_TOOLTIP}. Ve a{' '}
          <a href={weeklyPlanHref} class="font-medium underline">
            Plan semanal
          </a>
          .
        </p>
      </Show>
    </nav>
  );
}
