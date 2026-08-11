import { For, Show, createResource } from 'solid-js';
import { A } from '@solidjs/router';
import { Card, CardHeader, ProgressBar } from '../../../design-system/components';
import { fetchDailyPlansInRange, fetchPendingVisits, type WeeklyPlan } from '../../../core/api/planning';
import { weekDaysFromMonday } from '../../../core/planning/dailyPlanningUx';
import { optimizationDateHref } from '../../../core/planning/planningUx';
import { planningHistoryHref } from '../../../core/planning/planningHistoryLinks';
import type { PlanningHistoryWeeklyData } from '../../../core/api/planningHistory';
import { PlanningStatusBadge } from '../PlanningStatusBadge';

interface PlanningHistoryWeekViewProps {
  data: PlanningHistoryWeeklyData;
  weekStart: string;
}

export function PlanningHistoryWeekView(props: PlanningHistoryWeekViewProps) {
  const weekEnd = () => {
    const days = weekDaysFromMonday(props.weekStart);
    return days[6]!;
  };

  const [context] = createResource(
    () => `${props.weekStart}|${weekEnd()}`,
    async () => {
      const [dailyPlans, pending] = await Promise.all([
        fetchDailyPlansInRange(props.weekStart, weekEnd()),
        fetchPendingVisits({ status: 'open' }),
      ]);
      const dailyByDate = new Map(dailyPlans.items.map((row) => [row.operationDate, row]));
      const openPending = pending.items.filter((visit) => {
        const target = visit.targetOperationDate;
        return target != null && target >= props.weekStart && target <= weekEnd();
      });
      const days = weekDaysFromMonday(props.weekStart);
      const closedStatuses = new Set(['completed', 'partial']);
      const withPlan = days.filter((date) => dailyByDate.has(date));
      const closed = withPlan.filter((date) => closedStatuses.has(dailyByDate.get(date)!.status));
      const compliancePct =
        withPlan.length > 0 ? Math.round((closed.length / withPlan.length) * 100) : 0;
      return { dailyByDate, openPending, compliancePct, days };
    },
  );

  const primaryPlan = () => props.data.items[0] as WeeklyPlan | undefined;

  return (
    <div class="space-y-4">
      <For each={props.data.items}>
        {(plan) => (
          <Card>
            <CardHeader
              title={`Semana ${plan.weekStartDate} → ${plan.weekEndDate}`}
              subtitle="Vista directiva + operativa"
            />
            <div class="mb-4 flex flex-wrap items-center gap-3">
              <PlanningStatusBadge status={plan.status} />
              <span class="text-sm text-text-secondary">{plan.days.length} días configurados</span>
            </div>
            <div class="grid gap-3 sm:grid-cols-3">
              <div class="rounded-lg border border-border px-3 py-2 dark:border-dark-border">
                <p class="text-xs text-text-muted">Cumplimiento (días cerrados)</p>
                <p class="text-2xl font-bold text-fero-green-dark">{context()?.compliancePct ?? '—'}%</p>
                <ProgressBar value={context()?.compliancePct ?? 0} max={100} color="green" size="sm" />
              </div>
              <div class="rounded-lg border border-border px-3 py-2 dark:border-dark-border">
                <p class="text-xs text-text-muted">Pendientes abiertos en la semana</p>
                <p class="text-2xl font-bold text-amber-700">{context()?.openPending.length ?? 0}</p>
              </div>
              <div class="rounded-lg border border-border px-3 py-2 dark:border-dark-border">
                <p class="text-xs text-text-muted">Planes del día registrados</p>
                <p class="text-2xl font-bold text-text-primary dark:text-white">
                  {context()?.dailyByDate.size ?? 0}
                </p>
              </div>
            </div>
          </Card>
        )}
      </For>

      <Show when={props.data.items.length === 0}>
        <Card>
          <p class="py-8 text-center text-sm text-text-muted">No hay plan semanal para este rango.</p>
        </Card>
      </Show>

      <Card>
        <CardHeader title="Días de la semana" subtitle="Clic para ver detalle del día" />
        <Show when={context.loading}>
          <p class="text-sm text-text-muted">Cargando planes diarios…</p>
        </Show>
        <ul class="divide-y divide-border dark:divide-dark-border">
          <For each={context()?.days ?? []}>
            {(date) => {
              const daily = () => context()?.dailyByDate.get(date);
              const configured = () =>
                primaryPlan()?.days.find((day) => day.operationDate === date)?.collectionPointIds.length ?? 0;
              return (
                <li class="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p class="font-semibold text-text-primary dark:text-white">{date}</p>
                    <p class="text-xs text-text-muted">
                      {configured()} puntos programados en plan semanal
                      {daily() ? ` · plan del día: ${daily()!.status}` : ' · sin plan del día'}
                    </p>
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <Show when={daily()}>
                      <PlanningStatusBadge status={daily()!.status} />
                    </Show>
                    <A
                      href={planningHistoryHref({ operationDate: date })}
                      class="text-xs font-medium text-fero-blue hover:underline"
                    >
                      Ver en historial
                    </A>
                    <A
                      href={optimizationDateHref(date)}
                      class="text-xs font-medium text-fero-green-dark hover:underline"
                    >
                      Ir al plan del día
                    </A>
                  </div>
                </li>
              );
            }}
          </For>
        </ul>
      </Card>
    </div>
  );
}
