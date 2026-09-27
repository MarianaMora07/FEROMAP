import { For, Show } from 'solid-js';
import { simulationSteps } from './simulationConfig';

interface WizardStepNavProps {
  step: number;
  hasResults: boolean;
  onStepChange: (step: number) => void;
  /** Sub-estado visible en paso 2 durante la ejecución, p. ej. «Ejecutando — fase 3 de 8» */
  executionSubstatus?: string | null;
}

export function WizardStepNav(props: WizardStepNavProps) {
  const canNavigateTo = (target: number) => {
    if (target === 1 || target === 2) return true;
    if (target === 3) return props.hasResults;
    return false;
  };

  return (
    <div class="flex flex-col gap-1.5" data-testid="wizard-step-nav">
      <div class="flex flex-wrap items-center gap-2 sm:gap-3">
        <For each={[...simulationSteps]}>
          {(s, i) => (
            <div class="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                disabled={!canNavigateTo(s.id)}
                onClick={() => canNavigateTo(s.id) && props.onStepChange(s.id)}
                aria-current={props.step === s.id ? 'step' : undefined}
                class={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm disabled:cursor-not-allowed disabled:opacity-45 ${
                  props.step === s.id
                    ? 'bg-fero-green-dark text-white'
                    : props.step > s.id || (s.id === 3 && props.hasResults)
                      ? 'bg-fero-green/20 text-fero-green-dark'
                      : 'bg-slate-100 text-text-muted dark:bg-dark-surface-hover'
                }`}
              >
                <span
                  class={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                    props.step === s.id ? 'bg-white/20' : 'bg-white dark:bg-dark-surface'
                  }`}
                >
                  {s.id}
                </span>
                {s.label}
              </button>
              <Show when={i() < simulationSteps.length - 1}>
                <span class="hidden h-px w-6 bg-border sm:block dark:bg-dark-border" />
              </Show>
            </div>
          )}
        </For>
      </div>
      <Show when={props.step === 2 && props.executionSubstatus}>
        <p
          class="text-xs font-medium text-fero-green-dark sm:text-sm"
          data-testid="wizard-execution-substatus"
          aria-live="polite"
          aria-atomic="true"
        >
          {props.executionSubstatus}
        </p>
      </Show>
    </div>
  );
}
