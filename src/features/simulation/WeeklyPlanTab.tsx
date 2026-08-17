import { ChevronDown } from 'lucide-solid';
import { Show, createEffect, createMemo, createSignal, onMount } from 'solid-js';
import { Archive } from 'lucide-solid';
import { Button, Card, CardHeader, LoadingPanel } from '../../design-system/components';
import {
  canReachWeeklyPlanStep,
  weeklyPlanStepGuideText,
  weeklyPlanStepTitle,
} from '../../core/planning/weeklyPlanUx';
import { PlanningEmptyState } from '../planning/PlanningEmptyState';
import { PLANNING_EMPTY_PRESETS } from '../../core/planning/planningEmptyStates';
import { PlanningLevelBanner } from '../planning/PlanningLevelBanner';
import { PlanningStatusBadge } from '../planning/PlanningStatusBadge';
import { fetchScenarios } from '../../core/api/simulation';
import type { ScenarioId } from '../../data/types/simulation';
import {
  approveCurrentWeeklyPlan,
  archiveSelectedWeeklyPlan,
  autofillWeeklyFromSchedules,
  canArchivePlan,
  compareWeeklyVersions,
  deriveWeeklyFlowStep,
  exportWeeklyPlanPdf,
  initWeeklyPlanTab,
  isWeeklyPlanEditable,
  loadWeeklyPlanVersions,
  runWeeklyValidation,
  saveWeeklyPlanDraft,
  setWeeklyScenario,
  showLatestVersionChanges,
  weeklyPlanState,
} from '../../core/stores/weeklyPlanStore';
import { WeeklyPlanFlowStepper } from './WeeklyPlanFlowStepper';
import { WeeklyPlanHistoryExportPanel } from './WeeklyPlanHistoryExportPanel';
import { WeeklyPlanListPanel } from './WeeklyPlanListPanel';
import { WeeklyPlanStepPanels } from './WeeklyPlanStepPanels';

interface WeeklyPlanTabProps {
  embedded?: boolean;
}

export function WeeklyPlanTab(props: WeeklyPlanTabProps) {
  const [scenarios, setScenarios] = createSignal<Array<{ id: ScenarioId; label: string }>>([]);
  const [compareA, setCompareA] = createSignal('');
  const [compareB, setCompareB] = createSignal('');
  const [viewStep, setViewStep] = createSignal(1);

  const plan = () => weeklyPlanState.plan;
  const editable = () => isWeeklyPlanEditable();
  const flowStep = () => deriveWeeklyFlowStep();
  const weekLabel = createMemo(() => {
    const current = plan();
    if (!current) return '—';
    return `${current.weekStartDate} — ${current.weekEndDate}`;
  });

  let lastSelectedPlanId: number | null = null;

  createEffect(() => {
    const selectedId = weeklyPlanState.selectedPlanId;
    if (selectedId == null) return;
    if (selectedId !== lastSelectedPlanId) {
      lastSelectedPlanId = selectedId;
      setViewStep(deriveWeeklyFlowStep());
    }
  });

  createEffect(() => {
    if (weeklyPlanState.validationCompleted) {
      setViewStep(3);
    }
  });

  createEffect(() => {
    const status = plan()?.status;
    if (status === 'approved' || status === 'archived') {
      setViewStep(4);
    }
  });

  const handleStepChange = (step: number) => {
    if (canReachWeeklyPlanStep(step, flowStep())) {
      setViewStep(step);
    }
  };

  onMount(async () => {
    const [scenarioRows] = await Promise.all([fetchScenarios(), initWeeklyPlanTab()]);
    setScenarios(scenarioRows.map((row) => ({ id: row.id, label: row.label })));
    setViewStep(deriveWeeklyFlowStep());
  });

  const handleAutofill = async () => {
    if (!weeklyPlanState.plan?.id) {
      await saveWeeklyPlanDraft(plan()?.scenarioId ?? 'normal', plan()?.days ?? []);
    }
    await autofillWeeklyFromSchedules();
  };

  const handleSaveDraft = () =>
    void saveWeeklyPlanDraft(plan()?.scenarioId ?? 'normal', plan()?.days ?? []);

  return (
    <div class="space-y-4" data-testid="weekly-plan-tab">
      <Show when={!props.embedded}>
        <PlanningLevelBanner level="directivo" title="Planificación semanal">
          <p>Define qué puntos visitar cada día antes de optimizar rutas.</p>
        </PlanningLevelBanner>
      </Show>

      <div class="grid gap-4 lg:grid-cols-12">
        <div class="lg:col-span-4">
          <WeeklyPlanListPanel />
        </div>

        <div class="space-y-4 lg:col-span-8">
          <WeeklyPlanFlowStepper
            flowStep={flowStep()}
            viewStep={viewStep()}
            onStepChange={handleStepChange}
            loading={weeklyPlanState.isLoading}
            validating={weeklyPlanState.isValidating}
            guideText={weeklyPlanStepGuideText(viewStep())}
          />

          <Card>
            <CardHeader title={weeklyPlanStepTitle(viewStep())} subtitle={plan() ? `Semana ${weekLabel()}` : undefined} />
            <Show when={weeklyPlanState.isLoading}>
              <LoadingPanel label="Cargando plan semanal…" indeterminate />
            </Show>
            <Show when={!weeklyPlanState.isLoading && !plan()}>
              <PlanningEmptyState
                {...PLANNING_EMPTY_PRESETS.noWeeklyPlansList}
                description="Selecciona una semana de la lista o crea un borrador para comenzar el flujo directivo."
              />
            </Show>
            <Show when={!weeklyPlanState.isLoading && plan()}>
              <div class="space-y-4">
                <div class="flex flex-wrap items-center gap-3">
                  <PlanningStatusBadge status={plan()?.status ?? 'draft'} />
                </div>

                <WeeklyPlanStepPanels
                  step={viewStep()}
                  plan={plan()!}
                  editable={editable()}
                  scenarios={scenarios()}
                  onScenarioChange={setWeeklyScenario}
                  onAutofill={() => void handleAutofill()}
                  onSaveDraft={handleSaveDraft}
                  onValidate={() => void runWeeklyValidation()}
                  onApprove={() =>
                    void approveCurrentWeeklyPlan(weeklyPlanState.validationSummary?.simulationId ?? undefined)
                  }
                />

                <Show when={viewStep() === 1 && (editable() || canArchivePlan(plan()))}>
                  <details
                    class="group rounded-xl border border-border bg-surface/40 dark:border-dark-border"
                    data-testid="weekly-plan-more-actions"
                  >
                    <summary class="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 marker:content-none">
                      <span class="text-sm font-semibold text-text-primary dark:text-white">Más acciones</span>
                      <ChevronDown
                        size={16}
                        class="shrink-0 text-text-muted transition-transform group-open:rotate-180"
                        aria-hidden="true"
                      />
                    </summary>
                    <div class="flex flex-wrap gap-2 border-t border-border px-4 pb-4 pt-3 dark:border-dark-border">
                      <Show when={canArchivePlan(plan())}>
                        <Button
                          size="sm"
                          variant="outline"
                          class="gap-2"
                          icon={<Archive size={14} />}
                          loading={weeklyPlanState.isArchiving}
                          onClick={() => void archiveSelectedWeeklyPlan()}
                        >
                          Archivar
                        </Button>
                      </Show>
                    </div>
                  </details>
                </Show>

                <Show when={viewStep() === 1}>
                  <WeeklyPlanHistoryExportPanel
                    planId={plan()?.id}
                    versions={weeklyPlanState.versions}
                    versionDiff={weeklyPlanState.versionDiff}
                    compareA={compareA()}
                    compareB={compareB()}
                    onCompareAChange={setCompareA}
                    onCompareBChange={setCompareB}
                    onLoadVersions={() => void loadWeeklyPlanVersions()}
                    onCompareVersions={() => void compareWeeklyVersions(Number(compareA()), Number(compareB()))}
                    onShowLatestChanges={() => void showLatestVersionChanges()}
                    onExportPdf={() => void exportWeeklyPlanPdf()}
                  />
                </Show>

                <Show when={weeklyPlanState.error}>
                  <p class="text-sm text-red-500">{weeklyPlanState.error}</p>
                </Show>
                <Show when={weeklyPlanState.notice}>
                  <p class="text-sm text-fero-green-dark">{weeklyPlanState.notice}</p>
                </Show>
              </div>
            </Show>
          </Card>
        </div>
      </div>
    </div>
  );
}
