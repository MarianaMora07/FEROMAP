import { For, Show, createMemo, createResource } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowLeft } from 'lucide-solid';
import { Card, CardHeader, LoadingPanel, ProgressBar } from '../../design-system/components';
import { fetchDailyPlan } from '../../core/api/planning';
import { fetchOperatorRouteSnapshot } from '../../core/api/operator';
import { fetchRecentIncidents } from '../../core/api/contingencies';
import { buildOperatorDaySummary, isClosedDailyPlan } from '../../core/operator/operatorDayClosureUx';
import { deriveOperatorFieldContext } from '../../core/operator/operatorUx';
import { fetchMonitoringStatus } from '../../core/api/monitoring';
import { authUser } from '../../core/stores/authStore';
import { PlanningStatusBadge } from '../planning/PlanningStatusBadge';
import { OperatorLevelBanner } from './OperatorLevelBanner';
import { OperatorDaySummaryCard } from './OperatorDaySummaryCard';
import { OperatorMyIncidents } from '../contingency/OperatorMyIncidents';
import { OperatorRoutePanel } from './OperatorRoutePanel';
import { OperatorMobilePlayback } from './OperatorMobilePlayback';

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
  const hasStops = () => (snapshot()?.stops.length ?? 0) > 0;

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
        <h1 id="page-title" class="font-heading text-2xl font-bold text-text-primary dark:text-white">
          Plan del día
        </h1>
        <p class="mt-1 text-sm text-text-secondary">
          Vista de solo lectura — paradas y mapa de tu ruta asignada.
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

        <div class="grid gap-4 lg:grid-cols-2 lg:items-start">
          <Card class="lg:sticky lg:top-4" data-testid="operator-plan-map-card">
            <CardHeader title="Mapa de ruta" subtitle="Recorrido asignado del día" />
            <Show
              when={hasStops() && snapshot()?.vehicleId}
              fallback={
                <p class="text-sm text-text-secondary">
                  Sin geometría de ruta. Espera el despacho de planificación.
                </p>
              }
            >
              <OperatorMobilePlayback
                dailyPlanId={snapshot()?.dailyPlanId}
                vehicleId={snapshot()!.vehicleId!}
                routeSnapshot={snapshot()}
                class="h-56 sm:h-64"
              />
            </Show>
          </Card>

          <Card class="max-h-[min(70vh,560px)] overflow-y-auto" data-testid="operator-plan-stops-card">
            <CardHeader title="Secuencia de paradas" subtitle="Orden de visita en ruta" />
            <OperatorRoutePanel
              embedded
              snapshot={snapshot()}
              loading={snapshot.loading}
              onRefresh={() => void refetch()}
              vehicleId={vehicleId()}
              operationDate={operationDate()}
            />
          </Card>
        </div>

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
