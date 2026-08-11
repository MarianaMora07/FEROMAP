import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { Badge, Button, Card, CardHeader, LoadingPanel, SelectField, TextField } from '../../design-system/components';
import { fetchCollectionPointsList } from '../../core/api/collectionPoints';
import { fetchScenarios } from '../../core/api/simulation';
import type { ScenarioId } from '../../data/types/simulation';
import {
  approveCurrentWeeklyPlan,
  autofillWeeklyFromSchedules,
  compareWeeklyVersions,
  exportWeeklyPlanPdf,
  buildDefaultWeekDays,
  initWeeklyPlanTab,
  loadWeeklyPlanVersions,
  runWeeklyValidation,
  saveWeeklyPlanDraft,
  setWeeklyPlanDays,
  setWeeklyScenario,
  weeklyPlanState,
} from '../../core/stores/weeklyPlanStore';
import { mondayIso } from '../../core/api/planning';

const weekdayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function WeeklyPlanTab() {
  const [scenarios, setScenarios] = createSignal<Array<{ id: ScenarioId; label: string }>>([]);
  const [compareA, setCompareA] = createSignal('');
  const [compareB, setCompareB] = createSignal('');

  const plan = () => weeklyPlanState.plan;
  const weekLabel = createMemo(() => {
    const current = plan();
    if (!current) return mondayIso();
    return `${current.weekStartDate} — ${current.weekEndDate}`;
  });

  onMount(async () => {
    const [scenarioRows] = await Promise.all([
      fetchScenarios(),
      initWeeklyPlanTab(),
    ]);
    setScenarios(scenarioRows.map((row) => ({ id: row.id, label: row.label })));
    if (!weeklyPlanState.plan) {
      const points = await fetchCollectionPointsList();
      const pointIds = points.map((point) => Number(point.id));
      const days = buildDefaultWeekDays(mondayIso(), pointIds);
      setWeeklyScenario('normal');
      setWeeklyPlanDays(days);
    }
  });

  const handleAutofill = async () => {
    if (!weeklyPlanState.plan?.id) {
      await saveWeeklyPlanDraft(plan()?.scenarioId ?? 'normal', plan()?.days ?? []);
    }
    await autofillWeeklyFromSchedules();
  };

  return (
    <div class="space-y-4">
      <Card>
        <CardHeader
          title="Plan semanal"
          subtitle="Nivel directivo — define qué puntos se visitan cada día de la semana."
        />
        <Show when={weeklyPlanState.isLoading}>
          <LoadingPanel label="Cargando plan semanal…" indeterminate />
        </Show>
        <Show when={!weeklyPlanState.isLoading}>
          <div class="space-y-4">
            <div class="flex flex-wrap items-center gap-3">
              <Badge variant={plan()?.status === 'approved' ? 'success' : 'info'}>
                {plan()?.status === 'approved' ? 'Aprobado' : 'Borrador'}
              </Badge>
              <p class="text-sm text-text-secondary">Semana: {weekLabel()}</p>
            </div>

            <SelectField
              label="Escenario de referencia"
              value={plan()?.scenarioId ?? 'normal'}
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
                disabled={plan()?.status === 'approved'}
                onClick={() => void approveCurrentWeeklyPlan()}
              >
                Aprobar plan
              </Button>
            </div>

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
  );
}
