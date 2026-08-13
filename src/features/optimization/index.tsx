import { For, Show, createEffect, createMemo, createSignal, onMount } from 'solid-js';
import { A, useNavigate, useSearchParams } from '@solidjs/router';
import {
  Sparkles,
  MapPin,
  Route,
  Clock,
  Weight,
  Truck,
  Fuel,
  CheckCircle2,
  Send,
  Loader2,
  Map,
} from 'lucide-solid';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ProgressBar,
  SelectField,
  TextField,
} from '../../design-system/components';
import { canOptimize } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { appState } from '../../core/stores/appStore';
import {
  dispatchOptimizationResult,
  executeOptimization,
  closeOptimizationDay,
  initOptimizationPage,
  optimizationState,
  refreshDailyPlan,
  selectOperationDate,
  setOptimizationScenario,
  updateOptimizationPreset,
} from '../../core/stores/optimizationStore';
import {
  buildResultsTotals,
  buildRouteResults,
  buildScenarioInfoRows,
} from '../../core/utils/optimizationResults';
import {
  constraints as constraintDefs,
  optimizationTabs,
  type OptimizationTabId,
} from '../../data/mock/optimization';
import type { OptimizationConstraints } from '../../core/api/optimization';
import type { ScenarioId } from '../../data/types/simulation';
import { downloadDailyPlanPdf } from '../../core/api/planning';
import { optimizationDateHref, tomorrowIso } from '../../core/planning/planningUx';
import { monitoringHref, optimizationHref, operationalMapHref } from '../../core/planning/operationalLinks';
import { PendingManagementPanel } from './PendingManagementPanel';
import { ModuleGuidanceBanner } from '../shared/ModuleGuidanceBanner';
import { PlanningContextualCta } from '../planning/PlanningContextualCta';
import { PlanningEmptyState } from '../planning/PlanningEmptyState';
import { PLANNING_EMPTY_PRESETS } from '../../core/planning/planningEmptyStates';
import { PlanningLevelBanner } from '../planning/PlanningLevelBanner';
import { PlanningStatusBadge } from '../planning/PlanningStatusBadge';
import { OptimizationRouteMap } from './OptimizationRouteMap';
import { OptimizationWeekCalendar } from './OptimizationWeekCalendar';
import { DailyPlanTimeline } from './DailyPlanTimeline';
import { OptimizationHistoryPanel } from './OptimizationHistoryPanel';

const vehicleToneClass = {
  blue: 'bg-fero-blue/10 text-fero-blue border-fero-blue/20',
  green: 'bg-fero-green/15 text-fero-green-dark border-fero-green/30',
  purple: 'bg-violet-100 text-violet-700 border-violet-200',
};

const vehicleIconClass = {
  blue: 'bg-fero-blue/10 text-fero-blue',
  green: 'bg-fero-green/15 text-fero-green-dark',
  purple: 'bg-violet-100 text-violet-600',
};

const scenarioIconMap = {
  'map-pin': MapPin,
  route: Route,
  clock: Clock,
  weight: Weight,
} as const;

function FieldLabel(props: { children: string }) {
  return (
    <p class="mb-1.5 text-sm font-semibold text-text-primary">{props.children}</p>
  );
}

function ParametersForm(props: {
  onGenerate: () => void;
  onDateChange: (date: string) => void;
  disabled?: boolean;
}) {
  const preset = () => optimizationState.preset;
  const context = () => optimizationState.context;
  const assignableVehicles = () => context()?.assignableVehicles ?? [];

  const toggleConstraint = (id: keyof OptimizationConstraints) => {
    updateOptimizationPreset({
      constraints: { ...preset().constraints, [id]: !preset().constraints[id] },
    });
  };

  return (
    <Card>
      <CardHeader title="Parámetros de optimización" />
      <form
        class="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          props.onGenerate();
        }}
      >
        <TextField
          label="Fecha de operación"
          type="date"
          name="operationDate"
          value={preset().operationDate}
          onInput={(e) => props.onDateChange(e.currentTarget.value)}
        />

        <p class="text-xs text-text-muted -mt-2">
          También puedes elegir el día en el calendario semanal.
        </p>

        <div>
          <FieldLabel>Vehículos disponibles ({assignableVehicles().length})</FieldLabel>
          <div class="flex flex-wrap gap-2 rounded-md border border-default bg-elevated px-3 py-2.5">
            <Show
              when={assignableVehicles().length > 0}
              fallback={<span class="text-xs text-text-muted">Sin vehículos asignables</span>}
            >
              <For each={assignableVehicles()}>
                {(v, index) => {
                  const tones = ['blue', 'green', 'purple'] as const;
                  const tone = tones[index() % tones.length]!;
                  return (
                    <span
                      class={`inline-flex flex-col rounded-full border px-2.5 py-0.5 text-xs font-semibold ${vehicleToneClass[tone]}`}
                      title={v.driver !== '—' ? v.driver : 'Sin conductor asignado'}
                    >
                      <span>{v.id}</span>
                      <Show when={v.driver && v.driver !== '—'}>
                        <span class="text-[10px] font-medium opacity-80">{v.driver}</span>
                      </Show>
                    </span>
                  );
                }}
              </For>
            </Show>
          </div>
        </div>

        <SelectField
          label="Condición operativa del día"
          name="scenario"
          value={preset().scenarioId}
          onChange={(e) => setOptimizationScenario(e.currentTarget.value as ScenarioId)}
        >
          <For each={context()?.scenarios ?? []}>
            {(scenario) => <option value={scenario.id}>{scenario.label}</option>}
          </For>
        </SelectField>
        <p class="-mt-2 text-xs text-text-muted">
          Para comparar condiciones (lluvia, saturación, impacto en KPIs), usa{' '}
          <A href="/simulation" class="font-medium text-fero-blue hover:underline">
            Simulación de escenarios
          </A>
          .
        </p>

        <div class="rounded-lg border border-default bg-elevated px-3 py-2.5">
          <p class="text-sm font-semibold text-text-primary">Algoritmo del motor</p>
          <p class="mt-1 text-sm text-text-secondary">Colonia de Hormigas (ACO) — 12 hormigas × 20 iteraciones</p>
          <p class="mt-2 text-xs text-text-muted">
            Único algoritmo soportado por el backend en esta versión.
          </p>
        </div>

        <div class="rounded-lg border border-dashed border-default px-3 py-2.5">
          <p class="text-sm font-semibold text-text-muted">Objetivo de optimización</p>
          <p class="mt-1 text-xs text-text-muted">
            Próximamente — el motor minimiza distancia/tiempo con ACO.
          </p>
        </div>

        <div>
          <FieldLabel>Restricciones</FieldLabel>
          <ul class="space-y-2.5">
            <For each={constraintDefs}>
              {(item) => {
                const connected = item.id === 'avoid_traffic' || item.id === 'critical_first';
                return (
                  <li>
                    <label
                      class={`flex items-start gap-2.5 text-sm ${
                        connected ? 'cursor-pointer text-text-secondary' : 'text-text-muted'
                      }`}
                    >
                      <input
                        type="checkbox"
                        class="mt-0.5 size-4 rounded border-default accent-fero-green-mid"
                        checked={preset().constraints[item.id as keyof OptimizationConstraints]}
                        disabled={!connected}
                        onChange={() =>
                          connected && toggleConstraint(item.id as keyof OptimizationConstraints)
                        }
                      />
                      <span>
                        {item.label}
                        <span class="mt-0.5 block text-[11px] text-text-muted">
                          {connected
                            ? 'Influye en el escenario inferido si no eliges uno explícito.'
                            : 'Próximamente — no modifica el motor actual.'}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              }}
            </For>
          </ul>
        </div>

        <Button
          type="submit"
          variant="gradient"
          size="lg"
          class="w-full font-semibold"
          icon={optimizationState.isOptimizing ? <Loader2 size={18} class="animate-spin" /> : <Sparkles size={18} />}
          disabled={
            props.disabled ||
            optimizationState.isOptimizing ||
            !canOptimize(authUser()?.role) ||
            !optimizationState.weeklyPlanApproved
          }
          title={!optimizationState.weeklyPlanApproved ? 'Falta aprobar plan semanal' : undefined}
        >
          {optimizationState.isOptimizing
            ? `Ejecutando optimización… ${optimizationState.optimizationProgress}%`
            : 'Generar ruta operativa'}
        </Button>
      </form>
    </Card>
  );
}

function ScenarioInfoCard() {
  const context = () => optimizationState.context;
  const kpis = () => optimizationState.kpis;
  const rows = createMemo(() =>
    buildScenarioInfoRows(
      context()?.pointsToVisit ?? 0,
      kpis(),
      context()?.pointsContext.criticalCount ?? 0,
    ),
  );

  return (
    <Card>
      <CardHeader title="Resumen operativo del día" />
      <ul class="space-y-3">
        <For each={rows()}>
          {(row) => {
            const Icon = scenarioIconMap[row.icon];
            return (
              <li class="flex items-center justify-between gap-3 text-sm">
                <span class="flex items-center gap-2 text-text-secondary">
                  <span class="flex h-8 w-8 items-center justify-center rounded-md bg-fero-blue/10 text-fero-blue">
                    <Icon size={16} />
                  </span>
                  {row.label}
                </span>
                <span class="font-semibold text-text-primary">{row.value}</span>
              </li>
            );
          }}
        </For>
      </ul>
    </Card>
  );
}

function ResultsCard(props: {
  routeResults: ReturnType<typeof buildRouteResults>;
  totals: ReturnType<typeof buildResultsTotals>;
  driverByVehicleId?: Record<string, string>;
}) {
  return (
    <Card>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-heading font-semibold text-text-primary">
          Resultados de la optimización
        </h3>
        <Badge variant="success" class="gap-1">
          <CheckCircle2 size={12} />
          Ruta óptima encontrada
        </Badge>
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <For each={props.routeResults}>
          {(route) => (
            <div class="rounded-lg border border-default p-3">
              <div class="mb-3 flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <span class={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${vehicleToneClass[route.tone]}`}>
                    {route.id}
                  </span>
                  <Show when={props.driverByVehicleId?.[route.id]}>
                    <p class="mt-1 text-[11px] text-text-muted">{props.driverByVehicleId![route.id]}</p>
                  </Show>
                </div>
                <span class={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${vehicleIconClass[route.tone]}`}>
                  <Truck size={18} />
                </span>
              </div>
              <dl class="space-y-1.5 text-sm">
                <div class="flex justify-between gap-2">
                  <dt class="text-text-muted">Distancia</dt>
                  <dd class="font-semibold text-text-primary">{route.distanceKm} km</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-text-muted">Tiempo</dt>
                  <dd class="font-semibold text-text-primary">{route.duration}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-text-muted">Puntos</dt>
                  <dd class="font-semibold text-text-primary">{route.points}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-text-muted">Toneladas</dt>
                  <dd class="font-semibold text-text-primary">{route.tons} ton</dd>
                </div>
              </dl>
              <div class="mt-3">
                <div class="mb-1 flex justify-between text-xs">
                  <span class="text-text-muted">Capacidad</span>
                  <span class="font-medium text-text-secondary">{route.capacityPct}%</span>
                </div>
                <ProgressBar value={route.capacityPct} color="green" size="sm" />
              </div>
            </div>
          )}
        </For>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-app px-3 py-3 text-sm sm:grid-cols-4">
        <div class="flex items-center gap-2">
          <Route size={16} class="text-fero-blue" />
          <div>
            <p class="text-xs text-text-muted">Distancia</p>
            <p class="font-semibold text-text-primary">{props.totals.distanceKm} km</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Clock size={16} class="text-fero-blue" />
          <div>
            <p class="text-xs text-text-muted">Tiempo</p>
            <p class="font-semibold text-text-primary">{props.totals.duration}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Weight size={16} class="text-fero-blue" />
          <div>
            <p class="text-xs text-text-muted">Toneladas</p>
            <p class="font-semibold text-text-primary">{props.totals.tons} ton</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Fuel size={16} class="text-fero-blue" />
          <div>
            <p class="text-xs text-text-muted">Combustible</p>
            <p class="font-semibold text-text-primary">{props.totals.fuelL} L</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function OptimizationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [tab, setTab] = createSignal<OptimizationTabId>('nueva');
  const [dispatchError, setDispatchError] = createSignal<string | null>(null);
  const [closeNotice, setCloseNotice] = createSignal<string | null>(null);
  const [showDispatchCta, setShowDispatchCta] = createSignal(false);

  const dailyPlan = () => optimizationState.dailyPlan;
  const selectedDate = () => optimizationState.preset.operationDate;

  const hasResults = () => optimizationState.kpis != null;
  const kpis = () => optimizationState.kpis!;
  const routeResults = createMemo(() => {
    if (!hasResults()) return [];
    const optimized =
      optimizationState.lastResult?.routes.optimized ?? {
        type: 'FeatureCollection' as const,
        features: appState.routes.features.filter((feature) => feature.properties.type === 'optimized'),
      };
    return buildRouteResults(optimized, kpis());
  });
  const totals = createMemo(() => (hasResults() ? buildResultsTotals(kpis()) : null));
  const driverByVehicleId = createMemo(() => {
    const map: Record<string, string> = {};
    for (const vehicle of optimizationState.context?.vehicles ?? []) {
      if (vehicle.driver && vehicle.driver !== '—') {
        map[vehicle.id] = vehicle.driver;
      }
    }
    return map;
  });

  const navigateToDate = (date: string) => {
    navigate(optimizationHref({ date }), { replace: true });
    selectOperationDate(date);
  };

  onMount(() => {
    const dateParam = Array.isArray(searchParams.date) ? searchParams.date[0] : searchParams.date;
    void initOptimizationPage(dateParam ?? undefined);
  });

  createEffect(() => {
    const dateParam = Array.isArray(searchParams.date) ? searchParams.date[0] : searchParams.date;
    if (!dateParam || dateParam === optimizationState.preset.operationDate) return;
    selectOperationDate(dateParam);
  });

  const handleGenerate = async () => {
    setDispatchError(null);
    try {
      await executeOptimization();
    } catch {
      // error stored in optimizationState.error
    }
  };

  const handleDispatch = async () => {
    setDispatchError(null);
    setShowDispatchCta(false);
    try {
      await dispatchOptimizationResult();
      setShowDispatchCta(true);
    } catch (error) {
      setDispatchError(error instanceof Error ? error.message : 'No se pudieron despachar las rutas');
    }
  };

  const handleCloseDay = async () => {
    setCloseNotice(null);
    try {
      await closeOptimizationDay();
      setCloseNotice('Día cerrado. Los puntos no visitados quedaron como pendientes.');
    } catch (error) {
      setDispatchError(error instanceof Error ? error.message : 'No se pudo cerrar el día');
    }
  };

  const handleDownloadDailyPdf = async () => {
    if (!dailyPlan()?.id) return;
    const blob = await downloadDailyPlanPdf(dailyPlan()!.id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `plan-diario-${dailyPlan()!.operationDate}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleViewDayFromHistory = (operationDate: string) => {
    setTab('nueva');
    navigateToDate(operationDate);
  };

  return (
    <div class="space-y-4 md:space-y-5">
      <ModuleGuidanceBanner
        tone="optimization"
        title="¿Quieres evaluar escenarios?"
        linkHref="/simulation"
        linkLabel="Ir a Simulación de escenarios"
      >
        Esta pantalla genera y despacha rutas operativas del día. Para comparar condiciones (tráfico, lluvia, saturación) y medir el impacto del algoritmo,
      </ModuleGuidanceBanner>

      <PlanningLevelBanner level="administrativo" title="Planificación del día" />

      <OptimizationWeekCalendar selectedDate={selectedDate()} onDateSelect={navigateToDate} />

      <DailyPlanTimeline />

      <Show when={!optimizationState.isLoadingDailyPlan && !optimizationState.weeklyPlanApproved}>
        <Card>
          <PlanningEmptyState {...PLANNING_EMPTY_PRESETS.noWeeklyApproved} />
        </Card>
      </Show>

      <Card>
        <CardHeader title="Plan del día" subtitle="Programados + pendientes de ayer" />
        <Show
          when={!optimizationState.isLoadingDailyPlan}
          fallback={<p class="text-sm text-text-muted">Cargando plan del día…</p>}
        >
          <div class="space-y-3">
            <div class="flex flex-wrap items-center gap-3">
              <PlanningStatusBadge status={dailyPlan()?.status ?? 'draft'} />
              <span class="text-sm font-semibold text-text-primary">{selectedDate()}</span>
              <span class="text-sm text-text-secondary">
                {dailyPlan()?.scheduledPoints.length ?? 0} programados ·{' '}
                {dailyPlan()?.pendingPoints.length ?? 0} pendientes ·{' '}
                {dailyPlan()?.finalPointIds.length ?? 0} total
              </span>
            </div>
            <Show when={(dailyPlan()?.pendingPoints.length ?? 0) > 0}>
              <ul class="space-y-1 text-sm text-text-secondary">
                <For each={dailyPlan()?.pendingPoints ?? []}>
                  {(visit) => (
                    <li>
                      {visit.code} — origen {visit.originOperationDate} ({visit.reason})
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <div class="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void refreshDailyPlan()}>
                Actualizar pendientes
              </Button>
              <Button variant="outline" onClick={() => void handleCloseDay()}>
                Cerrar día
              </Button>
              <Button variant="outline" disabled={!dailyPlan()?.id} onClick={() => void handleDownloadDailyPdf()}>
                Exportar PDF del día
              </Button>
            </div>
            <Show when={dailyPlan()?.status === 'dispatched'}>
              <PlanningContextualCta
                message="Plan despachado — supervisa el avance en campo."
                href={monitoringHref({
                  date: dailyPlan()?.operationDate ?? selectedDate(),
                  dailyPlanId: dailyPlan()?.id,
                })}
                linkLabel="Ir a monitoreo"
              />
            </Show>
            <Show when={closeNotice()}>
              <PlanningContextualCta
                tone="info"
                message="Día cerrado. Revisa los pendientes que pasan a mañana."
                href={optimizationDateHref(tomorrowIso())}
                linkLabel="Ver pendientes de mañana"
              />
            </Show>
          </div>
        </Show>
      </Card>

      <PendingManagementPanel operationDate={selectedDate()} />

      <div class="flex gap-1 overflow-x-auto border-b border-default">
        <For each={[...optimizationTabs]}>
          {(item) => (
            <button
              type="button"
              class={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab() === item.id
                  ? 'border-fero-green-mid text-fero-green-dark'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          )}
        </For>
      </div>

      <Show when={optimizationState.error}>
        <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {optimizationState.error}
        </div>
      </Show>

      <Show when={tab() === 'nueva'}>
        <div class="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
          <div class="space-y-4 xl:col-span-3">
            <ParametersForm
              onGenerate={() => void handleGenerate()}
              onDateChange={navigateToDate}
              disabled={optimizationState.isLoadingContext}
            />
            <ScenarioInfoCard />
            <Show when={optimizationState.isOptimizing}>
              <Card>
                <CardHeader title="Progreso del motor" />
                <ProgressBar value={optimizationState.optimizationProgress} color="green" />
                <ul class="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs text-text-muted">
                  <For each={optimizationState.logs}>
                    {(log) => (
                      <li>
                        <span class="text-text-secondary">{log.timestamp}</span> — {log.message}
                      </li>
                    )}
                  </For>
                </ul>
              </Card>
            </Show>
          </div>

          <div class="space-y-4 xl:col-span-9">
            <OptimizationRouteMap hasResults={hasResults()} routeResults={routeResults()} />
            <Show when={hasResults()}>
              <div class="flex flex-wrap items-center justify-end gap-2">
                <Show when={optimizationState.lastDispatch}>
                  {(dispatch) => (
                    <Badge variant="success">
                      Despachadas {dispatch().count} ruta(s)
                    </Badge>
                  )}
                </Show>
                <A href={operationalMapHref({ focus: 'routes' })}>
                  <Button variant="outline" size="sm" icon={<Map size={16} />}>
                    Ver en mapa operativo
                  </Button>
                </A>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Send size={16} />}
                  disabled={
                    optimizationState.isDispatching ||
                    optimizationState.lastSimulationId == null ||
                    !canOptimize(authUser()?.role) ||
                    !optimizationState.weeklyPlanApproved
                  }
                  title={!optimizationState.weeklyPlanApproved ? 'Falta aprobar plan semanal' : undefined}
                  onClick={() => void handleDispatch()}
                >
                  {optimizationState.isDispatching ? 'Despachando…' : 'Despachar rutas'}
                </Button>
              </div>
              <Show when={dispatchError()}>
                <p class="text-sm text-red-500">{dispatchError()}</p>
              </Show>
              <Show when={showDispatchCta() || dailyPlan()?.status === 'dispatched'}>
                <PlanningContextualCta
                  message="Rutas despachadas. Sigue el avance en tiempo real."
                  href={monitoringHref({
                    date: dailyPlan()?.operationDate ?? selectedDate(),
                    dailyPlanId: dailyPlan()?.id,
                  })}
                  linkLabel="Abrir monitoreo"
                />
              </Show>
              <ResultsCard
                routeResults={routeResults()}
                totals={totals()!}
                driverByVehicleId={driverByVehicleId()}
              />
            </Show>
          </div>
        </div>
      </Show>

      <Show when={tab() === 'historial'}>
        <OptimizationHistoryPanel onViewDay={handleViewDayFromHistory} />
      </Show>
    </div>
  );
}
