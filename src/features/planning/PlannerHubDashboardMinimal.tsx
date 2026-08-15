import { Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowRight } from 'lucide-solid';
import { Button, Card, LoadingPanel } from '../../design-system/components';
import type { PlanningDashboardSnapshot } from '../../core/api/planningAnalytics';
import { dashboardView } from '../../core/stores/dashboardStore';
import type { PlannerNextAction } from '../../core/planning/plannerHubUx';
import type { OperationalJourneyStep } from '../../core/planning/operationalFlowUx';
import { ContinueThesisChip } from './ContinueThesisChip';
import { OperationalFlowStepper } from './OperationalFlowStepper';
import { PlanningStatusBadge } from './PlanningStatusBadge';

const toneClass = {
  warning: 'border-amber-300/60 bg-amber-50/90 dark:border-amber-900/40 dark:bg-amber-950/25',
  info: 'border-fero-blue/30 bg-fero-blue/10',
  success: 'border-fero-green/40 bg-fero-green/10',
} as const;

interface PlannerHubDashboardMinimalProps {
  loading: boolean;
  snapshot: PlanningDashboardSnapshot | undefined;
  nextAction: PlannerNextAction | null;
  journeySteps: OperationalJourneyStep[];
}

export function PlannerHubDashboardMinimal(props: PlannerHubDashboardMinimalProps) {
  const daily = () => props.snapshot?.dailyPlan;
  const dailyStatus = () => {
    const plan = daily();
    if (!plan) return 'none';
    return plan.dispatched || plan.status === 'dispatched' ? 'dispatched' : plan.status;
  };
  const lastOptimization = () => dashboardView()?.lastOptimization;

  return (
    <section class="space-y-3" id="mi-planificacion" data-testid="planner-hub">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-heading text-lg font-bold text-text-primary dark:text-white">Mi planificación</h2>
        <A href="/planning" class="text-sm font-medium text-fero-blue hover:underline">
          Ver hub completo
        </A>
      </div>

      <Show when={props.loading}>
        <Card>
          <LoadingPanel label="Cargando tu planificación…" indeterminate />
        </Card>
      </Show>

      <Show when={!props.loading}>
        <Card padding={false} class="overflow-hidden">
          <Show when={props.nextAction}>
            {(action) => (
              <div class={`border-b border-default px-4 py-4 ${toneClass[action().tone]}`}>
                <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Qué hacer ahora</p>
                <div class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p class="text-base font-semibold text-text-primary">{action().message}</p>
                  <A href={action().href} class="shrink-0">
                    <Button
                      variant={action().tone === 'warning' ? 'primary' : 'gradient'}
                      size="lg"
                      class="w-full gap-2 sm:w-auto"
                      data-testid="planner-hub-primary-cta"
                    >
                      {action().label}
                      <ArrowRight size={16} />
                    </Button>
                  </A>
                </div>
              </div>
            )}
          </Show>

          <div class="border-b border-default px-4 py-3">
            <Show
              when={daily()}
              fallback={
                <p class="text-sm text-text-secondary" data-testid="planner-hub-day-status">
                  <span class="font-semibold text-text-primary">Hoy</span>
                  <span class="mx-1.5 text-text-muted">·</span>
                  Sin plan del día
                  <span class="mx-1.5 text-text-muted">·</span>
                  {props.snapshot?.openPendingVisits ?? 0} pendiente
                  {(props.snapshot?.openPendingVisits ?? 0) === 1 ? '' : 's'} abiertos
                </p>
              }
            >
              {(plan) => (
                <p
                  class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary"
                  data-testid="planner-hub-day-status"
                >
                  <span class="font-semibold text-text-primary">Hoy</span>
                  <span class="text-text-muted" aria-hidden="true">
                    ·
                  </span>
                  <PlanningStatusBadge status={dailyStatus()} />
                  <span class="text-text-muted" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    {plan().pointCount} punto{plan().pointCount === 1 ? '' : 's'}
                  </span>
                  <span class="text-text-muted" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    {plan().pendingCount} pendiente{plan().pendingCount === 1 ? '' : 's'}
                  </span>
                </p>
              )}
            </Show>
          </div>

          <Show when={props.journeySteps.length > 0}>
            <div class="px-4 py-3">
              <OperationalFlowStepper
                steps={props.journeySteps}
                compact
                class="border-0 bg-transparent px-0 py-0 shadow-none"
              />
            </div>
          </Show>
        </Card>
      </Show>

      <Show when={!props.loading && lastOptimization()}>
        {(opt) => <ContinueThesisChip simulationId={opt().simulationId} />}
      </Show>
    </section>
  );
}
