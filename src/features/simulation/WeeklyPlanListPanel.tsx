import { For, Show } from 'solid-js';
import { Archive, GitCompare, Plus } from 'lucide-solid';
import { Button, Card, CardHeader } from '../../design-system/components';
import { isCurrentWeek } from '../../core/api/planning';
import { PLANNING_EMPTY_PRESETS } from '../../core/planning/planningEmptyStates';
import {
  archiveSelectedWeeklyPlan,
  canArchivePlan,
  canCreateCurrentWeekDraft,
  canCreateNextWeekDraft,
  createCurrentWeekDraft,
  createNextWeekDraft,
  selectWeeklyPlan,
  weeklyPlanState,
} from '../../core/stores/weeklyPlanStore';
import { PlanningStatusBadge } from '../planning/PlanningStatusBadge';
import { PlanningEmptyState } from '../planning/PlanningEmptyState';

export function WeeklyPlanListPanel() {
  const sortedHistory = () =>
    [...weeklyPlanState.history].sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));

  const handleSelect = (planId: number) => {
    void selectWeeklyPlan(planId);
  };

  const handleShowChanges = (event: MouseEvent, planId: number) => {
    event.stopPropagation();
    void selectWeeklyPlan(planId, { compareLatestVersions: true });
  };

  const handleArchive = (event: MouseEvent, planId: number) => {
    event.stopPropagation();
    void selectWeeklyPlan(planId).then(() => archiveSelectedWeeklyPlan());
  };

  return (
    <Card class="h-full">
      <CardHeader title="Semanas" subtitle="Pasadas, actual y próximas" />
      <div class="mb-3 flex flex-col gap-2">
        <Show when={canCreateNextWeekDraft()}>
          <Button
            size="sm"
            class="w-full gap-2"
            icon={<Plus size={14} />}
            loading={weeklyPlanState.isCreatingWeek}
            onClick={() => void createNextWeekDraft()}
          >
            Nueva semana
          </Button>
        </Show>
        <Show when={canCreateCurrentWeekDraft()}>
          <Button
            size="sm"
            variant="outline"
            class="w-full gap-2"
            icon={<Plus size={14} />}
            loading={weeklyPlanState.isCreatingWeek}
            onClick={() => void createCurrentWeekDraft()}
          >
            Borrador semana actual
          </Button>
        </Show>
      </div>
      <Show
        when={sortedHistory().length > 0}
        fallback={<PlanningEmptyState {...PLANNING_EMPTY_PRESETS.noWeeklyPlansList} compact />}
      >
        <ul class="max-h-[28rem] space-y-1 overflow-y-auto">
          <For each={sortedHistory()}>
            {(row) => {
              const selected = () => weeklyPlanState.selectedPlanId === row.id;
              const current = () => isCurrentWeek(row.weekStartDate);
              return (
                <li>
                  <div
                    role="button"
                    tabIndex={0}
                    class={`w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      selected()
                        ? 'border-fero-green/50 bg-fero-green/10'
                        : 'border-border hover:bg-surface-hover dark:border-dark-border dark:hover:bg-dark-surface-hover'
                    } ${current() ? 'ring-1 ring-fero-blue/40' : ''}`}
                    onClick={() => handleSelect(row.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleSelect(row.id);
                      }
                    }}
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0">
                        <p class="truncate text-sm font-semibold text-text-primary dark:text-white">
                          {row.weekStartDate} → {row.weekEndDate}
                        </p>
                        <p class="mt-0.5 text-xs text-text-muted">
                          {current() ? 'Semana actual · ' : ''}
                          {row.days?.length ?? 0} días configurados
                        </p>
                      </div>
                      <PlanningStatusBadge status={row.status} />
                    </div>
                    <div class="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 text-xs font-medium text-fero-blue hover:underline"
                        onClick={(event) => handleShowChanges(event, row.id)}
                      >
                        <GitCompare size={12} />
                        Ver qué cambió
                      </button>
                      <Show when={canArchivePlan(row)}>
                        <button
                          type="button"
                          class="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
                          disabled={weeklyPlanState.isArchiving}
                          onClick={(event) => handleArchive(event, row.id)}
                        >
                          <Archive size={12} />
                          Archivar
                        </button>
                      </Show>
                    </div>
                  </div>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>
    </Card>
  );
}
