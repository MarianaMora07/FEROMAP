import { Show, createResource } from 'solid-js';
import { A } from '@solidjs/router';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Route,
} from 'lucide-solid';
import { Button, Card, CardHeader, LoadingPanel, ProgressBar } from '../../design-system/components';
import { fetchPlanningDashboardSnapshot } from '../../core/api/planningAnalytics';
import { PLANNING_EMPTY_PRESETS } from '../../core/planning/planningEmptyStates';
import { deriveNextPlannerAction } from '../../core/planning/plannerHubUx';
import { weeklyPlanHref } from '../../core/planning/weeklyPlanLinks';
import { buildOperationalJourneySteps } from '../../core/planning/operationalFlowUx';
import { PlanningEmptyState } from './PlanningEmptyState';
import { PlanningStatusBadge } from './PlanningStatusBadge';
import { OperationalFlowStepper } from './OperationalFlowStepper';

const toneClass = {
  warning: 'border-amber-300/60 bg-amber-50/90 dark:border-amber-900/40 dark:bg-amber-950/25',
  info: 'border-fero-blue/30 bg-fero-blue/10',
  success: 'border-fero-green/40 bg-fero-green/10',
};

const titleClass = {
  warning: 'text-amber-800 dark:text-amber-200',
  info: 'text-fero-blue',
  success: 'text-fero-green-dark',
};

export function PlannerHubSection() {
  const [snapshot] = createResource(() => fetchPlanningDashboardSnapshot());

  const weekly = () => snapshot()?.weeklyPlan;
  const daily = () => snapshot()?.dailyPlan;
  const nextAction = () => (snapshot() ? deriveNextPlannerAction(snapshot()!) : null);
  const journeySteps = () => {
    const snap = snapshot();
    if (!snap) return [];
    return buildOperationalJourneySteps({
      weeklyPlan: snap.weeklyPlan,
      dailyPlan: snap.dailyPlan,
    });
  };

  return (
    <section class="space-y-4" id="mi-planificacion" data-testid="planner-hub">
        <div>
          <h2 class="font-heading text-xl font-bold text-text-primary dark:text-white">Mi planificación</h2>
        </div>

        <Show when={snapshot.loading}>
          <Card>
            <LoadingPanel label="Cargando tu planificación…" indeterminate />
          </Card>
        </Show>

        <Show when={!snapshot.loading && nextAction()}>
          {(action) => (
            <div class={`rounded-xl border px-4 py-4 ${toneClass[action().tone]}`}>
              <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Qué hacer ahora</p>
              <div class="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p class={`text-lg font-bold ${titleClass[action().tone]}`}>{action().message}</p>
                  <p class="mt-1 text-sm text-text-secondary">{action().detail}</p>
                </div>
                <A href={action().href}>
                  <Button variant={action().tone === 'warning' ? 'primary' : 'outline'} class="gap-2 shrink-0">
                    {action().label}
                    <ArrowRight size={14} />
                  </Button>
                </A>
              </div>
            </div>
          )}
        </Show>

        <Show when={!snapshot.loading && journeySteps().length > 0}>
          <OperationalFlowStepper steps={journeySteps()} title="Recorrido operativo del día" />
        </Show>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader
              title="Plan semanal"
              subtitle="Condiciones y plan ACO"
              action={
                <A href={weeklyPlanHref} class="text-xs font-medium text-fero-blue hover:underline">
                  Gestionar
                </A>
              }
            />
            <Show
              when={weekly()}
              fallback={<PlanningEmptyState {...PLANNING_EMPTY_PRESETS.noWeeklyPlan} compact />}
            >
              {(plan) => (
                <div class="space-y-2">
                  <div class="flex items-center gap-2">
                    <CalendarDays size={16} class="text-fero-blue" />
                    <span class="text-sm font-semibold text-text-primary dark:text-white">
                      {plan().weekStartDate} → {plan().weekEndDate}
                    </span>
                    <Show when={plan().isUpcoming}>
                      <span class="rounded-full bg-fero-blue/10 px-2 py-0.5 text-[10px] font-semibold text-fero-blue">
                        Próxima semana
                      </span>
                    </Show>
                  </div>
                  <PlanningStatusBadge status={plan().status} />
                  <p class="text-sm text-text-secondary">
                    {plan().daysConfigured} días · {plan().scheduledPoints} puntos
                  </p>
                </div>
              )}
            </Show>
          </Card>

          <Card>
            <CardHeader
              title="Plan del día"
              subtitle="Optimización y despacho"
              action={
                <A href="/optimization" class="text-xs font-medium text-fero-blue hover:underline">
                  Gestionar
                </A>
              }
            />
            <Show
              when={daily()}
              fallback={<PlanningEmptyState {...PLANNING_EMPTY_PRESETS.noDailyPlan} compact />}
            >
              {(plan) => (
                <div class="space-y-2">
                  <div class="flex items-center gap-2">
                    <ClipboardList size={16} class="text-fero-green" />
                    <span class="text-sm font-semibold text-text-primary dark:text-white">{plan().operationDate}</span>
                  </div>
                  <PlanningStatusBadge status={plan().dispatched ? 'dispatched' : plan().status} />
                  <p class="text-sm text-text-secondary">
                    {plan().pointCount} puntos · {plan().pendingCount} pendientes en plan
                  </p>
                  <ProgressBar
                    value={Math.max(plan().pointCount - plan().pendingCount, 0)}
                    max={Math.max(plan().pointCount, 1)}
                    color="green"
                    size="sm"
                  />
                </div>
              )}
            </Show>
          </Card>

          <Card>
            <CardHeader
              title="Pendientes"
              subtitle="Carry-over abierto"
              action={
                <A href="/optimization#pendientes" class="text-xs font-medium text-fero-blue hover:underline">
                  Gestionar
                </A>
              }
            />
            <div class="flex items-center gap-3">
              <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/40">
                <Route size={22} />
              </span>
              <div>
                <p class="text-3xl font-bold text-text-primary dark:text-white">
                  {snapshot()?.openPendingVisits ?? 0}
                </p>
                <p class="text-sm text-text-secondary">visitas sin cerrar</p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Incidencias"
              subtitle="Contingencias recientes"
              action={
                <A href="/monitoring" class="text-xs font-medium text-fero-blue hover:underline">
                  Monitoreo
                </A>
              }
            />
            <div class="flex items-center gap-3">
              <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/40">
                <AlertTriangle size={22} />
              </span>
              <div>
                <p class="text-3xl font-bold text-text-primary dark:text-white">{snapshot()?.openIncidents ?? 0}</p>
                <p class="text-sm text-text-secondary">abiertas en operación</p>
              </div>
            </div>
          </Card>
        </div>
    </section>
  );
}
