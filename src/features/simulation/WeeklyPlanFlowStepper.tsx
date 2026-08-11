import { For, Show } from 'solid-js';
import { Check, Loader2 } from 'lucide-solid';

export const weeklyPlanFlowSteps = [
  { id: 1, label: 'Configurar días' },
  { id: 2, label: 'Validar (ACO)' },
  { id: 3, label: 'Aprobar' },
  { id: 4, label: 'Ir al día' },
] as const;

interface WeeklyPlanFlowStepperProps {
  step: number;
  loading?: boolean;
}

export function WeeklyPlanFlowStepper(props: WeeklyPlanFlowStepperProps) {
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
            const isActive = () => props.step === item.id;
            const isComplete = () => props.step > item.id;
            const isLoadingStep = () => Boolean(props.loading && isActive());

            return (
              <li class="flex items-center gap-2">
                <div
                  aria-current={isActive() ? 'step' : undefined}
                  class={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                    isActive()
                      ? 'bg-fero-green-dark text-white'
                      : isComplete()
                        ? 'bg-fero-green/15 text-fero-green-dark'
                        : 'bg-slate-100 text-text-muted dark:bg-dark-surface-hover'
                  }`}
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
                    <span class="sr-only">Cargando paso actual</span>
                  </Show>
                </div>
                <Show when={index() < weeklyPlanFlowSteps.length - 1}>
                  <span class="hidden h-px w-4 bg-border sm:block dark:bg-dark-border" aria-hidden="true" />
                </Show>
              </li>
            );
          }}
        </For>
      </ol>
    </nav>
  );
}
