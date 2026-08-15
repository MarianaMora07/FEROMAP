import { For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowRight, Check } from 'lucide-solid';
import type { JourneyStepStatus, OperationalJourneyStep } from '../../core/planning/operationalFlowUx';

interface OperationalFlowStepperProps {
  steps: OperationalJourneyStep[];
  title?: string;
  compact?: boolean;
  class?: string;
}

const statusClass: Record<JourneyStepStatus, string> = {
  complete: 'border-fero-green/40 bg-fero-green/10 text-fero-green-dark',
  current: 'border-fero-blue/50 bg-fero-blue/10 text-fero-blue ring-2 ring-fero-blue/20',
  upcoming: 'border-default bg-elevated text-text-secondary',
  blocked: 'border-default bg-app text-text-muted opacity-60',
};

export function OperationalFlowStepper(props: OperationalFlowStepperProps) {
  return (
    <nav
      aria-label={props.title ?? 'Recorrido operativo'}
      class={`rounded-xl border border-default bg-elevated/60 px-4 py-3 ${props.class ?? ''}`}
      data-testid="operational-flow-stepper"
    >
      <Show when={props.title}>
        <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{props.title}</p>
      </Show>
      <ol class="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <For each={props.steps}>
          {(step, index) => (
            <li class="flex items-center gap-2">
              <Show when={index() > 0}>
                <ArrowRight size={14} class="hidden shrink-0 text-text-muted lg:block" aria-hidden="true" />
              </Show>
              <A
                href={step.status === 'blocked' ? '#' : step.href}
                class={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  statusClass[step.status]
                } ${step.status === 'blocked' ? 'pointer-events-none' : 'hover:brightness-95'}`}
                aria-current={step.status === 'current' ? 'step' : undefined}
                onClick={(event) => {
                  if (step.status === 'blocked') event.preventDefault();
                }}
              >
                <span class="flex h-5 w-5 items-center justify-center rounded-full bg-elevated/80 text-[10px]">
                  <Show when={step.status === 'complete'} fallback={index() + 1}>
                    <Check size={12} />
                  </Show>
                </span>
                <span>{props.compact ? step.shortLabel : step.label}</span>
              </A>
            </li>
          )}
        </For>
      </ol>
    </nav>
  );
}
