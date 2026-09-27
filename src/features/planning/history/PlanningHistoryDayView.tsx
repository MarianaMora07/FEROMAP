import { For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { Download, Radio } from 'lucide-solid';
import { Button, Card, CardHeader } from '../../../design-system/components';
import { downloadDailyPlanPdf, type DailyPlan } from '../../../core/api/planning';
import type { OperationalHistoryRow } from '../../../core/utils/operationalHistory';
import { mondayOfDate } from '../../../core/planning/dailyPlanningUx';
import { optimizationDateHref } from '../../../core/planning/planningUx';
import { planningHistoryHref } from '../../../core/planning/planningHistoryLinks';
import { PlanningStatusBadge } from '../PlanningStatusBadge';

interface PlanningHistoryDayViewProps {
  plan: DailyPlan;
  operationalRuns: OperationalHistoryRow[];
}

export function PlanningHistoryDayView(props: PlanningHistoryDayViewProps) {
  const handlePdf = async () => {
    const blob = await downloadDailyPlanPdf(props.plan.id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `plan-diario-${props.plan.operationDate}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const linkedRun = () =>
    props.operationalRuns.find(
      (row) => row.dailyPlanId === props.plan.id || row.operationDate === props.plan.operationDate,
    ) ?? props.operationalRuns[0];

  return (
    <div class="space-y-4">
      <Card>
        <CardHeader
          title={`Plan del día ${props.plan.operationDate}`}
          subtitle="Detalle administrativo"
          action={
            <A href={optimizationDateHref(props.plan.operationDate)}>
              <Button size="sm" variant="outline">
                Ir al plan del día
              </Button>
            </A>
          }
        />
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <PlanningStatusBadge status={props.plan.status} />
          <span class="text-sm text-text-secondary">
            {props.plan.scheduledPoints.length} programados · {props.plan.pendingPoints.length} pendientes ·{' '}
            {props.plan.finalPointIds.length} total
          </span>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" class="gap-1" icon={<Download size={14} />} onClick={() => void handlePdf()}>
            Descargar PDF
          </Button>
          <A href={planningHistoryHref({ weekStart: mondayOfDate(props.plan.operationDate) })}>
            <Button size="sm" variant="outline">
              Ver semana
            </Button>
          </A>
          <Show when={props.plan.status === 'dispatched'}>
            <A href="/monitoring">
              <Button size="sm" variant="outline" class="gap-1" icon={<Radio size={14} />}>
                Ver en monitoreo
              </Button>
            </A>
          </Show>
        </div>
        <Show when={props.plan.pendingPoints.length > 0}>
          <div class="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-950/20">
            <p class="text-sm font-semibold text-amber-800 dark:text-amber-300">Pendientes del día</p>
            <ul class="mt-2 space-y-1 text-sm text-text-secondary">
              <For each={props.plan.pendingPoints}>
                {(visit) => (
                  <li>
                    {visit.code} — origen {visit.originOperationDate} ({visit.reason})
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
      </Card>

      <Card>
        <CardHeader title="Corrida ACO vinculada" subtitle="Optimización operativa del día" />
        <Show
          when={props.plan.simulationId ?? linkedRun()?.id}
          fallback={<p class="text-sm text-text-muted">Este día no tiene corrida ACO registrada.</p>}
        >
          <dl class="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt class="text-text-muted">Simulación #</dt>
              <dd class="font-semibold text-text-primary dark:text-white">
                {props.plan.simulationId ?? linkedRun()?.id}
              </dd>
            </div>
            <Show when={linkedRun()?.distanceKm != null}>
              <div>
                <dt class="text-text-muted">Distancia optimizada</dt>
                <dd class="font-semibold text-text-primary dark:text-white">
                  {linkedRun()!.distanceKm!.toFixed(1)} km
                </dd>
              </div>
            </Show>
            <Show when={linkedRun()?.pointCount != null}>
              <div>
                <dt class="text-text-muted">Puntos</dt>
                <dd class="font-semibold text-text-primary dark:text-white">{linkedRun()!.pointCount}</dd>
              </div>
            </Show>
            <Show when={linkedRun()?.efficiency != null}>
              <div>
                <dt class="text-text-muted">Ahorro estimado</dt>
                <dd class="font-semibold text-text-primary dark:text-white">{linkedRun()!.efficiency}%</dd>
              </div>
            </Show>
          </dl>
        </Show>
      </Card>
    </div>
  );
}
