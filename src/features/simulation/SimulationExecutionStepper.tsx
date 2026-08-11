import { For, Show } from 'solid-js';
import { Check, Circle, Loader2 } from 'lucide-solid';
import {
  EXECUTION_PHASES,
  type ExecutionPhaseId,
} from './executionPhases';

export type StepperPhaseStatus = 'completed' | 'active' | 'pending';

interface SimulationExecutionStepperProps {
  currentPhaseId: ExecutionPhaseId | null;
  isRunning: boolean;
  /** Tras completar, todas las fases muestran ✓ */
  completed?: boolean;
}

function phaseStatus(
  phaseId: ExecutionPhaseId,
  order: number,
  currentPhaseId: ExecutionPhaseId | null,
  completed: boolean,
): StepperPhaseStatus {
  if (completed || currentPhaseId === 'listo') return 'completed';
  if (!currentPhaseId) return 'pending';

  const current = EXECUTION_PHASES.find((item) => item.id === currentPhaseId);
  if (!current) return 'pending';
  if (order < current.order) return 'completed';
  if (phaseId === currentPhaseId) return 'active';
  return 'pending';
}

export function SimulationExecutionStepper(props: SimulationExecutionStepperProps) {
  const completed = () => props.completed ?? (!props.isRunning && props.currentPhaseId === 'listo');

  return (
    <nav
      aria-label="Etapas del cálculo de rutas"
      class="rounded-xl border border-border bg-slate-50/80 p-4 dark:border-dark-border dark:bg-dark-surface-hover/50"
      data-testid="execution-stepper"
    >
      <p class="mb-3 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        Etapas del cálculo
      </p>
      <ol class="space-y-0">
        <For each={[...EXECUTION_PHASES]}>
          {(phase, index) => {
            const status = () =>
              phaseStatus(phase.id, phase.order, props.currentPhaseId, completed());

            return (
              <li class="flex gap-3">
                <div class="flex flex-col items-center">
                  <span
                    class={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                      status() === 'completed'
                        ? 'border-fero-green-dark bg-fero-green-dark text-white'
                        : status() === 'active'
                          ? 'border-fero-green-mid bg-fero-green/15 text-fero-green-dark'
                          : 'border-border bg-surface text-text-muted dark:border-dark-border dark:bg-dark-surface'
                    }`}
                  >
                    <Show
                      when={status() === 'completed'}
                      fallback={
                        <Show
                          when={status() === 'active' && props.isRunning}
                          fallback={<Circle size={10} class="opacity-50" />}
                        >
                          <Loader2 size={14} class="animate-spin" />
                        </Show>
                      }
                    >
                      <Check size={14} stroke-width={2.5} />
                    </Show>
                  </span>
                  <Show when={index() < EXECUTION_PHASES.length - 1}>
                    <span
                      class={`my-1 w-px flex-1 min-h-4 ${
                        status() === 'completed' ? 'bg-fero-green-dark/50' : 'bg-border dark:bg-dark-border'
                      }`}
                    />
                  </Show>
                </div>
                <div
                  class={`pb-4 pt-0.5 ${
                    status() === 'active'
                      ? 'text-text-primary dark:text-white'
                      : status() === 'completed'
                        ? 'text-text-secondary'
                        : 'text-text-muted opacity-60'
                  }`}
                >
                  <p class={`text-sm ${status() === 'active' ? 'font-semibold' : 'font-medium'}`}>
                    {phase.label}
                  </p>
                  <Show when={status() === 'active'}>
                    <p class="mt-0.5 text-[11px] text-text-muted">En curso ahora</p>
                  </Show>
                </div>
              </li>
            );
          }}
        </For>
      </ol>
    </nav>
  );
}
