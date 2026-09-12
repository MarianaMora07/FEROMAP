import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount } from 'solid-js';
import { A, useNavigate, useSearchParams } from '@solidjs/router';
import {
  ChevronDown,
  Download,
  History,
  MapPin,
  MoreVertical,
  Route,
  Clock,
  Truck,
  Weight,
  Map,
  Sparkles,
} from 'lucide-solid';
import {
  Button,
  Card,
  CardHeader,
} from '../../design-system/components';
import { routeDisplayKind } from '../../core/map/operationalMapLayers';
import type { RouteCollection } from '../../core/types/geo';
import {
  executeOptimization,
  closeOptimizationDay,
  closeOptimizationPlayback,
  initOptimizationPage,
  openOptimizationPlayback,
  optimizationState,
  refreshDailyPlan,
  selectOperationDate,
} from '../../core/stores/optimizationStore';
import {
  buildResultsTotals,
  buildRouteResults,
  buildScenarioInfoRows,
} from '../../core/utils/optimizationResults';
import { downloadDailyPlanPdf } from '../../core/api/planning';
import { optimizationDateHref, tomorrowIso } from '../../core/planning/planningUx';
import { optimizationHref, operationalMapHref, daySimulationHref } from '../../core/planning/operationalLinks';
import { parsePlaybackQueryParam } from '../../core/planning/operationalFlowUx';
import { PlanningContextualCta } from '../planning/PlanningContextualCta';
import { AppShellSubheader } from '../../design-system/layout/pageChromeSlots';
import { OptimizationHeaderBar, OptimizationDailyBanner } from './OptimizationHeaderChrome';
import { OptimizationRouteMap } from './OptimizationRouteMap';
import { OptimizationPlaybackPanel } from './OptimizationPlaybackPanel';
import { OptimizationPendingSection } from './OptimizationPendingSection';
import { OptimizationParametersForm } from './OptimizationParametersForm';
import { DurationBreakdownPanel } from '../simulation/DurationBreakdownPanel';
import { UncoveredPointsActionsPanel } from '../landfill/UncoveredPointsActionsPanel';
import { OptimizationParametersSheet } from './OptimizationParametersSheet';
import { OptimizationProgressPanel } from './OptimizationProgressPanel';
import { OptimizationDispatchBanner } from './OptimizationDispatchBanner';
import { OptimizationComparisonPanel } from './OptimizationComparisonPanel';
import { OptimizationConvergencePanel } from './OptimizationConvergencePanel';
import { useGenerateButtonVisibility } from './useGenerateButtonVisibility';
import { resolveOptimizationContextualMessage } from './optimizationLayoutUx';
import { fetchDailyRoutePlayback } from '../../core/api/routePlayback';
import { fetchSimulationRoutesGeojson } from '../../core/api/simulation';
import { useRoutePlayback } from '../../core/route-playback/useRoutePlayback';
import { ROUTE_PLAYBACK_LANDFILL_CODE } from '../../core/route-playback/routePlaybackTypes';

const scenarioIconMap = {
  'map-pin': MapPin,
  route: Route,
  clock: Clock,
  truck: Truck,
  weight: Weight,
} as const;

function ScenarioInfoCard(props: { optimizedRoutes: RouteCollection | null }) {
  const dailyPlan = () => optimizationState.dailyPlan;
  const kpis = () => optimizationState.kpis;

  // Valores **del día**: puntos programados y críticos (≥ 80 % de llenado) del plan.
  const dayPointCount = () =>
    dailyPlan()?.finalPointIds?.length ?? dailyPlan()?.scheduledPoints?.length ?? 0;
  const dayCriticalCount = () =>
    (dailyPlan()?.scheduledPoints ?? []).filter((point) => (point.fillLevelPct ?? 0) >= 80).length;

  // La duración del motor es la **suma de toda la flota**; aquí también mostramos
  // la jornada del camión más cargado, que es lo que se interpreta como "el día".
  const maxVehicleHours = () => {
    const durations = (props.optimizedRoutes?.features ?? [])
      .map((feature) => feature.properties.durationMin)
      .filter((value): value is number => typeof value === 'number' && value > 0);
    return durations.length > 0 ? Math.max(...durations) / 60 : null;
  };

  const rows = createMemo(() =>
    buildScenarioInfoRows({
      pointsToVisit: dayPointCount(),
      kpis: kpis(),
      criticalCount: dayCriticalCount(),
      maxVehicleHours: maxVehicleHours(),
    }),
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

const RESULT_TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'comparacion', label: 'Comparación' },
  { id: 'desglose', label: 'Desglose' },
  { id: 'convergencia', label: 'Convergencia' },
  { id: 'rutas', label: 'Rutas por vehículo' },
] as const;

const WEEKDAYS_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function humanDateShort(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return `${WEEKDAYS_ES[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS_ES[date.getUTCMonth()]}`;
}

function minutesLabel(totalMinutes: number): string {
  if (totalMinutes < 60) return `${Math.round(totalMinutes)} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

export default function OptimizationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [paramsSheetOpen, setParamsSheetOpen] = createSignal(false);
  const [dispatchError, setDispatchError] = createSignal<string | null>(null);
  const [closeNotice, setCloseNotice] = createSignal<string | null>(null);
  const [planTab, setPlanTab] = createSignal<'optimize' | 'results' | 'pending'>('optimize');
  const [resultsTab, setResultsTab] = createSignal<
    'resumen' | 'comparacion' | 'desglose' | 'convergencia' | 'rutas'
  >('comparacion');
  const [pageMenuOpen, setPageMenuOpen] = createSignal(false);
  const { formGenerateInView, setGenerateAnchorRef } = useGenerateButtonVisibility();

  const dailyPlan = () => optimizationState.dailyPlan;
  const selectedDate = () => optimizationState.preset.operationDate;

  const hasResults = () => optimizationState.kpis != null;
  const canSimulateRoute = () => dailyPlan()?.status === 'optimized' && hasResults();
  const scenarioId = () => dailyPlan()?.scenarioId ?? optimizationState.preset.scenarioId;
  const scenarioLabel = createMemo(() => {
    const id = scenarioId();
    return optimizationState.context?.scenarios.find((scenario) => scenario.id === id)?.label ?? id;
  });

  const [playbackPayload] = createResource(
    () => {
      if (!optimizationState.playbackOpen) return null;
      return dailyPlan()?.id ?? null;
    },
    async (dailyPlanId) => {
      if (!dailyPlanId) return null;
      return fetchDailyRoutePlayback(dailyPlanId);
    },
  );

  const playbackRoutes = createMemo(() => playbackPayload()?.routes ?? []);
  const playback = useRoutePlayback(() => playbackRoutes());

  createEffect(() => {
    if (!optimizationState.playbackOpen) {
      playback.reset();
    }
  });

  const handleClosePlayback = () => {
    playback.pause();
    playback.reset();
    closeOptimizationPlayback();
  };

  // Simulación guionada del día: vista propia (el mapa es el protagonista).
  const openDaySimulation = () => {
    const plan = dailyPlan();
    if (plan?.id == null) return;
    if (optimizationState.playbackOpen) closeOptimizationPlayback();
    navigate(daySimulationHref({ dailyPlanId: plan.id, date: plan.operationDate ?? selectedDate() }));
  };
  const kpis = () => optimizationState.kpis!;
  // Rutas reales de la corrida: las de la sesión (lastResult) o, si el día llegó ya
  // optimizado desde backend, las del GeoJSON de la simulación vinculada (sin mocks).
  const [historyRoutes] = createResource(
    () => (hasResults() && !optimizationState.lastResult ? (dailyPlan()?.simulationId ?? undefined) : undefined),
    async (simulationId) => {
      if (!simulationId) return null;
      try {
        return await fetchSimulationRoutesGeojson(simulationId);
      } catch {
        return null;
      }
    },
  );
  const realOptimizedRoutes = createMemo(() => {
    const sessionRoutes = optimizationState.lastResult?.routes.optimized;
    if (sessionRoutes && sessionRoutes.features.length > 0) return sessionRoutes;
    const merged = historyRoutes();
    if (!merged) return null;
    const features = merged.features.filter(
      (feature) => routeDisplayKind(feature.properties) === 'optimized',
    );
    return features.length > 0 ? { type: 'FeatureCollection' as const, features } : null;
  });
  const routeResults = createMemo(() => {
    if (!hasResults()) return [];
    return buildRouteResults(realOptimizedRoutes() ?? { type: 'FeatureCollection', features: [] }, kpis());
  });
  const totals = createMemo(() => (hasResults() ? buildResultsTotals(kpis()) : null));
  const baselineApplies = createMemo(() => {
    if (!hasResults()) return false;
    const current = Number(kpis()?.distanceKm?.current ?? 0);
    return current > 0;
  });
  const visibleResultTabs = createMemo(() =>
    RESULT_TABS.filter((tab) => tab.id !== 'comparacion' || baselineApplies()),
  );
  const savingPct = createMemo(() => {
    const dist = kpis()?.distanceKm;
    if (!dist?.current || !dist?.optimized || dist.current <= 0) return 0;
    return Math.round((1 - dist.optimized / dist.current) * 100);
  });
  const summaryTiles = createMemo(() => [
    { id: 'distancia', label: 'Distancia optimizada', value: `${totals()?.distanceKm.toFixed(1) ?? '—'} km` },
    { id: 'duracion', label: 'Duración total', value: totals()?.duration ?? '—' },
    { id: 'toneladas', label: 'Toneladas', value: `${totals()?.tons.toFixed(1) ?? '—'} t` },
    { id: 'ahorro', label: 'Ahorro vs baseline', value: `${savingPct()}%` },
  ]);
  // Detalle real por vehículo desde el playback del plan (sin mocks).
  const [routeDetails] = createResource(
    () => (hasResults() ? (dailyPlan()?.id ?? null) : null),
    async (dailyPlanId) => (dailyPlanId ? fetchDailyRoutePlayback(dailyPlanId) : null),
  );
  const perRouteRows = createMemo(() => {
    const routes = routeDetails()?.routes ?? [];
    return routes.map((route) => ({
      vehicle: route.vehicleLabel || `R-${route.routeId}`,
      distanceKm: route.distanceKm,
      durationMin: route.totalDurationMinutes,
      points: route.stops.filter(
        (stop) => stop.stopType !== 'landfill' && stop.code !== ROUTE_PLAYBACK_LANDFILL_CODE,
      ).length,
    }));
  });
  const totalRoutePoints = createMemo(() =>
    perRouteRows().reduce((sum, row) => sum + row.points, 0),
  );

  const navigateToDate = (date: string) => {
    navigate(optimizationHref({ date }), { replace: true });
    selectOperationDate(date);
  };

  onMount(() => {
    const dateParam = Array.isArray(searchParams.date) ? searchParams.date[0] : searchParams.date;
    void initOptimizationPage(dateParam ?? undefined);
  });

  // Deep link '#pendientes' (desde el Dashboard o el hub) abre la pestaña Pendientes.
  onMount(() => {
    const syncTabFromHash = () => {
      if (typeof window !== 'undefined' && window.location.hash === '#pendientes') {
        setPlanTab('pending');
      }
    };
    syncTabFromHash();
    window.addEventListener('hashchange', syncTabFromHash);
    onCleanup(() => window.removeEventListener('hashchange', syncTabFromHash));
  });

  // Al cambiar de día o al completar una corrida nueva, los resultados vuelven a "Resumen".
  createEffect(() => {
    selectedDate();
    optimizationState.lastSimulationId;
    setResultsTab('resumen');
  });

  // Sin baseline (ruta actual) la pestaña Comparación no aplica.
  createEffect(() => {
    if (!baselineApplies() && resultsTab() === 'comparacion') {
      setResultsTab('resumen');
    }
  });

  // Parámetros colapsados; se reabren solos solo la primera vez que hay un día sin resultados.
  let paramsAutoOpened = false;
  let paramsDetailsRef: HTMLDetailsElement | undefined;
  createEffect(() => {
    const ready = !optimizationState.isLoadingDailyPlan && !optimizationState.isLoadingContext;
    if (!ready || hasResults() || paramsAutoOpened || !paramsDetailsRef) return;
    paramsAutoOpened = true;
    paramsDetailsRef.open = true;
  });

  createEffect(() => {
    const dateParam = Array.isArray(searchParams.date) ? searchParams.date[0] : searchParams.date;
    if (!dateParam || dateParam === optimizationState.preset.operationDate) return;
    selectOperationDate(dateParam);
  });

  createEffect(() => {
    if (!parsePlaybackQueryParam(searchParams.playback)) return;
    if (optimizationState.isLoadingDailyPlan || optimizationState.isLoadingContext) return;
    if (!canSimulateRoute() || optimizationState.playbackOpen) return;
    openOptimizationPlayback();
  });

  const handleGenerate = async () => {
    setDispatchError(null);
    try {
      await executeOptimization();
    } catch {
      // error stored in optimizationState.error
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

  const contextualMessage = createMemo(() =>
    resolveOptimizationContextualMessage({
      closeNotice: closeNotice(),
      closeNoticeHref: closeNotice() ? optimizationDateHref(tomorrowIso()) : null,
    }),
  );

  const parametersPanel = () => (
    <>
      <Show when={!hasResults()}>
        <OptimizationParametersForm
          onGenerate={() => void handleGenerate()}
          disabled={optimizationState.isLoadingContext}
          formGenerateVisible={formGenerateInView()}
          generateAnchorRef={setGenerateAnchorRef}
        />
      </Show>
      <OptimizationProgressPanel />
    </>
  );

  return (
    <div class="space-y-4 md:space-y-5">
      <AppShellSubheader>
        <OptimizationHeaderBar onSimulateDay={openDaySimulation} />
      </AppShellSubheader>

      <OptimizationDailyBanner />

      <OptimizationDispatchBanner />

      <div class="flex items-center justify-between gap-2 border-b border-default">
        <div
          class="flex gap-1 overflow-x-auto"
          data-testid="plan-day-tabs"
          role="tablist"
          aria-label="Vista del plan del día"
        >
          <button
            type="button"
            role="tab"
            aria-selected={planTab() === 'optimize'}
            data-testid="plan-day-tab-optimize"
            onClick={() => setPlanTab('optimize')}
            class={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              planTab() === 'optimize'
                ? 'border-fero-green-mid text-fero-green-dark'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            Optimizar y despachar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={planTab() === 'results'}
            data-testid="plan-day-tab-results"
            onClick={() => setPlanTab('results')}
            class={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              planTab() === 'results'
                ? 'border-fero-green-mid text-fero-green-dark'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            Resultados
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={planTab() === 'pending'}
            data-testid="plan-day-tab-pending"
            onClick={() => setPlanTab('pending')}
            class={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              planTab() === 'pending'
                ? 'border-fero-green-mid text-fero-green-dark'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            Pendientes
          </button>
        </div>

        <div class="relative shrink-0">
          <Button
            variant="outline"
            size="sm"
            class="gap-1 px-2"
            aria-label="Más acciones"
            data-testid="optimization-page-menu"
            onClick={() => setPageMenuOpen((value) => !value)}
          >
            <MoreVertical size={16} />
          </Button>
          <Show when={pageMenuOpen()}>
            <div
              class="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-lg border border-default bg-surface shadow-lg"
              data-testid="optimization-page-menu-items"
            >
              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-text-primary hover:bg-app disabled:opacity-40"
                disabled={!dailyPlan()?.id}
                data-testid="optimization-menu-export-pdf"
                onClick={() => {
                  setPageMenuOpen(false);
                  void handleDownloadDailyPdf();
                }}
              >
                <Download size={15} class="shrink-0 text-text-muted" />
                Exportar PDF del día
              </button>
              <button
                type="button"
                class="flex w-full items-center gap-2 border-t border-default px-3 py-2.5 text-left text-sm text-text-primary hover:bg-app"
                data-testid="optimization-menu-close-day"
                onClick={() => {
                  setPageMenuOpen(false);
                  void handleCloseDay();
                }}
              >
                <Route size={15} class="shrink-0 text-text-muted" />
                Cerrar día
              </button>
              <A
                href={operationalMapHref({ focus: 'routes' })}
                class="flex w-full items-center gap-2 border-t border-default px-3 py-2.5 text-sm text-text-primary hover:bg-app"
                onClick={() => setPageMenuOpen(false)}
              >
                <Map size={15} class="shrink-0 text-text-muted" />
                Ver en mapa operativo
              </A>
              <A
                href="/planning/history"
                class="flex w-full items-center gap-2 border-t border-default px-3 py-2.5 text-sm text-text-primary hover:bg-app"
                onClick={() => setPageMenuOpen(false)}
              >
                <History size={15} class="shrink-0 text-text-muted" />
                Historial de planificación
              </A>
            </div>
          </Show>
        </div>
      </div>

      <Show when={planTab() === 'optimize'}>
        <Show when={contextualMessage()}>
          {(message) => (
            <div data-testid="optimization-contextual-cta">
              <PlanningContextualCta
                message={message().message}
                href={message().href}
                linkLabel={message().linkLabel}
                tone={message().tone}
              />
            </div>
          )}
        </Show>

        <Show when={dispatchError()}>
          <p class="text-sm text-red-600" role="alert">
            {dispatchError()}
          </p>
        </Show>

        <Show when={optimizationState.error}>
          <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {optimizationState.error}
          </div>
        </Show>

        <div class="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
          <Show when={!hasResults()}>
            <details
              ref={paramsDetailsRef}
              class="group order-2 hidden space-y-4 xl:order-1 xl:col-span-3 xl:block"
            >
              <summary class="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-semibold text-text-primary hover:bg-app marker:content-none">
                <span>Parámetros</span>
                <ChevronDown
                  size={15}
                  class="text-text-muted transition-transform group-open:rotate-180"
                />
              </summary>
              {parametersPanel()}
            </details>
          </Show>

          <div
            class={`order-1 space-y-4 xl:order-2 ${hasResults() ? 'xl:col-span-12' : 'xl:col-span-9'}`}
          >
            <ScenarioInfoCard optimizedRoutes={realOptimizedRoutes()} />

            <div class="relative min-h-[420px]">
              <OptimizationRouteMap
                hasResults={hasResults()}
                routeResults={routeResults()}
                playbackActive={optimizationState.playbackOpen}
                playbackRoutes={playbackRoutes()}
                playback={playback}
              />
              <Show when={optimizationState.playbackOpen}>
                <OptimizationPlaybackPanel
                  routes={playbackRoutes()}
                  playback={playback}
                  scenarioId={scenarioId()}
                  scenarioLabel={scenarioLabel()}
                  operationDate={selectedDate()}
                  previewMode={playbackPayload()?.previewMode ?? true}
                  loading={playbackPayload.loading}
                  error={
                    playbackPayload.error
                      ? playbackPayload.error instanceof Error
                        ? playbackPayload.error.message
                        : 'No se pudo cargar el recorrido'
                      : null
                  }
                  onClose={handleClosePlayback}
                />
              </Show>
            </div>

            <Show when={!hasResults()}>
              <Button
                variant="outline"
                size="sm"
                class="w-full xl:hidden"
                data-testid="optimization-parameters-sheet-trigger"
                onClick={() => setParamsSheetOpen(true)}
              >
                Parámetros de optimización
              </Button>

              <OptimizationParametersSheet open={paramsSheetOpen()} onOpenChange={setParamsSheetOpen}>
                {parametersPanel()}
              </OptimizationParametersSheet>
            </Show>

            <Show
              when={
                !hasResults() &&
                !optimizationState.isOptimizing &&
                !optimizationState.isLoadingDailyPlan &&
                !optimizationState.isLoadingContext
              }
            >
              <div
                class="rounded-xl border border-dashed border-default bg-surface/40 px-4 py-10 text-center"
                data-testid="optimization-empty-results"
              >
                <p class="text-base font-semibold text-text-primary">Este día aún no se ha optimizado</p>
                <p class="mx-auto mt-1 max-w-md text-sm text-text-muted">
                  Genera la ruta del {humanDateShort(selectedDate())} para ver resultados, simular el
                  recorrido y despachar la operación.
                </p>
                <div class="mt-4 flex justify-center">
                  <Button
                    variant="primary"
                    size="sm"
                    class="gap-2"
                    icon={<Sparkles size={14} />}
                    data-testid="optimization-empty-generate"
                    onClick={() => void handleGenerate()}
                  >
                    Generar ruta operativa
                  </Button>
                </div>
              </div>
            </Show>

          </div>
        </div>
      </Show>

      <Show when={planTab() === 'results'}>
        <Show
          when={hasResults()}
          fallback={
            <div
              class="rounded-xl border border-dashed border-default bg-surface/40 px-4 py-10 text-center"
              data-testid="optimization-results-empty"
            >
              <p class="text-base font-semibold text-text-primary">Este día aún no tiene resultados</p>
              <p class="mx-auto mt-1 max-w-md text-sm text-text-muted">
                Genera el plan del día en “Optimizar y despachar” para ver el resumen, la comparación,
                el desglose, la convergencia y las rutas por vehículo.
              </p>
              <div class="mt-4 flex justify-center">
                <Button variant="primary" size="sm" onClick={() => setPlanTab('optimize')}>
                  Ir a optimizar y despachar
                </Button>
              </div>
            </div>
          }
        >
              <p class="text-sm font-semibold text-text-primary" data-testid="optimization-results-context">
                Resultados · {humanDateShort(selectedDate())}
                {optimizationState.lastSimulationId ? ` · corrida #${optimizationState.lastSimulationId}` : ''}
              </p>
              <div
                class="flex gap-1 overflow-x-auto border-b border-default"
                data-testid="optimization-results-tabs"
                role="tablist"
                aria-label="Resultados del día"
              >
                <For each={visibleResultTabs()}>
                  {(item) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={resultsTab() === item.id}
                      data-testid={`optimization-results-tab-${item.id}`}
                      onClick={() => setResultsTab(item.id)}
                      class={`shrink-0 border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${
                        resultsTab() === item.id
                          ? 'border-fero-green-mid text-fero-green-dark'
                          : 'border-transparent text-text-muted hover:text-text-secondary'
                      }`}
                    >
                      {item.label}
                    </button>
                  )}
                </For>
              </div>

              <Show when={resultsTab() === 'resumen'}>
                <div class="space-y-4">
                  <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <For each={summaryTiles()}>
                      {(tile) => (
                        <div class="rounded-lg border border-default bg-surface/60 px-3 py-2.5">
                          <p class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                            {tile.label}
                          </p>
                          <p class="mt-1 text-lg font-bold text-text-primary">{tile.value}</p>
                        </div>
                      )}
                    </For>
                  </div>
                  <UncoveredPointsActionsPanel
                    kpis={kpis()!}
                    dailyPlanId={dailyPlan()?.id}
                    operationDate={selectedDate()}
                    onDeferred={() => void refreshDailyPlan()}
                  />
                </div>
              </Show>

              <Show when={resultsTab() === 'comparacion'}>
                <OptimizationComparisonPanel kpis={kpis()!} kpiView={optimizationState.preset.kpiView} />
              </Show>

              <Show when={resultsTab() === 'desglose'}>
                <DurationBreakdownPanel kpis={kpis()!} />
              </Show>

              <Show when={resultsTab() === 'convergencia'}>
                <OptimizationConvergencePanel points={optimizationState.acoConvergence} />
              </Show>

              <Show when={resultsTab() === 'rutas'}>
                <Show
                  when={perRouteRows().length > 0}
                  fallback={
                    <div
                      class="rounded-xl border border-dashed border-default bg-surface/40 px-4 py-10 text-center"
                      data-testid="optimization-routes-empty"
                    >
                      <p class="text-sm font-semibold text-text-primary">Sin rutas reales para este día</p>
                      <p class="mx-auto mt-1 max-w-md text-sm text-text-muted">
                        Ejecuta <span class="font-semibold">Generar</span> en este día para ver el detalle
                        por vehículo de la corrida.
                      </p>
                    </div>
                  }
                >
                  <div class="overflow-x-auto rounded-lg border border-default">
                    <table class="w-full text-sm" data-testid="optimization-routes-table">
                      <thead class="bg-app text-left text-xs uppercase tracking-wide text-text-muted">
                        <tr>
                          <th class="px-4 py-2.5 font-semibold">Vehículo</th>
                          <th class="px-4 py-2.5 font-semibold">Distancia</th>
                          <th class="px-4 py-2.5 font-semibold">Tiempo</th>
                          <th class="px-4 py-2.5 font-semibold">Puntos</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-default">
                        <For each={perRouteRows()}>
                          {(row) => (
                            <tr class="bg-surface/40">
                              <td class="px-4 py-2.5 font-semibold text-text-primary">{row.vehicle}</td>
                              <td class="px-4 py-2.5 text-text-secondary">
                                {row.distanceKm != null ? `${row.distanceKm.toFixed(1)} km` : '—'}
                              </td>
                              <td class="px-4 py-2.5 text-text-secondary">{minutesLabel(row.durationMin)}</td>
                              <td class="px-4 py-2.5 text-text-secondary">{row.points}</td>
                            </tr>
                          )}
                        </For>
                        <tr class="bg-app/70 font-semibold text-text-primary">
                          <td class="px-4 py-2.5">Total</td>
                          <td class="px-4 py-2.5">{totals()?.distanceKm.toFixed(1) ?? '—'} km</td>
                          <td class="px-4 py-2.5">{totals()?.duration ?? '—'}</td>
                          <td class="px-4 py-2.5">{totalRoutePoints()} paradas</td>
                        </tr>
                      </tbody>
                    </table>
                    <p class="border-t border-default px-4 py-2 text-xs text-text-muted">
                      Toneladas y capacidad disponibles solo agregadas: {totals()?.tons.toFixed(1) ?? '—'} t ·{' '}
                      {totals()?.fuelL.toFixed(1) ?? '—'} L comb.
                    </p>
                  </div>
                </Show>
              </Show>
            </Show>
          </Show>

      <Show when={planTab() === 'pending'}>
        <div class="space-y-4">
          <OptimizationPendingSection
            operationDate={selectedDate()}
            openPendingCount={dailyPlan()?.pendingPoints.length ?? 0}
          />
          <p class="text-sm text-text-muted">
            ¿Terminaste con los pendientes?{' '}
            <A href="/optimization" class="font-medium text-fero-blue hover:underline">
              Volver a optimizar y despachar
            </A>
            .
          </p>
        </div>
      </Show>
    </div>
  );
}
