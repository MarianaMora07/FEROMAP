import { A } from '@solidjs/router';
import { ArrowRight, CheckCircle2 } from 'lucide-solid';
import { For, Show } from 'solid-js';
import { Button, LoadingPanel } from '../../design-system/components';
import { optimizationDateHref, todayIso } from '../../core/planning/planningUx';
import { formatWeekdayLabel } from '../../core/planning/weeklyPlanCalendar';
import {
  buildWeeklyPlanPostApprovalChecklist,
  weeklyPlanApproveBlockReason,
  weeklyPlanScheduledPointCount,
} from '../../core/planning/weeklyPlanUx';
import type { WeeklyPlan } from '../../core/api/planning';
import type { ScenarioId } from '../../data/types/simulation';
import { weeklyPlanState } from '../../core/stores/weeklyPlanStore';
import { WeeklyPlanConfigurePanel } from './WeeklyPlanConfigurePanel';
import {
  WeeklyPlanApproveBlockedPanel,
  WeeklyPlanPostApprovalChecklist,
  WeeklyPlanValidationResultPanel,
} from './WeeklyPlanClosurePanels';

interface WeeklyPlanStepPanelsProps {
  step: number;
  plan: WeeklyPlan;
  editable: boolean;
  scenarios: Array<{ id: ScenarioId; label: string }>;
  onScenarioChange: (scenarioId: ScenarioId) => void;
  onAutofill: () => void;
  onSaveDraft: () => void;
  onValidate: () => void;
  onApprove: () => void;
}

export function WeeklyPlanStepPanels(props: WeeklyPlanStepPanelsProps) {
  const totalPoints = () => weeklyPlanScheduledPointCount(props.plan);
  const validationSummary = () => weeklyPlanState.validationSummary;
  const approveBlockReason = () => weeklyPlanApproveBlockReason(weeklyPlanState.validationCompleted);
  const postApprovalSteps = () => buildWeeklyPlanPostApprovalChecklist();

  return (
    <>
      <Show when={props.step === 1}>
        <WeeklyPlanConfigurePanel
          plan={props.plan}
          editable={props.editable}
          scenarios={props.scenarios}
          onScenarioChange={props.onScenarioChange}
          onAutofill={props.onAutofill}
          onSaveDraft={props.onSaveDraft}
        />
      </Show>

      <Show when={props.step === 2}>
        <div class="space-y-4" data-testid="weekly-plan-step-2">
          <div class="rounded-lg border border-border bg-surface/50 px-4 py-3 dark:border-dark-border">
            <p class="text-sm text-text-secondary">Puntos programados en la semana</p>
            <p class="mt-1 text-3xl font-bold text-fero-green-dark">{totalPoints()}</p>
            <p class="mt-1 text-xs text-text-muted">
              Condición: {props.scenarios.find((row) => row.id === props.plan.scenarioId)?.label ?? props.plan.scenarioId}
            </p>
          </div>

          <div class="grid gap-2 sm:grid-cols-5">
            <For each={props.plan.days ?? []}>
              {(day) => (
                <div class="rounded-lg border border-border px-3 py-2 text-center dark:border-dark-border">
                  <p class="text-xs font-semibold text-text-primary dark:text-white">
                    {formatWeekdayLabel(day.weekday)}
                  </p>
                  <p class="text-lg font-bold text-text-primary dark:text-white">{day.collectionPointIds.length}</p>
                </div>
              )}
            </For>
          </div>

          <Show when={weeklyPlanState.isValidating}>
            <LoadingPanel label="Validando con simulación ACO…" progress={weeklyPlanState.validationProgress} />
          </Show>

          <Show when={!weeklyPlanState.isValidating && validationSummary()}>
            {(summary) => <WeeklyPlanValidationResultPanel summary={summary()} />}
          </Show>

          <Show when={props.editable && totalPoints() > 0 && !weeklyPlanState.isValidating}>
            <Button
              variant="primary"
              class="gap-2"
              loading={weeklyPlanState.isValidating}
              onClick={() => props.onValidate()}
              data-testid="weekly-plan-primary-cta"
            >
              {validationSummary() ? 'Volver a validar' : 'Validar con simulación'}
              <ArrowRight size={14} />
            </Button>
          </Show>

          <Show when={props.editable && totalPoints() === 0}>
            <p class="text-sm text-amber-700 dark:text-amber-200">
              Asigna puntos en el paso 1 antes de validar.
            </p>
          </Show>
        </div>
      </Show>

      <Show when={props.step === 3}>
        <div class="space-y-4" data-testid="weekly-plan-step-3">
          <Show
            when={validationSummary()}
            fallback={
              <p class="text-sm text-text-secondary">
                Completa la validación en el paso anterior para ver los indicadores.
              </p>
            }
          >
            {(summary) => <WeeklyPlanValidationResultPanel summary={summary()} />}
          </Show>

          <Show when={props.editable && approveBlockReason()}>
            {(reason) => <WeeklyPlanApproveBlockedPanel reason={reason()} />}
          </Show>

          <Show when={props.editable && weeklyPlanState.validationCompleted}>
            <Button
              variant="primary"
              class="gap-2"
              loading={weeklyPlanState.isApproving}
              onClick={() => props.onApprove()}
              data-testid="weekly-plan-primary-cta"
            >
              Aprobar plan
              <ArrowRight size={14} />
            </Button>
          </Show>
        </div>
      </Show>

      <Show when={props.step === 4}>
        <div class="space-y-4" data-testid="weekly-plan-step-4">
          <div class="flex items-start gap-3 rounded-lg border border-fero-green/40 bg-fero-green/10 px-4 py-3">
            <CheckCircle2 size={22} class="mt-0.5 shrink-0 text-fero-green-dark" aria-hidden="true" />
            <div>
              <p class="font-semibold text-fero-green-dark">
                {props.plan.status === 'archived' ? 'Plan archivado' : 'Semana lista para operación'}
              </p>
              <p class="mt-1 text-sm text-text-secondary">
                {props.plan.status === 'archived'
                  ? 'Solo consulta. Crea un borrador en una semana futura si necesitas planificar de nuevo.'
                  : 'El equipo administrativo ya puede optimizar rutas y despachar el plan del día.'}
              </p>
            </div>
          </div>

          <Show when={props.plan.status === 'approved'}>
            <WeeklyPlanPostApprovalChecklist steps={postApprovalSteps()} />
            <A href={optimizationDateHref(todayIso())}>
              <Button variant="primary" class="gap-2" data-testid="weekly-plan-primary-cta">
                Ir a planificación operativa
                <ArrowRight size={14} />
              </Button>
            </A>
          </Show>
        </div>
      </Show>
    </>
  );
}
