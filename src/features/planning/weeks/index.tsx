import { For, Show, createSignal, onMount } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import { FileDown, GitCompare, Plus, Trash2 } from 'lucide-solid';
import {
  Button,
  Card,
  ConfirmDialog,
  Drawer,
  LoadingPanel,
} from '../../../design-system/components';
import {
  compareWeeklyPlanVersions,
  fetchWeeklyPlanVersions,
  isCurrentWeek,
  type VersionDiffChange,
  type WeeklyPlan,
} from '../../../core/api/planning';
import { mondayIso } from '../../../core/planning/isoDate';
import { weeklyPlanWeekHref } from '../../../core/planning/weeklyPlanLinks';
import { PLANNING_EMPTY_PRESETS } from '../../../core/planning/planningEmptyStates';
import { globalToast } from '../../../core/stores/toastStore';
import {
  canCreateCurrentWeekDraft,
  canDeletePlan,
  deleteWeeklyPlanRow,
  exportWeeklyPlanPdfById,
  initWeeklyPlansList,
  nextWeekToCreate,
  weeklyPlanState,
} from '../../../core/stores/weeklyPlanStore';
import { PlanningEmptyState } from '../PlanningEmptyState';
import { PlanningStatusBadge } from '../PlanningStatusBadge';

/** Resumen legible de la flota de la semana (configurada u operativa). */
function fleetSummary(plan: WeeklyPlan): string {
  const fleet = plan.fleetByType ?? plan.operationalPlan?.fleetByType ?? null;
  const entries = Object.entries(fleet ?? {}).filter(([, count]) => Number(count) > 0);
  if (entries.length === 0) return 'Toda la flota';
  return entries.map(([type, count]) => `${count} ${type}`).join(' · ');
}

/** Una semana se considera terminada cuando su plan directivo ya está aprobado. */
function isFinished(plan: WeeklyPlan): boolean {
  return plan.status === 'approved' || plan.status === 'archived';
}

function formatDiffValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function WeeklyPlansListPage() {
  const navigate = useNavigate();
  const [pendingDeleteId, setPendingDeleteId] = createSignal<number | null>(null);
  const [deleting, setDeleting] = createSignal(false);
  const [exportingId, setExportingId] = createSignal<number | null>(null);

  const [diffPlan, setDiffPlan] = createSignal<WeeklyPlan | null>(null);
  const [diffChanges, setDiffChanges] = createSignal<VersionDiffChange[]>([]);
  const [diffLoading, setDiffLoading] = createSignal(false);
  const [diffError, setDiffError] = createSignal<string | null>(null);

  onMount(() => {
    void initWeeklyPlansList();
  });

  const rows = () =>
    [...weeklyPlanState.history].sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));

  const pendingDeleteRow = () => rows().find((row) => row.id === pendingDeleteId()) ?? null;

  const handleExport = async (plan: WeeklyPlan) => {
    setExportingId(plan.id);
    try {
      await exportWeeklyPlanPdfById(plan.id);
    } catch {
      globalToast.addToast('No se pudo exportar el PDF de la semana', 'error');
    } finally {
      setExportingId(null);
    }
  };

  const openChanges = async (plan: WeeklyPlan) => {
    setDiffPlan(plan);
    setDiffChanges([]);
    setDiffError(null);
    setDiffLoading(true);
    try {
      const { items } = await fetchWeeklyPlanVersions(plan.id);
      const sorted = [...items].sort((a, b) => b.versionNumber - a.versionNumber);
      if (sorted.length < 2) {
        setDiffError('Esta semana todavía no tiene una versión anterior con la que comparar.');
        return;
      }
      const diff = await compareWeeklyPlanVersions(
        plan.id,
        sorted[1]!.versionNumber,
        sorted[0]!.versionNumber,
      );
      setDiffChanges(diff.changes);
      if (diff.changes.length === 0) {
        setDiffError('No hay diferencias entre las dos últimas versiones.');
      }
    } catch (error) {
      setDiffError(error instanceof Error ? error.message : 'No se pudo comparar las versiones');
    } finally {
      setDiffLoading(false);
    }
  };

  const confirmDelete = async () => {
    const planId = pendingDeleteId();
    if (planId == null) return;
    setDeleting(true);
    try {
      await deleteWeeklyPlanRow(planId);
      setPendingDeleteId(null);
    } catch {
      // El store ya notifica el error (toast + estado).
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div class="space-y-4" data-testid="weekly-plans-page">
      <Card>
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            class="gap-2"
            icon={<Plus size={14} />}
            data-testid="weekly-plans-create-next"
            onClick={() => navigate(weeklyPlanWeekHref(nextWeekToCreate()))}
          >
            Nueva semana · {nextWeekToCreate()}
          </Button>
          <Show when={canCreateCurrentWeekDraft()}>
            <Button
              size="sm"
              variant="outline"
              class="gap-2"
              icon={<Plus size={14} />}
              data-testid="weekly-plans-create-current"
              onClick={() => navigate(weeklyPlanWeekHref(mondayIso()))}
            >
              Borrador semana actual
            </Button>
          </Show>
        </div>

        <Show when={weeklyPlanState.isLoading}>
          <LoadingPanel label="Cargando planes semanales…" indeterminate />
        </Show>

        <Show when={weeklyPlanState.error}>
          <p class="mb-3 text-sm text-red-500">{weeklyPlanState.error}</p>
        </Show>

        <Show when={!weeklyPlanState.isLoading && rows().length === 0}>
          <PlanningEmptyState {...PLANNING_EMPTY_PRESETS.noWeeklyPlansList} />
        </Show>

        <Show when={!weeklyPlanState.isLoading && rows().length > 0}>
          <div class="overflow-x-auto">
            <table class="w-full min-w-180 text-sm">
              <thead>
                <tr class="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted dark:border-dark-border">
                  <th class="pb-2 pr-3 font-semibold">Semana</th>
                  <th class="pb-2 pr-3 font-semibold">Estado</th>
                  <th class="pb-2 pr-3 font-semibold">Terminada</th>
                  <th class="pb-2 pr-3 font-semibold">Flota</th>
                  <th class="pb-2 pr-3 font-semibold">Días</th>
                  <th class="pb-2 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border dark:divide-dark-border">
                <For each={rows()}>
                  {(row) => (
                    <tr
                      data-testid={`weekly-plans-row-${row.id}`}
                      data-weekly-plan-status={row.status}
                    >
                      <td class="py-3 pr-3">
                        <p class="font-medium text-text-primary dark:text-white">
                          {row.weekStartDate} → {row.weekEndDate}
                        </p>
                        <Show when={isCurrentWeek(row.weekStartDate)}>
                          <p class="mt-0.5 text-xs font-medium text-fero-blue">Semana actual</p>
                        </Show>
                      </td>
                      <td class="py-3 pr-3">
                        <PlanningStatusBadge status={row.status} />
                      </td>
                      <td class="py-3 pr-3 text-text-secondary">{isFinished(row) ? 'Sí' : '—'}</td>
                      <td class="py-3 pr-3 text-text-secondary">{fleetSummary(row)}</td>
                      <td class="py-3 pr-3 text-text-muted">{row.days?.length ?? 0}</td>
                      <td class="py-3">
                        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <A
                            href={weeklyPlanWeekHref(row.weekStartDate)}
                            class="inline-flex items-center gap-1 text-xs font-medium text-fero-blue hover:underline"
                            data-testid={`weekly-plans-open-${row.id}`}
                          >
                            Abrir
                          </A>
                          <button
                            type="button"
                            class="inline-flex items-center gap-1 text-xs font-medium text-fero-green-dark hover:underline disabled:opacity-50 dark:text-fero-green"
                            disabled={exportingId() === row.id}
                            data-testid={`weekly-plans-pdf-${row.id}`}
                            onClick={() => void handleExport(row)}
                          >
                            <FileDown size={12} />
                            PDF
                          </button>
                          <button
                            type="button"
                            class="inline-flex items-center gap-1 text-xs font-medium text-fero-blue hover:underline"
                            data-testid={`weekly-plans-changes-${row.id}`}
                            onClick={() => void openChanges(row)}
                          >
                            <GitCompare size={12} />
                            Ver qué cambió
                          </button>
                          <Show when={canDeletePlan(row)}>
                            <button
                              type="button"
                              class="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                              disabled={weeklyPlanState.isDeleting}
                              data-testid={`weekly-plans-delete-${row.id}`}
                              onClick={() => setPendingDeleteId(row.id)}
                            >
                              <Trash2 size={12} />
                              Eliminar
                            </button>
                          </Show>
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Card>

      <Drawer
        open={diffPlan() != null}
        onClose={() => setDiffPlan(null)}
        title={
          diffPlan()
            ? `Cambios · ${diffPlan()!.weekStartDate} → ${diffPlan()!.weekEndDate}`
            : 'Cambios'
        }
      >
        <Show when={!diffLoading()} fallback={<LoadingPanel label="Comparando versiones…" indeterminate />}>
          <Show when={diffError()}>
            <p class="text-sm text-text-muted">{diffError()}</p>
          </Show>
          <Show when={diffChanges().length > 0}>
            <ul class="space-y-2" data-testid="weekly-plans-changes-list">
              <For each={diffChanges()}>
                {(change) => (
                  <li class="rounded-md border border-border px-3 py-2 text-sm dark:border-dark-border">
                    <p class="font-mono text-xs font-semibold text-text-primary dark:text-white">
                      {change.path}
                    </p>
                    <p class="mt-1 text-xs text-text-muted">
                      <span class="text-red-500 line-through">{formatDiffValue(change.before)}</span>
                      {' → '}
                      <span class="text-fero-green-dark dark:text-fero-green">
                        {formatDiffValue(change.after)}
                      </span>
                    </p>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </Drawer>

      <ConfirmDialog
        open={pendingDeleteId() != null}
        title="¿Eliminar esta semana?"
        message={
          pendingDeleteRow()
            ? `Se eliminará la semana ${pendingDeleteRow()!.weekStartDate} → ${pendingDeleteRow()!.weekEndDate} y su configuración de días. Esta acción no se puede deshacer.`
            : 'Esta acción no se puede deshacer.'
        }
        confirmLabel="Eliminar semana"
        tone="danger"
        loading={deleting()}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDeleteId(null)}
        testId={`weekly-plans-delete-confirm-${pendingDeleteId() ?? 'none'}`}
      />
    </div>
  );
}
