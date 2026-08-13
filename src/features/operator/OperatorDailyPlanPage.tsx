import { For, Show, createMemo, createResource } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowLeft } from 'lucide-solid';
import { Badge, Card, CardHeader, LoadingPanel, ProgressBar } from '../../design-system/components';
import { fetchDailyPlan } from '../../core/api/planning';
import { fetchOperatorRouteSnapshot, operatorStopStatusLabel, operatorStopStatusVariant } from '../../core/api/operator';
import { fetchRecentIncidents } from '../../core/api/contingencies';
import { buildOperatorDaySummary, isClosedDailyPlan } from '../../core/operator/operatorDayClosureUx';
import { deriveOperatorFieldContext } from '../../core/operator/operatorUx';
import { fetchMonitoringStatus } from '../../core/api/monitoring';
import { authUser } from '../../core/stores/authStore';
import { PlanningStatusBadge } from '../planning/PlanningStatusBadge';
import { OperatorLevelBanner } from './OperatorLevelBanner';
import { OperatorDaySummaryCard } from './OperatorDaySummaryCard';
import { OperatorMyIncidents } from '../contingency/OperatorMyIncidents';

export default function OperatorDailyPlanPage() {
  const operationDate = () => new Date().toISOString().slice(0, 10);

  const [dailyPlan] = createResource(operationDate, (date) => fetchDailyPlan(date));
  const [snapshot, { refetch }] = createResource(operationDate, (date) =>
    fetchOperatorRouteSnapshot(date),
  );
  const [monitoring] = createResource(fetchMonitoringStatus);
  const vehicleId = () =>
    deriveOperatorFieldContext({
      plan: dailyPlan(),
      fleet: monitoring()?.liveFleet ?? [],
      user: authUser(),
      operationDate: operationDate(),
    }).vehicle?.id ?? snapshot()?.vehicleId ?? null;
  const [incidents] = createResource(
    () => vehicleId() ?? 'all',
    (id) =>
      fetchRecentIncidents({
        vehicleId: id === 'all' ? undefined : id,
        hours: 48,
        limit: 20,
      }),
  );
  const daySummary = createMemo(() =>
    buildOperatorDaySummary({
      plan: dailyPlan(),
      snapshot: snapshot(),
      incidentsCount: incidents()?.length ?? 0,
    }),
  );
  const isDayClosed = () => isClosedDailyPlan(dailyPlan());

  const loading = () => dailyPlan.loading || snapshot.loading;

  return (
    <div class="space-y-5" data-testid="operator-daily-plan">
      <div>
        <A
          href="/operator"
          class="mb-3 inline-flex items-center gap-1 text-sm font-medium text-fero-blue hover:underline"
        >
          <ArrowLeft size={14} />
          Volver a Mi operación
        </A>
        <h1 class="font-heading text-2xl font-bold text-text-primary dark:text-white">
          Plan del día
        </h1>
        <p class="mt-1 text-sm text-text-secondary">
          Vista de solo lectura — sin optimizar ni despachar.
        </p>
      </div>

      <OperatorLevelBanner title="Solo lectura">
        <p class="text-sm text-text-secondary">
          Esta vista muestra el plan asignado a tu jornada. Los cambios los realiza planificación.
          No hay acciones de despacho ni cierre de día disponibles para conductores.
        </p>
      </OperatorLevelBanner>

      <Show when={isDayClosed()}>
        <OperatorLevelBanner title="Jornada cerrada">
          <p class="text-sm text-text-secondary">
            Planificación cerró esta jornada. El resumen y las paradas son solo consulta.
          </p>
        </OperatorLevelBanner>
      </Show>

      <Show when={loading()}>
        <Card>
          <LoadingPanel label="Cargando plan del día…" indeterminate />
        </Card>
      </Show>

      <Show when={!loading()}>
        <Show when={daySummary().stopsTotal > 0 || isDayClosed()}>
          <Card>
            <CardHeader title="Resumen del día" subtitle="Cierre de jornada (consulta)" />
            <OperatorDaySummaryCard summary={daySummary()} />
          </Card>
        </Show>

        <Card>
          <CardHeader
            title={`Jornada ${snapshot()?.operationDate ?? operationDate()}`}
            subtitle={snapshot()?.routeLabel ?? 'Sin ruta asignada'}
            action={
              <button
                type="button"
                class="text-xs font-medium text-fero-blue hover:underline"
                onClick={() => void refetch()}
              >
                Actualizar
              </button>
            }
          />
          <div class="flex flex-wrap items-center gap-3 text-sm">
            <Show when={dailyPlan()?.status}>
              {(status) => <PlanningStatusBadge status={status()} />}
            </Show>
            <Show when={snapshot()?.vehicleId}>
              <span class="text-text-secondary">Vehículo: {snapshot()!.vehicleId}</span>
            </Show>
            <Show when={snapshot()?.stopsTotal}>
              <span class="text-text-secondary">
                {snapshot()!.stopsDone} / {snapshot()!.stopsTotal} paradas
              </span>
            </Show>
          </div>
          <Show when={(snapshot()?.stopsTotal ?? 0) > 0}>
            <ProgressBar
              value={snapshot()!.progress}
              color="green"
              size="sm"
              class="mt-3"
            />
          </Show>
        </Card>

        <Card>
          <CardHeader title="Secuencia de paradas" subtitle="Orden de visita en ruta" />
          <Show
            when={(snapshot()?.stops.length ?? 0) > 0}
            fallback={
              <p class="text-sm text-text-secondary">
                No hay paradas asignadas. Revisa el estado del despacho con planificación.
              </p>
            }
          >
            <div class="overflow-x-auto">
              <table class="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr class="border-b border-border text-xs uppercase tracking-wide text-text-muted dark:border-dark-border">
                    <th class="px-2 py-2">#</th>
                    <th class="px-2 py-2">Código</th>
                    <th class="px-2 py-2">Sector</th>
                    <th class="px-2 py-2">Estado</th>
                    <th class="px-2 py-2">Dirección</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={snapshot()!.stops}>
                    {(stop) => (
                      <tr class="border-b border-border last:border-0 dark:border-dark-border">
                        <td class="px-2 py-2.5 font-semibold text-text-primary dark:text-white">
                          {stop.sequenceOrder}
                        </td>
                        <td class="px-2 py-2.5 font-medium">{stop.code}</td>
                        <td class="px-2 py-2.5 text-text-secondary">{stop.sectorName ?? '—'}</td>
                        <td class="px-2 py-2.5">
                          <Badge variant={operatorStopStatusVariant(stop.status)} size="sm">
                            {operatorStopStatusLabel(stop.status)}
                          </Badge>
                        </td>
                        <td class="max-w-xs truncate px-2 py-2.5 text-text-secondary" title={stop.address}>
                          {stop.address}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Card>

        <Show when={dailyPlan()?.pendingPoints?.length}>
          <Card>
            <CardHeader title="Pendientes del plan" subtitle="Visitas arrastradas (información)" />
            <ul class="space-y-2 text-sm">
              <For each={dailyPlan()!.pendingPoints}>
                {(visit) => (
                  <li class="flex justify-between gap-2 border-b border-border pb-2 last:border-0 dark:border-dark-border">
                    <span class="font-medium">{visit.code}</span>
                    <span class="text-text-muted">{visit.reason}</span>
                  </li>
                )}
              </For>
            </ul>
          </Card>
        </Show>

        <Show when={isDayClosed() || (snapshot()?.stopsTotal ?? 0) > 0}>
          <OperatorMyIncidents vehicleId={vehicleId()} readOnly={isDayClosed()} />
        </Show>
      </Show>
    </div>
  );
}
