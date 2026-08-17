import { A } from '@solidjs/router';
import { AlertTriangle, Check, ExternalLink } from 'lucide-solid';
import { For, Show } from 'solid-js';
import {
  weeklyPlanValidationWorkdayWarning,
  type WeeklyPlanPostApprovalStep,
  type WeeklyPlanValidationSummary,
} from '../../core/planning/weeklyPlanUx';
import { simulationResultsHref } from '../../core/utils/simulationLinks';

interface WeeklyPlanValidationResultPanelProps {
  summary: WeeklyPlanValidationSummary;
}

export function WeeklyPlanValidationResultPanel(props: WeeklyPlanValidationResultPanelProps) {
  const workdayWarning = () => weeklyPlanValidationWorkdayWarning(props.summary);
  const coverageLabel = () => {
    if (props.summary.uncoveredPoints > 0) {
      return `${props.summary.coveredPoints} cubiertos · ${props.summary.uncoveredPoints} sin cubrir`;
    }
    return `${props.summary.coveredPoints} cubiertos · cobertura completa`;
  };

  return (
    <div
      class="space-y-3 rounded-xl border border-fero-green/30 bg-fero-green/5 px-4 py-4 dark:border-fero-green/20 dark:bg-fero-green/10"
      data-testid="weekly-plan-validation-result"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-fero-green-dark">Resultado de validación</p>
          <p class="mt-1 text-xs text-text-muted">Simulación rápida ACO con los puntos de la semana</p>
        </div>
        <Show when={props.summary.simulationId}>
          <A
            href={simulationResultsHref(props.summary.simulationId)}
            class="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-fero-blue hover:underline"
            data-testid="weekly-plan-validation-detail-link"
          >
            Ver detalle
            <ExternalLink size={12} aria-hidden="true" />
          </A>
        </Show>
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-lg border border-border bg-surface/70 px-3 py-2 dark:border-dark-border">
          <p class="text-xs text-text-muted">Km estimados</p>
          <p class="text-2xl font-bold text-text-primary dark:text-white">
            {props.summary.distanceKm.toFixed(1)}
          </p>
        </div>
        <div class="rounded-lg border border-border bg-surface/70 px-3 py-2 dark:border-dark-border">
          <p class="text-xs text-text-muted">Puntos cubiertos</p>
          <p class="text-2xl font-bold text-text-primary dark:text-white">{props.summary.coveredPoints}</p>
          <p class="text-xs text-text-muted">{coverageLabel()}</p>
        </div>
        <div class="rounded-lg border border-border bg-surface/70 px-3 py-2 dark:border-dark-border">
          <p class="text-xs text-text-muted">Duración estimada</p>
          <p class="text-2xl font-bold text-text-primary dark:text-white">
            {props.summary.durationHours.toFixed(1)} h
          </p>
        </div>
      </div>

      <Show when={workdayWarning()}>
        <div class="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50/90 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-100">
          <AlertTriangle size={16} class="mt-0.5 shrink-0" aria-hidden="true" />
          <p>{workdayWarning()}</p>
        </div>
      </Show>

      <p class="text-xs text-text-muted">
        El detalle técnico abre en simulación de escenarios; no sustituye este flujo operativo de aprobación.
      </p>
    </div>
  );
}

interface WeeklyPlanApproveBlockedPanelProps {
  reason: string;
}

export function WeeklyPlanApproveBlockedPanel(props: WeeklyPlanApproveBlockedPanelProps) {
  return (
    <div
      class="rounded-xl border border-amber-300/70 bg-amber-50/90 px-4 py-4 dark:border-amber-900/40 dark:bg-amber-950/25"
      data-testid="weekly-plan-approve-blocked"
    >
      <p class="font-semibold text-amber-900 dark:text-amber-100">{props.reason}</p>
      <p class="mt-1 text-sm text-amber-800 dark:text-amber-200">
        Ejecuta la validación en el paso 2 antes de aprobar la semana.
      </p>
      <button
        type="button"
        disabled
        class="mt-3 inline-flex cursor-not-allowed items-center rounded-lg border border-amber-300/60 bg-white/60 px-4 py-2 text-sm font-semibold text-amber-900 opacity-80 dark:border-amber-900/40 dark:bg-dark-surface/40 dark:text-amber-100"
      >
        Aprobar plan
      </button>
    </div>
  );
}

interface WeeklyPlanPostApprovalChecklistProps {
  steps: WeeklyPlanPostApprovalStep[];
}

const statusClass = {
  complete: 'border-fero-green/40 bg-fero-green/10 text-fero-green-dark',
  current: 'border-fero-blue/50 bg-fero-blue/10 text-fero-blue ring-2 ring-fero-blue/20',
  upcoming: 'border-border bg-surface/50 text-text-secondary dark:border-dark-border',
};

export function WeeklyPlanPostApprovalChecklist(props: WeeklyPlanPostApprovalChecklistProps) {
  return (
    <div class="space-y-2" data-testid="weekly-plan-post-approval-checklist">
      <p class="text-sm font-semibold text-text-primary dark:text-white">Siguientes pasos en operación</p>
      <ol class="space-y-2">
        <For each={props.steps}>
          {(step, index) => (
            <li>
              <Show
                when={step.href && step.status !== 'complete'}
                fallback={
                  <div
                    class={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium ${statusClass[step.status]}`}
                  >
                    <span class="flex h-6 w-6 items-center justify-center rounded-full bg-white/70 text-xs dark:bg-dark-surface/70">
                      <Show when={step.status === 'complete'} fallback={index() + 1}>
                        <Check size={14} />
                      </Show>
                    </span>
                    {step.label}
                  </div>
                }
              >
                <A
                  href={step.href!}
                  class={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors hover:brightness-95 ${statusClass[step.status]}`}
                >
                  <span class="flex h-6 w-6 items-center justify-center rounded-full bg-white/70 text-xs dark:bg-dark-surface/70">
                    {index() + 1}
                  </span>
                  {step.label}
                </A>
              </Show>
            </li>
          )}
        </For>
      </ol>
    </div>
  );
}
