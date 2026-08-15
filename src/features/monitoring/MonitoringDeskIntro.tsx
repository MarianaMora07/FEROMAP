import { For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowRight } from 'lucide-solid';
import type { DailyPlan } from '../../core/api/planning';
import type { MonitoringKpi } from '../../core/api/monitoring';
import { optimizationHref } from '../../core/planning/operationalLinks';
import { PlanningStatusBadge } from '../planning/PlanningStatusBadge';

interface MonitoringDeskIntroProps {
  variant: 'planner' | 'supervisor';
  fleetInRoute: number;
  operationDate: string;
  dailyPlanId?: number;
  dailyPlan?: DailyPlan | null;
}

export function MonitoringDeskIntro(props: MonitoringDeskIntroProps) {
  const planHref = () =>
    optimizationHref({
      date: props.dailyPlan?.operationDate ?? props.operationDate,
      dailyPlanId: props.dailyPlan?.id ?? props.dailyPlanId,
    });

  return (
    <div
      class="flex flex-col gap-2 rounded-lg border border-default bg-surface/60 px-3 py-2.5"
      data-testid="monitoring-desk-intro"
    >
      <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0 space-y-1">
          <p class="text-sm text-text-secondary">
            {props.variant === 'supervisor'
              ? 'Supervisión operativa — flota e incidencias en tiempo real.'
              : 'Flota en vivo — ubicación, rutas e incidencias del día.'}
            <span class="text-text-muted"> · {props.fleetInRoute} en ruta</span>
          </p>
          <Show when={props.dailyPlan}>
            {(plan) => (
              <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
                <span class="font-medium text-text-primary dark:text-white">
                  Plan {plan().operationDate}
                </span>
                <PlanningStatusBadge status={plan().status} />
                <span class="text-text-muted">
                  {plan().finalPointIds.length} puntos · {plan().pendingPoints.length} pendientes
                </span>
              </p>
            )}
          </Show>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Show when={props.variant === 'supervisor'}>
            <A href={planHref()} class="inline-flex items-center gap-1 text-sm font-medium text-fero-blue hover:underline">
              Plan del día
              <ArrowRight size={14} aria-hidden="true" />
            </A>
          </Show>
          <A href="/vehicles" class="inline-flex items-center gap-1 text-sm font-medium text-fero-blue hover:underline">
            Vehículos
            <ArrowRight size={14} aria-hidden="true" />
          </A>
          <A href="/alerts" class="inline-flex items-center gap-1 text-sm font-medium text-fero-blue hover:underline">
            Alertas
            <ArrowRight size={14} aria-hidden="true" />
          </A>
          <Show when={props.variant === 'planner' && props.dailyPlan}>
            <A
              href={planHref()}
              class="inline-flex items-center gap-1 rounded-full border border-default bg-surface px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-fero-blue/40 hover:text-text-primary"
            >
              Abrir optimización
              <ArrowRight size={12} aria-hidden="true" />
            </A>
          </Show>
        </div>
      </div>
    </div>
  );
}

interface MonitoringStatsStripProps {
  kpis: MonitoringKpi[];
  loading?: boolean;
}

export function MonitoringStatsStrip(props: MonitoringStatsStripProps) {
  return (
    <div
      class="grid grid-cols-2 gap-2 rounded-lg border border-default bg-elevated px-3 py-2.5 sm:grid-cols-3 xl:grid-cols-5"
      data-testid="monitoring-stats-strip"
    >
      <Show
        when={!props.loading}
        fallback={
          <For each={Array.from({ length: 5 })}>
            {() => <div class="h-10 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />}
          </For>
        }
      >
        <For each={props.kpis}>
          {(kpi) => (
            <div class="px-1 py-0.5">
              <p class="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{kpi.title}</p>
              <p class="mt-0.5 text-base font-bold text-text-primary dark:text-white">{kpi.value}</p>
              <Show when={kpi.progress != null}>
                <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    class="h-full rounded-full bg-fero-green-dark"
                    style={{ width: `${kpi.progress}%` }}
                  />
                </div>
              </Show>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
