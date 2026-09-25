import { useNavigate } from '@solidjs/router';
import { ArrowRight, Eye } from 'lucide-solid';
import { Show, createSignal } from 'solid-js';
import { Button, LoadingPanel, TabList, tabButtonId } from '../../../design-system/components';
import {
  buildWeeklyPlanForecastFromValidation,
  buildWeeklyPlanPostApprovalChecklist,
  weeklyPlanScheduledPointCount,
} from '../../../core/planning/weeklyPlanUx';
import type { WeeklyPlan } from '../../../core/api/planning';
import type { ScenarioId } from '../../../data/types/simulation';
import { weeklyPlanState, generateWeeklyOperationalPlanForWeek } from '../../../core/stores/weeklyPlanStore';
import { optimizationHref } from '../../../core/planning/operationalLinks';
import { WeeklyPlanConfigurePanel } from './WeeklyPlanConfigurePanel';
import {
  WeeklyPlanOptionalValidationPanel,
  WeeklyPlanPostApprovalChecklist,
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
  const [step4Tab, setStep4Tab] = createSignal<'resumen' | 'dias' | 'operacion'>('resumen');
  const totalPoints = () => weeklyPlanScheduledPointCount(props.plan);
  const validationSummary = () => weeklyPlanState.validationSummary;
  const postApprovalSteps = () => buildWeeklyPlanPostApprovalChecklist();
  // Mejoras previstas a partir del resumen de la validación de esta sesión.
  const liveForecast = () =>
    buildWeeklyPlanForecastFromValidation(validationSummary()?.days ?? [], props.plan.weekStartDate);

  // El plan operativo ya generado (p. ej. por la validación) permite abrir el plan del
  // día; si no existe, «Ver plan» lo genera y abre la planificación operativa.
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

          <Show when={weeklyPlanState.isValidating}>
            <LoadingPanel label="Validando con simulación ACO…" progress={weeklyPlanState.validationProgress} />
          </Show>

          <Show when={!weeklyPlanState.isValidating && validationSummary()}>
            <p class="text-sm text-text-secondary">
              Validación completada. Revisa las mejoras previstas en el paso «Aprobar».
            </p>
          </Show>

          <Show when={props.editable && totalPoints() > 0 && !validationSummary()}>
            <p class="text-sm text-text-secondary">
              La validación con el motor es opcional: puedes aprobar la semana directamente en el paso
              «Aprobar».
            </p>
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
            when={liveForecast()}
            fallback={
              <p class="text-sm text-text-secondary">
                Aún no has validado la semana. Puedes aprobar directamente o validar con el motor
                si quieres revisar las mejoras previstas.
              </p>
            }
          >
            <WeeklyPlanForecastPanel forecast={liveForecast()} source="Validación en curso" />
          </Show>

          <Show when={props.editable && weeklyPlanState.isValidating}>
            <LoadingPanel label="Validando con simulación ACO…" progress={weeklyPlanState.validationProgress} />
          </Show>

          <Show
            when={
              props.editable && !weeklyPlanState.validationCompleted && !weeklyPlanState.isValidating
            }
          >
            <WeeklyPlanOptionalValidationPanel
              loading={weeklyPlanState.isValidating}
              onValidate={() => props.onValidate()}
            />
          </Show>

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

          <Show when={props.editable}>
            <div class="flex flex-wrap items-center gap-2">
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
              <Button
                variant="outline"
                class="gap-2"
                icon={<Eye size={14} />}
                loading={weeklyPlanState.isGeneratingOperational}
                onClick={() => void handleViewPlan()}
                data-testid="weekly-plan-review-cta"
              >
                {planGenerated() ? 'Abrir plan operativo de la semana' : 'Ver plan'}
              </Button>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={props.step === 4}>
        <div class="space-y-4" data-testid="weekly-plan-step-4">
          <Show
            when={props.plan.status === 'approved'}
            fallback={
              <>
                <WeeklyPlanForecastPanel
                  forecast={props.plan.expectedKpis}
                  source="Plan aprobado"
                  showDayTable={false}
                />
                <WeeklyPlanApprovedDayTable plan={props.plan} />
              </>
            }
          >
            <TabList
              idPrefix="weekly-plan-step4"
              panelId="weekly-plan-step4-panel"
              tabs={[
                { id: 'resumen', label: 'Resumen' },
                { id: 'dias', label: 'Días' },
                { id: 'operacion', label: 'Operación' },
              ]}
              active={step4Tab()}
              onChange={(id) => setStep4Tab(id as 'resumen' | 'dias' | 'operacion')}
              ariaLabel="Detalle de la semana aprobada"
              containerClass="flex gap-1 overflow-x-auto border-b border-default"
              testId="weekly-plan-step4-tabs"
              testIdFor={(id) => `weekly-plan-step4-tab-${id}`}
              tabClass={(active) =>
                `shrink-0 border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-fero-green-mid text-fero-green-dark'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                }`
              }
            />

            <div
              role="tabpanel"
              id="weekly-plan-step4-panel"
              aria-labelledby={tabButtonId('weekly-plan-step4', step4Tab())}
            >
              <Show when={step4Tab() === 'resumen'}>
                <div class="space-y-4">
                  <WeeklyPlanForecastPanel
                    forecast={props.plan.expectedKpis}
                    source="Plan aprobado"
                    showDayTable={false}
                  />
                  <WeeklyPlanPostApprovalChecklist steps={postApprovalSteps()} />
                </div>
              </Show>

              <Show when={step4Tab() === 'dias'}>
                <WeeklyPlanApprovedDayTable plan={props.plan} />
              </Show>

              <Show when={step4Tab() === 'operacion'}>
                <WeeklyPlanOperationalSection
                  planId={props.plan.id}
                  operationalPlan={props.plan.operationalPlan ?? null}
                />
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </>
  );
}
