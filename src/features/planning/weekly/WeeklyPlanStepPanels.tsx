import { useNavigate } from '@solidjs/router';
import { ArrowRight, CheckCircle2, Eye } from 'lucide-solid';
import { Show } from 'solid-js';
import { Button, LoadingPanel } from '../../../design-system/components';
import {
  buildWeeklyPlanForecastFromValidation,
  buildWeeklyPlanPostApprovalChecklist,
  weeklyPlanApproveBlockReason,
  weeklyPlanPreflightIssues,
  weeklyPlanScheduledPointCount,
} from '../../../core/planning/weeklyPlanUx';
import type { WeeklyPlan } from '../../../core/api/planning';
import type { ScenarioId } from '../../../data/types/simulation';
import { weeklyPlanState, generateWeeklyOperationalPlanForWeek } from '../../../core/stores/weeklyPlanStore';
import { optimizationHref } from '../../../core/planning/operationalLinks';
import { WeeklyPlanConfigurePanel } from './WeeklyPlanConfigurePanel';
import {
  WeeklyPlanApproveBlockedPanel,
  WeeklyPlanDayPreviewPanel,
  WeeklyPlanPostApprovalChecklist,
  WeeklyPlanPreflightWarningPanel,
  WeeklyPlanValidationResultPanel,
} from './WeeklyPlanClosurePanels';
import { WeeklyPlanForecastPanel } from './WeeklyPlanForecastPanel';
import { WeeklyPlanOperationalSection } from './WeeklyPlanOperationalSection';
import { WeeklyPlanApprovedDayTable } from './WeeklyPlanApprovedDayTable';
import { WeeklyPlanDaySectorsPanel } from './WeeklyPlanDaySectorsPanel';

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
  const navigate = useNavigate();
  const totalPoints = () => weeklyPlanScheduledPointCount(props.plan);
  const validationSummary = () => weeklyPlanState.validationSummary;
  const approveBlockReason = () => weeklyPlanApproveBlockReason(weeklyPlanState.validationCompleted);
  const postApprovalSteps = () => buildWeeklyPlanPostApprovalChecklist();
  // Aviso de viabilidad (pre-flight) antes de validar; ya se recomputó al configurar.
  const preflightIssues = () => weeklyPlanPreflightIssues(weeklyPlanState.preflight);
  // Mejoras previstas de la validación en curso (no persistida) para el paso de aprobación.
  const liveForecast = () =>
    buildWeeklyPlanForecastFromValidation(validationSummary()?.days ?? [], props.plan.weekStartDate);

  // El plan operativo ya generado habilita la aprobación; si no, "Ver plan" lo genera
  // y abre la planificación operativa para revisarlo antes de aprobar.
  const planGenerated = () => (props.plan.operationalPlan?.days?.length ?? 0) > 0;

  const handleViewPlan = async () => {
    try {
      const days = await generateWeeklyOperationalPlanForWeek();
      const target = days.find((day) => day.dailyPlanId != null) ?? days[0];
      if (target?.operationDate) {
        navigate(
          optimizationHref({
            date: target.operationDate,
            dailyPlanId: target.dailyPlanId ?? undefined,
          }),
        );
        return;
      }
      const firstDay = props.plan.days?.[0]?.operationDate;
      if (firstDay) navigate(optimizationHref({ date: firstDay }));
    } catch {
      // El store ya expone el error en `weeklyPlanState.error`.
    }
  };

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
              <Show when={props.plan.caseStudyCode}>
                {' '}
                · Caso: {props.plan.caseStudyCode}
              </Show>
            </p>
          </div>

          <WeeklyPlanDaySectorsPanel days={props.plan.days ?? []} />

          <WeeklyPlanPreflightWarningPanel issues={preflightIssues()} />

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

          <Show when={(validationSummary()?.days?.length ?? 0) > 0}>
            <WeeklyPlanDayPreviewPanel days={validationSummary()!.days} />
          </Show>

          <WeeklyPlanForecastPanel forecast={liveForecast()} source="Validación en curso" />

          <Show when={props.editable && weeklyPlanState.isGeneratingOperational}>
            <div class="space-y-1">
              <div class="flex items-center justify-between text-xs text-text-muted">
                <span>{weeklyPlanState.operationalPhase}</span>
                <span>{weeklyPlanState.operationalProgress}%</span>
              </div>
              <div class="h-2 w-full overflow-hidden rounded-full bg-elevated">
                <div
                  class="h-full rounded-full bg-fero-green-dark transition-all"
                  style={{ width: `${Math.max(4, weeklyPlanState.operationalProgress)}%` }}
                />
              </div>
            </div>
          </Show>

          <Show when={props.editable && approveBlockReason()}>
            {(reason) => <WeeklyPlanApproveBlockedPanel reason={reason()} />}
          </Show>

          <Show when={props.editable && weeklyPlanState.validationCompleted}>
            <Show
              when={planGenerated()}
              fallback={
                <Button
                  variant="primary"
                  class="gap-2"
                  icon={<Eye size={14} />}
                  loading={weeklyPlanState.isGeneratingOperational}
                  data-testid="weekly-plan-review-cta"
                  onClick={() => void handleViewPlan()}
                >
                  Ver plan
                </Button>
              }
            >
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

          <WeeklyPlanForecastPanel forecast={props.plan.expectedKpis} source="Plan aprobado" />

          <WeeklyPlanApprovedDayTable plan={props.plan} />

          <Show when={props.plan.status === 'approved'}>
            <WeeklyPlanPostApprovalChecklist steps={postApprovalSteps()} />
            <WeeklyPlanOperationalSection
              planId={props.plan.id}
              operationalPlan={props.plan.operationalPlan ?? null}
              forecast={props.plan.expectedKpis}
            />
          </Show>
        </div>
      </Show>
    </>
  );
}
