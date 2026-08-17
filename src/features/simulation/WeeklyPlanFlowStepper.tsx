import { For, Show } from 'solid-js';
import { Check, Loader2 } from 'lucide-solid';
import {
  canReachWeeklyPlanStep,
  weeklyPlanFlowSteps,
} from '../../core/planning/weeklyPlanUx';

interface WeeklyPlanFlowStepperProps {
  flowStep: number;
  viewStep: number;
  onStepChange?: (step: number) => void;
  loading?: boolean;
  validating?: boolean;
  guideText?: string;
}

export function WeeklyPlanFlowStepper(props: WeeklyPlanFlowStepperProps) {
  const handleStepClick = (stepId: number) => {
    if (!canReachWeeklyPlanStep(stepId, props.flowStep) || !props.onStepChange) return;
    props.onStepChange(stepId);
  };

  return (
    <nav
      aria-label="Flujo directivo del plan semanal"
      aria-busy={props.loading ? 'true' : 'false'}
      data-testid="weekly-plan-stepper"
      class="rounded-xl border border-border bg-surface/50 px-4 py-3 dark:border-dark-border dark:bg-dark-surface/30"
    >
      <p id="weekly-plan-stepper-label" class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Flujo directivo
      </p>
      <ol class="flex flex-wrap items-center gap-2" aria-labelledby="weekly-plan-stepper-label">
        <For each={[...weeklyPlanFlowSteps]}>
          {(item, index) => {
            const isActive = () => props.viewStep === item.id;
            const isComplete = () => props.flowStep > item.id;
            const isReachable = () => canReachWeeklyPlanStep(item.id, props.flowStep);
            const isLoadingStep = () => Boolean(props.validating && item.id === 2 && props.flowStep === 2);

            const chipClass = () => {
              if (isActive()) return 'bg-fero-green-dark text-white';
              if (isComplete()) return 'bg-fero-green/15 text-fero-green-dark';
              if (isReachable()) return 'bg-slate-100 text-text-secondary dark:bg-dark-surface-hover';
              return 'bg-slate-100/60 text-text-muted opacity-60 dark:bg-dark-surface-hover/60';
            };

            return (
              <li class="flex items-center gap-2">
                <button
                  type="button"
                  aria-current={isActive() ? 'step' : undefined}
                  aria-disabled={!isReachable() ? 'true' : undefined}
                  disabled={!isReachable()}
                  onClick={() => handleStepClick(item.id)}
                  class={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${chipClass()} ${
                    isReachable() && !isActive() ? 'hover:ring-2 hover:ring-fero-green/30' : ''
                  } disabled:cursor-not-allowed`}
                >
                  <span
                    class={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                      isActive() ? 'bg-white/20' : 'bg-white dark:bg-dark-surface'
                    }`}
                    aria-hidden="true"
                  >
                    <Show
                      when={isLoadingStep()}
                      fallback={
                        <Show when={isComplete()} fallback={item.id}>
                          <Check size={12} />
                        </Show>
                      }
                    >
                      <Loader2 size={12} class="animate-spin" />
                    </Show>
                  </span>
                  <span>{item.label}</span>
                  <Show when={isLoadingStep()}>
                    <span class="sr-only">Validando plan semanal</span>
                  </Show>
                </button>
                <Show when={index() < weeklyPlanFlowSteps.length - 1}>
                  <span class="hidden h-px w-4 bg-border sm:block dark:bg-dark-border" aria-hidden="true" />
                </Show>
              </li>
            );
          }}
        </For>
      </ol>
      <Show when={props.guideText}>
        <p class="mt-2 text-sm text-text-secondary" data-testid="weekly-plan-step-guide">
          {props.guideText}
        </p>
      </Show>
    </nav>
  );
}
