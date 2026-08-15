import { For, Show } from 'solid-js';
import { Check } from 'lucide-solid';
import {
  buildOptimizationExperienceSteps,
  type OptimizationExperienceStepId,
} from '../../core/planning/operationalFlowUx';

interface OptimizationExperienceStepperProps {
  dailyStatus?: string | null;
  hasResults: boolean;
  playbackOpen: boolean;
  weeklyPlanApproved: boolean;
  operationDate: string;
  dailyPlanId?: number;
  onOpenPlayback?: () => void;
}

export function OptimizationExperienceStepper(props: OptimizationExperienceStepperProps) {
  const steps = () =>
    buildOptimizationExperienceSteps({
      dailyStatus: props.dailyStatus,
      hasResults: props.hasResults,
      playbackOpen: props.playbackOpen,
      weeklyPlanApproved: props.weeklyPlanApproved,
    });

  const handleStepAction = (stepId: OptimizationExperienceStepId) => {
    if (stepId === 'playback' && props.onOpenPlayback) {
      props.onOpenPlayback();
    }
  };

  return (
    <nav
      aria-label="Experiencia del plan del día"
      class="rounded-xl border border-fero-blue/25 bg-fero-blue/5 px-4 py-3"
      data-testid="optimization-experience-stepper"
    >
      <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-fero-blue">
        Experiencia del día
      </p>
      <ol class="grid gap-2 md:grid-cols-3">
        <For each={steps()}>
          {(step, index) => {
            const isPlayback = () => step.id === 'playback';
            const canActivatePlayback = () =>
              isPlayback() && props.hasResults && step.status !== 'blocked';

            return (
              <li>
                <Show
                  when={canActivatePlayback()}
                  fallback={
                    <div
                      class={`rounded-lg border px-3 py-2 ${
                        step.status === 'current'
                          ? 'border-fero-blue/50 bg-elevated shadow-sm'
                          : step.status === 'complete'
                            ? 'border-fero-green/30 bg-fero-green/5'
                            : 'border-default bg-elevated/70 opacity-80'
                      }`}
                      aria-current={step.status === 'current' ? 'step' : undefined}
                    >
                      <StepContent step={step} index={index()} />
                    </div>
                  }
                >
                  <button
                    type="button"
                    class={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                      props.playbackOpen
                        ? 'border-fero-blue/50 bg-elevated shadow-sm'
                        : 'border-default bg-elevated hover:border-fero-blue/40'
                    }`}
                    aria-current={step.status === 'current' ? 'step' : undefined}
                    onClick={() => handleStepAction(step.id)}
                  >
                    <StepContent step={step} index={index()} />
                  </button>
                </Show>
              </li>
            );
          }}
        </For>
      </ol>
    </nav>
  );
}

function StepContent(props: {
  step: ReturnType<typeof buildOptimizationExperienceSteps>[number];
  index: number;
}) {
  return (
  <div class="flex items-start gap-2">
    <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-app text-[10px] font-bold text-text-secondary">
      <Show when={props.step.status === 'complete'} fallback={props.index + 1}>
        <Check size={12} class="text-fero-green-dark" />
      </Show>
    </span>
    <div>
      <p class="text-sm font-semibold text-text-primary">{props.step.label}</p>
      <p class="text-xs text-text-muted">{props.step.description}</p>
    </div>
  </div>
  );
}
