import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { Archive } from 'lucide-solid';
import { Button, Card, CardHeader, LoadingPanel, SelectField, TextField } from '../../design-system/components';
import { optimizationDateHref, todayIso } from '../../core/planning/planningUx';
import { PlanningContextualCta } from '../planning/PlanningContextualCta';
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
import { WeeklyPlanListPanel } from './WeeklyPlanListPanel';

const weekdayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function WeeklyPlanTab() {
  const [scenarios, setScenarios] = createSignal<Array<{ id: ScenarioId; label: string }>>([]);
  const [compareA, setCompareA] = createSignal('');
  const [compareB, setCompareB] = createSignal('');

  const plan = () => weeklyPlanState.plan;
  const editable = () => isWeeklyPlanEditable();
  const flowStep = () => deriveWeeklyFlowStep();
  const weekLabel = createMemo(() => {
    const current = plan();
    if (!current) return '—';
    return `${current.weekStartDate} — ${current.weekEndDate}`;
  });

  onMount(async () => {
    const [scenarioRows] = await Promise.all([fetchScenarios(), initWeeklyPlanTab()]);
    setScenarios(scenarioRows.map((row) => ({ id: row.id, label: row.label })));
  });

  const handleAutofill = async () => {
    if (!weeklyPlanState.plan?.id) {
      await saveWeeklyPlanDraft(plan()?.scenarioId ?? 'normal', plan()?.days ?? []);
    }
    await autofillWeeklyFromSchedules();
  };

  return (
    <div class="space-y-4" data-testid="weekly-plan-tab">
      <PlanningLevelBanner level="directivo" title="Planificación semanal" />

      <div class="grid gap-4 lg:grid-cols-12">
        <div class="lg:col-span-4">
          <WeeklyPlanListPanel />
        </div>

        <div class="space-y-4 lg:col-span-8">
          <WeeklyPlanFlowStepper step={flowStep()} loading={weeklyPlanState.isLoading} />

          <Card>
            <CardHeader title="Detalle del plan" />
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
                  <p class="text-sm text-text-secondary">Semana: {weekLabel()}</p>
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

                <Show when={plan()?.status === 'approved'}>
                  <PlanningContextualCta
                    message="Semana aprobada. Continúa con el plan del día."
                    href={optimizationDateHref(todayIso())}
                    linkLabel="Ir al plan de hoy"
                  />
                </Show>

                <Show when={plan()?.status === 'archived'}>
                  <p class="rounded-lg border border-border bg-surface/60 px-3 py-2 text-sm text-text-secondary dark:border-dark-border">
                    Plan archivado — solo consulta. Crea un borrador para una semana futura si necesitas planificar de nuevo.
                  </p>
                </Show>

                <SelectField
                  label="Escenario de referencia"
                  value={plan()?.scenarioId ?? 'normal'}
                  disabled={!editable()}
                  onChange={(value) => setWeeklyScenario(value as ScenarioId)}
                  options={scenarios().map((row) => ({ value: row.id, label: row.label }))}
                />

                <div class="grid gap-3 md:grid-cols-5">
                  <For each={plan()?.days ?? []}>
                    {(day) => (
                      <div class="rounded-lg border border-border p-3 dark:border-dark-border">
                        <p class="text-sm font-semibold text-text-primary dark:text-white">
                          {weekdayLabels[day.weekday] ?? 'Día'}
                        </p>
                        <p class="text-xs text-text-muted">{day.operationDate}</p>
                        <p class="mt-2 text-2xl font-bold text-fero-green-dark">{day.collectionPointIds.length}</p>
                        <p class="text-xs text-text-secondary">puntos · flota {day.expectedVehicleCount ?? '—'}</p>
                        <Show when={day.scenarioIdOverride}>
                          <p class="text-xs text-fero-blue">Escenario: {day.scenarioIdOverride}</p>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>

                <Show when={editable()}>
                  <div class="flex flex-wrap gap-2">
                    <Button variant="outline" loading={weeklyPlanState.isSaving} onClick={() => void handleAutofill()}>
                      Autocompletar desde frecuencias
                    </Button>
                    <Button variant="outline" onClick={() => void loadWeeklyPlanVersions()}>
                      Ver versiones
                    </Button>
                    <Button variant="outline" disabled={!plan()?.id} onClick={() => void exportWeeklyPlanPdf()}>
                      Exportar PDF
                    </Button>
                    <Button
                      loading={weeklyPlanState.isSaving}
                      onClick={() => void saveWeeklyPlanDraft(plan()?.scenarioId ?? 'normal', plan()?.days ?? [])}
                    >
                      Guardar borrador
                    </Button>
                    <Button
                      variant="outline"
                      loading={weeklyPlanState.isValidating}
                      onClick={() => void runWeeklyValidation()}
                    >
                      Validar con simulación
                    </Button>
                    <Button
                      variant="primary"
                      loading={weeklyPlanState.isApproving}
                      disabled={!weeklyPlanState.validationCompleted}
                      onClick={() => void approveCurrentWeeklyPlan()}
                    >
                      Aprobar plan
                    </Button>
                  </div>
                </Show>

                <Show when={!editable()}>
                  <div class="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void loadWeeklyPlanVersions()}>
                      Ver versiones
                    </Button>
                    <Button variant="outline" disabled={!plan()?.id} onClick={() => void exportWeeklyPlanPdf()}>
                      Exportar PDF
                    </Button>
                    <Button variant="outline" onClick={() => void showLatestVersionChanges()}>
                      Ver qué cambió
                    </Button>
                  </div>
                </Show>

                <Show when={weeklyPlanState.versions.length > 0}>
                  <div class="rounded-lg border border-border p-3 dark:border-dark-border">
                    <p class="mb-2 text-sm font-semibold">Versiones del plan</p>
                    <ul class="space-y-1 text-sm text-text-secondary">
                      <For each={weeklyPlanState.versions}>
                        {(version) => (
                          <li>
                            v{version.versionNumber} — {version.changeSummary ?? 'Sin descripción'} (
                            {version.createdAt ?? '—'})
                          </li>
                        )}
                      </For>
                    </ul>
                    <div class="mt-3 grid gap-2 md:grid-cols-3">
                      <TextField label="Versión A" value={compareA()} onInput={(e) => setCompareA(e.currentTarget.value)} />
                      <TextField label="Versión B" value={compareB()} onInput={(e) => setCompareB(e.currentTarget.value)} />
                      <div class="flex items-end">
                        <Button
                          variant="outline"
                          onClick={() =>
                            void compareWeeklyVersions(Number(compareA()), Number(compareB()))
                          }
                        >
                          Comparar
                        </Button>
                      </div>
                    </div>
                    <Show when={weeklyPlanState.versionDiff.length > 0}>
                      <ul class="mt-3 space-y-1 text-xs text-text-muted">
                        <For each={weeklyPlanState.versionDiff.slice(0, 12)}>
                          {(change) => (
                            <li>
                              {change.path}: {JSON.stringify(change.before)} → {JSON.stringify(change.after)}
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>
                  </div>
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
