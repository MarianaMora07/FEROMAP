import { For, Show, createMemo, createResource, createSignal } from 'solid-js';
import { A } from '@solidjs/router';
import {
  AlertTriangle,
  ArrowRight,
  MapPin,
  Radio,
  Wrench,
} from 'lucide-solid';
import { Button, Card, CardHeader, LoadingPanel } from '../../design-system/components';
import { fetchDailyPlan } from '../../core/api/planning';
import { fetchMonitoringStatus } from '../../core/api/monitoring';
import { fetchOperatorRouteSnapshot } from '../../core/api/operator';
import { fetchRecentIncidents } from '../../core/api/contingencies';
import { authUser } from '../../core/stores/authStore';
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
import { BreakdownReporter } from '../contingency/BreakdownReporter';
import { OperatorContingencyBanner } from '../contingency/OperatorContingencyBanner';
import { OperatorMyIncidents } from '../contingency/OperatorMyIncidents';
import { OperatorGlossaryStrip } from './OperatorGlossaryStrip';
import { OperatorHubDashboardMinimal } from './OperatorHubDashboardMinimal';
import { OperatorJourneyStrip } from './OperatorJourneyStrip';
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
  /** Oculta el encabezado cuando la página padre ya muestra intro */
  showPageHeader?: boolean;
}

export function OperatorHubSection(props: OperatorHubSectionProps) {
  const variant = () => props.variant ?? 'landing';
  const showPageHeader = () => props.showPageHeader ?? true;
  const operationDate = () => new Date().toISOString().slice(0, 10);

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
    <Show
      when={variant() === 'landing'}
      fallback={
        <OperatorHubDashboardMinimal
          loading={loading()}
          context={context()}
          nextAction={nextAction()}
          quickActions={quickActions()}
          showJourney={showActiveJourney()}
        />
      }
    >
    <section class="space-y-4" data-testid="operator-hub">
      <Show when={showPageHeader()}>
        <div class="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              Campo
            </p>
            <h2 class="font-heading text-xl font-bold text-text-primary dark:text-white">Mi operación</h2>
          </div>
        </div>
      </Show>

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
            <OperatorDaySummaryCard summary={daySummary()} />
          </Show>
          <Show
            when={showActiveJourney()}
            fallback={
              <Show when={!showDaySummary()}>
                <PlanningEmptyState {...emptyPreset()} compact />
              </Show>
            }
          >
            <div class="px-1 pb-1">
              <OperatorJourneyStrip
                operationDate={context().operationDate}
                vehicleId={context().vehicle?.id}
                routeLabel={context().vehicle?.route}
                statusLabel={operatorRouteStatusLabel(context())}
                planStatus={context().planStatus}
                progress={routeSnapshot()?.progress ?? context().vehicle?.progress ?? 0}
                nextPoint={routeSnapshot()?.nextStop?.code ?? context().vehicle?.nextPoint}
                nextStopType={routeSnapshot()?.nextStop?.stopType}
                shiftUtilizationPct={routeSnapshot()?.shiftUtilizationPct}
              />
            </div>
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

      <details class="group rounded-xl border border-default bg-elevated">
        <summary class="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-text-primary marker:content-none">
          Glosario de campo
        </summary>
        <div class="border-t border-default px-4 py-3">
          <OperatorGlossaryStrip />
        </div>
      </details>
    </section>
    </Show>
  );
}
