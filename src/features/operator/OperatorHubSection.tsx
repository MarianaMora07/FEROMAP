import { For, Show, createMemo, createResource, createSignal, onMount } from 'solid-js';
import { A } from '@solidjs/router';
import {
  AlertTriangle,
  ArrowRight,
  MapPin,
  Radio,
  Wrench,
} from 'lucide-solid';
import { Button, Card, CardHeader, KpiCard, LoadingPanel, ProgressBar } from '../../design-system/components';
import { fetchDailyPlan } from '../../core/api/planning';
import { fetchMonitoringStatus } from '../../core/api/monitoring';
import { fetchOperatorRouteSnapshot } from '../../core/api/operator';
import { fetchRecentIncidents } from '../../core/api/contingencies';
import { authUser } from '../../core/stores/authStore';
import { dashboardView, loadDashboardData } from '../../core/stores/dashboardStore';
import { recentAlerts as mockRecentAlerts } from '../../data/mock/dashboard';
import { deriveOperatorFieldContext } from '../../core/operator/operatorUx';
import { fleetForOperatorField } from '../../core/operator/operatorMonitoringUx';
import {
  getOperatorQuickActions,
  deriveNextOperatorAction,
  operatorRouteStatusLabel,
} from '../../core/operator/operatorHubUx';
import {
  buildOperatorDaySummary,
  shouldShowOperatorDaySummary,
} from '../../core/operator/operatorDayClosureUx';
import { OPERATOR_EMPTY_PRESETS } from '../../core/operator/operatorEmptyStates';
import { PlanningEmptyState } from '../planning/PlanningEmptyState';
import { PlanningStatusBadge } from '../planning/PlanningStatusBadge';
import { BreakdownReporter } from '../contingency/BreakdownReporter';
import { OperatorContingencyBanner } from '../contingency/OperatorContingencyBanner';
import { OperatorMyIncidents } from '../contingency/OperatorMyIncidents';
import { OperatorGlossaryStrip } from './OperatorGlossaryStrip';
import { OperatorRoutePanel } from './OperatorRoutePanel';
import { OperatorDaySummaryCard } from './OperatorDaySummaryCard';
import { OperatorLevelBanner } from './OperatorLevelBanner';

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

const quickActionIcons = {
  monitoring: Radio,
  map: MapPin,
  alerts: AlertTriangle,
  breakdown: Wrench,
} as const;

interface OperatorHubSectionProps {
  variant?: 'dashboard' | 'landing';
}

export function OperatorHubSection(props: OperatorHubSectionProps) {
  const variant = () => props.variant ?? 'landing';
  const operationDate = () => new Date().toISOString().slice(0, 10);

  onMount(() => {
    if (variant() === 'dashboard') {
      void loadDashboardData();
    }
  });

  const [dailyPlan, { refetch: refetchPlan }] = createResource(operationDate, (date) =>
    fetchDailyPlan(date),
  );
  const [monitoring, { refetch: refetchMonitoring }] = createResource(fetchMonitoringStatus);
  const [routeSnapshot, { refetch: refetchRouteSnapshot }] = createResource(operationDate, (date) =>
    fetchOperatorRouteSnapshot(date),
  );

  const context = createMemo(() =>
    deriveOperatorFieldContext({
      plan: dailyPlan(),
      fleet: monitoring()?.liveFleet ?? [],
      user: authUser(),
      operationDate: operationDate(),
    }),
  );

  const operatorVehicleId = () => context().vehicle?.id ?? routeSnapshot()?.vehicleId ?? null;

  const [incidents] = createResource(
    () => operatorVehicleId() ?? 'all',
    (vehicleId) =>
      fetchRecentIncidents({
        vehicleId: vehicleId === 'all' ? undefined : vehicleId,
        hours: 48,
        limit: 20,
      }),
  );

  const nextAction = createMemo(() =>
    deriveNextOperatorAction(context(), {
      date: operationDate(),
      vehicleId: operatorVehicleId() ?? undefined,
    }),
  );
  const quickActions = createMemo(() =>
    getOperatorQuickActions({
      date: operationDate(),
      vehicleId: operatorVehicleId() ?? undefined,
      readOnly: context().isDayClosed,
    }),
  );
  const daySummary = createMemo(() =>
    buildOperatorDaySummary({
      plan: dailyPlan(),
      snapshot: routeSnapshot(),
      incidentsCount: incidents()?.length ?? 0,
    }),
  );
  const showDaySummary = createMemo(() =>
    shouldShowOperatorDaySummary({
      plan: dailyPlan(),
      hasPendingStops: context().hasPendingStops,
    }),
  );
  const [incidentsRefreshKey, setIncidentsRefreshKey] = createSignal(0);
  const loading = () => dailyPlan.loading || monitoring.loading;
  const recentAlerts = () => dashboardView()?.recentAlerts ?? mockRecentAlerts;

  const fleetForReporter = () =>
    fleetForOperatorField(monitoring()?.liveFleet ?? [], authUser()).map((vehicle) => ({
      id: vehicle.id,
      routeId: vehicle.routeId,
      status: vehicle.status,
    }));

  const emptyPreset = () => {
    const ctx = context();
    if (ctx.isDayClosed) return OPERATOR_EMPTY_PRESETS.dayClosedByPlanning;
    if (!ctx.hasDispatchedPlan) return OPERATOR_EMPTY_PRESETS.noDispatchedRoute;
    if (!ctx.hasAssignedVehicle) return OPERATOR_EMPTY_PRESETS.noVehicleAssigned;
    return OPERATOR_EMPTY_PRESETS.noPendingStops;
  };

  const showActiveJourney = () => {
    const ctx = context();
    return ctx.hasDispatchedPlan && ctx.hasAssignedVehicle && ctx.hasPendingStops;
  };

  const handleRefresh = () => {
    void refetchPlan();
    void refetchMonitoring();
    void refetchRouteSnapshot();
  };

  return (
    <section class="space-y-4" data-testid="operator-hub">
      <div class="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Campo
          </p>
          <h2 class="font-heading text-xl font-bold text-text-primary dark:text-white">Mi operación</h2>
          <p class="mt-1 text-sm text-text-secondary">
            Resumen de tu jornada — ejecución en ruta, no planificación.
          </p>
        </div>
        <Show when={variant() === 'dashboard'}>
          <A href="/operator" class="text-sm font-medium text-fero-blue hover:underline">
            Ver hub completo
          </A>
        </Show>
      </div>

      <Show when={loading()}>
        <Card aria-busy="true">
          <LoadingPanel label="Cargando tu jornada…" indeterminate />
        </Card>
      </Show>

      <Show when={!loading()}>
        <Show when={!context().isDayClosed}>
          <OperatorContingencyBanner />
        </Show>

        <Show when={context().isDayClosed}>
          <OperatorLevelBanner title="Solo lectura — jornada cerrada">
            <p class="text-sm text-text-secondary">
              Planificación cerró el día operativo. Puedes consultar tu resumen y el plan, pero no
              despachar, cerrar ni modificar la jornada.
            </p>
          </OperatorLevelBanner>
        </Show>

        <div
          class={`rounded-xl border px-4 py-4 ${toneClass[nextAction().tone]}`}
          data-testid="operator-next-action"
        >
          <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Qué hacer ahora</p>
          <div class="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class={`text-lg font-bold ${titleClass[nextAction().tone]}`}>{nextAction().message}</p>
              <p class="mt-1 text-sm text-text-secondary">{nextAction().detail}</p>
            </div>
            <A href={nextAction().href}>
              <Button
                variant={nextAction().tone === 'warning' ? 'primary' : 'outline'}
                class="gap-2 shrink-0"
              >
                {nextAction().label}
                <ArrowRight size={14} />
              </Button>
            </A>
          </div>
        </div>

        <Card data-testid="operator-mi-jornada">
          <CardHeader
            title="Mi jornada"
            subtitle={context().operationDate}
            action={
              <button
                type="button"
                class="text-xs font-medium text-fero-blue hover:underline"
                onClick={handleRefresh}
              >
                Actualizar
              </button>
            }
          />
          <Show when={showDaySummary()}>
            <OperatorDaySummaryCard summary={daySummary()} compact={variant() === 'dashboard'} />
          </Show>
          <Show
            when={showActiveJourney()}
            fallback={
              <Show when={!showDaySummary()}>
                <PlanningEmptyState {...emptyPreset()} compact />
              </Show>
            }
          >
            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                title="Fecha"
                value={context().operationDate}
                iconTone="blue"
                footer={<span class="text-xs text-text-muted">Jornada operativa</span>}
              />
              <KpiCard
                title="Vehículo"
                value={context().vehicle?.id ?? '—'}
                iconTone="green"
                footer={
                  <span class="text-xs text-text-muted">{context().vehicle?.route ?? 'Sin ruta'}</span>
                }
              />
              <KpiCard
                title="Estado"
                value={operatorRouteStatusLabel(context())}
                iconTone="amber"
                footer={
                  <PlanningStatusBadge status={context().planStatus ?? 'draft'} class="mt-1" />
                }
              />
              <KpiCard
                title="Avance"
                value={`${context().vehicle?.progress ?? 0}%`}
                iconTone="green"
                footer={
                  <ProgressBar
                    value={context().vehicle?.progress ?? 0}
                    color="green"
                    size="sm"
                    class="mt-1"
                  />
                }
              />
            </div>
            <Show when={context().vehicle}>
              {(vehicle) => (
                <p class="mt-3 text-sm text-text-secondary">
                  Próxima parada:{' '}
                  <strong class="text-text-primary dark:text-white">{vehicle().nextPoint}</strong>
                </p>
              )}
            </Show>
          </Show>
        </Card>

        <Show when={context().hasDispatchedPlan}>
          <OperatorRoutePanel
            snapshot={routeSnapshot()}
            loading={routeSnapshot.loading}
            onRefresh={handleRefresh}
            vehicleId={operatorVehicleId()}
            operationDate={operationDate()}
          />
        </Show>

        <div class="flex flex-wrap gap-2" data-testid="operator-quick-actions">
          <For each={quickActions()}>
            {(item) => {
              const Icon = quickActionIcons[item.id];
              return (
                <A href={item.href}>
                  <Button variant="outline" size="sm" class="gap-2">
                    <Icon size={14} />
                    {item.label}
                  </Button>
                </A>
              );
            }}
          </For>
        </div>

        <Show when={showActiveJourney() && !context().isDayClosed && fleetForReporter().length > 0}>
          <Card id="reportar-averia">
            <CardHeader title="Reportar avería" subtitle="Contingencia en ruta" />
            <BreakdownReporter
              variant="operator"
              compact={variant() === 'dashboard'}
              vehicles={fleetForReporter()}
              onComplete={() => {
                handleRefresh();
                setIncidentsRefreshKey((value) => value + 1);
              }}
            />
          </Card>
        </Show>

        <Show when={context().hasDispatchedPlan && (showActiveJourney() || showDaySummary())}>
          <OperatorMyIncidents
            vehicleId={operatorVehicleId()}
            refreshKey={incidentsRefreshKey()}
            readOnly={context().isDayClosed}
          />
        </Show>
      </Show>

      <Show when={variant() === 'landing'}>
        <OperatorGlossaryStrip />
      </Show>

      <Show when={variant() === 'dashboard'}>
        <Card>
          <CardHeader title="Alertas recientes" />
          <ul class="space-y-3">
            <For each={recentAlerts().slice(0, 3)}>
              {(alert) => (
                <li class="flex gap-3 border-b border-border pb-3 last:border-0 dark:border-dark-border">
                  <AlertTriangle size={16} class="mt-0.5 shrink-0 text-amber-600" />
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-text-primary dark:text-white">{alert.title}</p>
                    <p class="text-xs text-text-muted">{alert.detail}</p>
                  </div>
                </li>
              )}
            </For>
          </ul>
          <A href="/alerts" class="mt-2 inline-block text-sm font-medium text-fero-blue hover:underline">
            Ver todas las alertas
          </A>
        </Card>
      </Show>
    </section>
  );
}
