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
  AlertTriangle,
  Map,
  Play,
  Send,
  Sparkles,
  TrendingDown,
} from 'lucide-solid';
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Drawer,
  TabList,
  tabButtonId,
  useDismissable,
} from '../../design-system/components';
import { routeDisplayKind } from '../../core/map/operationalMapLayers';
import type { RouteCollection } from '../../core/types/geo';
import {
  dispatchOptimizationResult,
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
  buildDaySummaryRows,
  buildResultsTotals,
  buildRouteResults,
} from '../../core/utils/optimizationResults';
import { downloadDailyPlanPdf } from '../../core/api/planning';
import { mapDailyStatusToCalendar } from '../../core/planning/dailyPlanningUx';
import { optimizationHref, operationalMapHref, daySimulationHref } from '../../core/planning/operationalLinks';
import { parsePlaybackQueryParam } from '../../core/planning/operationalFlowUx';
import { AppShellSubheader } from '../../design-system/layout/pageChromeSlots';
import { globalToast } from '../../core/stores/toastStore';
import { OptimizationHeaderBar, OptimizationDailyBanner } from './OptimizationHeaderChrome';
import { OptimizationRouteMap } from './OptimizationRouteMap';
import { OptimizationPlaybackPanel } from './OptimizationPlaybackPanel';
import { OptimizationPendingSection } from './OptimizationPendingSection';
import { OptimizationParametersForm } from './OptimizationParametersForm';
import { DurationBreakdownPanel } from '../simulation/DurationBreakdownPanel';
import { UncoveredPointsActionsPanel } from '../landfill/UncoveredPointsActionsPanel';
import { OptimizationParametersSheet } from './OptimizationParametersSheet';
import { OptimizationProgressPanel } from './OptimizationProgressPanel';
import { OptimizationContextBand } from './OptimizationDispatchBanner';
import { OptimizationComparisonPanel } from './OptimizationComparisonPanel';
import { OptimizationContingencySimulator } from './OptimizationContingencySimulator';
import { OptimizationDayActualsPanel } from './OptimizationDayActualsPanel';
import { useGenerateButtonVisibility } from './useGenerateButtonVisibility';
import { fetchDailyRoutePlayback } from '../../core/api/routePlayback';
import { fetchSimulationRoutesGeojson } from '../../core/api/simulation';
import { useRoutePlayback } from '../../core/route-playback/useRoutePlayback';
import { ROUTE_PLAYBACK_LANDFILL_CODE } from '../../core/route-playback/routePlaybackTypes';

const scenarioIconMap = {
  'map-pin': MapPin,
  alert: AlertTriangle,
  route: Route,
  clock: Clock,
  truck: Truck,
  weight: Weight,
  savings: TrendingDown,
} as const;

function DaySummaryCard(props: { optimizedRoutes: RouteCollection | null }) {
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
    buildDaySummaryRows({
      pointsToVisit: dayPointCount(),
      kpis: kpis(),
      criticalCount: dayCriticalCount(),
      maxVehicleHours: maxVehicleHours(),
    }),
  );

  return (
    <Card>
      <CardHeader title="Resumen del día" />
      <ul
        class="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2"
        data-testid="optimization-day-summary"
      >
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

const PLAN_TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'desglose', label: 'Desglose' },
  { id: 'rutas', label: 'Rutas por vehículo' },
];

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
  const [closeNotice, setCloseNotice] = createSignal<string | null>(null);
  const [planTab, setPlanTab] = createSignal<'plan' | 'results' | 'pending'>(
    'plan',
  );
  const [planViewTab, setPlanViewTab] = createSignal<'resumen' | 'desglose' | 'rutas'>('resumen');
  const [pageMenuOpen, setPageMenuOpen] = createSignal(false);
  const [confirmCloseDayOpen, setConfirmCloseDayOpen] = createSignal(false);
  const [contingencyOpen, setContingencyOpen] = createSignal(false);
  const { formGenerateInView, setGenerateAnchorRef } = useGenerateButtonVisibility();

  // Menú "Más acciones": foco al abrir, navegación por flechas y cierre con
  // clic-fuera/Escape (docs/design-system/contratos-ui.md §2).
  let menuContainerRef: HTMLDivElement | undefined;
  const menuItems = () =>
    Array.from(menuContainerRef?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useDismissable({
    open: () => pageMenuOpen(),
    inside: () => [menuContainerRef],
    onDismiss: () => {
      setPageMenuOpen(false);
      menuContainerRef?.querySelector<HTMLButtonElement>('button')?.focus();
    },
  });

  const moveMenuFocus = (delta: number) => {
    const items = menuItems();
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    items[(current + delta + items.length) % items.length]?.focus();
  };

  const handleMenuKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveMenuFocus(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveMenuFocus(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      menuItems()[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      menuItems().at(-1)?.focus();
    }
  };

  createEffect(() => {
    if (!pageMenuOpen()) return;
    queueMicrotask(() => menuItems()[0]?.focus());
  });

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
  // Rutas notificadas (D3): del último despacho o, al recargar, de las rutas optimizadas.
  const notifiedRouteCount = () =>
    optimizationState.lastDispatch?.count ?? realOptimizedRoutes()?.features.length ?? null;
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
  // Día con resultados reales (Fase 4): cerrado o parcial. `dispatched` = jornada en curso.
  const dayStatusKey = () => mapDailyStatusToCalendar(dailyPlan()?.status);
  const hasRealResults = () => dayStatusKey() === 'closed' || dailyPlan()?.actualKpis != null;
  const isInCourse = () => dayStatusKey() === 'dispatched' && dailyPlan()?.actualKpis == null;
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

  // Al cambiar de día o al completar una corrida nueva, el detalle vuelve a "Resumen" y se
  // descarta el aviso de cierre del día anterior.
  createEffect(() => {
    selectedDate();
    optimizationState.lastSimulationId;
    setPlanViewTab('resumen');
    setCloseNotice(null);
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
    try {
      await executeOptimization();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudieron generar las rutas del día';
      globalToast.addToast(message, 'error');
    }
  };

  const handleRenotify = async () => {
    try {
      await dispatchOptimizationResult();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo notificar a los conductores';
      globalToast.addToast(message, 'error');
    }
  };

  const handleCloseDay = async () => {
    setCloseNotice(null);
    try {
      await closeOptimizationDay();
      setCloseNotice('Día cerrado. Los puntos no visitados quedaron como pendientes.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo cerrar el día';
      globalToast.addToast(message, 'error');
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
        <OptimizationHeaderBar
          onCloseDay={() => setConfirmCloseDayOpen(true)}
          onViewResults={() => setPlanTab('results')}
          notifiedCount={notifiedRouteCount()}
        />
      </AppShellSubheader>

      <OptimizationDailyBanner />

      <OptimizationContextBand closeNotice={closeNotice()} />

      <div class="flex items-center justify-between gap-2 border-b border-default">
        <TabList
          idPrefix="plan-day"
          panelId="plan-day-panel"
          tabs={[
            { id: 'plan', label: 'Plan' },
            { id: 'results', label: 'Resultados' },
            { id: 'pending', label: 'Pendientes' },
          ]}
          active={planTab()}
          onChange={(id) => setPlanTab(id as 'plan' | 'results' | 'pending')}
          ariaLabel="Vista del plan del día"
          containerClass="flex gap-1 overflow-x-auto"
          testId="plan-day-tabs"
          testIdFor={(id) => `plan-day-tab-${id}`}
          tabClass={(active) =>
            `shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              active
                ? 'border-fero-green-mid text-fero-green-dark'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`
          }
        />

        <div ref={menuContainerRef} class="relative shrink-0">
          <Button
            variant="outline"
            size="sm"
            class="gap-1 px-2"
            aria-label="Herramientas"
            data-testid="optimization-page-menu"
            onClick={() => setPageMenuOpen((value) => !value)}
          >
            <MoreVertical size={16} />
          </Button>
          <Show when={pageMenuOpen()}>
            <div
              role="menu"
              aria-label="Herramientas"
              onKeyDown={handleMenuKeyDown}
              class="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-lg border border-default bg-surface shadow-lg"
              data-testid="optimization-page-menu-items"
            >
              <button
                type="button"
                role="menuitem"
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
                role="menuitem"
                class="flex w-full items-center gap-2 border-t border-default px-3 py-2.5 text-left text-sm text-text-primary hover:bg-app disabled:opacity-40"
                disabled={
                  !optimizationState.weeklyPlanApproved ||
                  !hasResults() ||
                  optimizationState.dailyPlan?.status === 'closed'
                }
                data-testid="optimization-menu-renotify"
                onClick={() => {
                  setPageMenuOpen(false);
                  void handleRenotify();
                }}
              >
                <Send size={15} class="shrink-0 text-text-muted" />
                Reenviar notificación
              </button>
              <button
                type="button"
                role="menuitem"
                class="flex w-full items-center gap-2 border-t border-default px-3 py-2.5 text-left text-sm text-text-primary hover:bg-app disabled:opacity-40"
                disabled={!hasResults()}
                data-testid="optimization-menu-simulate-day"
                onClick={() => {
                  setPageMenuOpen(false);
                  openDaySimulation();
                }}
              >
                <Play size={15} class="shrink-0 text-text-muted" />
                Simular día (dry-run)
              </button>
              <button
                type="button"
                role="menuitem"
                class="flex w-full items-center gap-2 border-t border-default px-3 py-2.5 text-left text-sm text-text-primary hover:bg-app disabled:opacity-40"
                disabled={!hasResults() || optimizationState.dailyPlan?.status === 'closed'}
                data-testid="optimization-menu-contingency"
                onClick={() => {
                  setPageMenuOpen(false);
                  setContingencyOpen(true);
                }}
              >
                <AlertTriangle size={15} class="shrink-0 text-text-muted" />
                Simular contingencia
              </button>
              <A
                href={operationalMapHref({ focus: 'routes' })}
                role="menuitem"
                class="flex w-full items-center gap-2 border-t border-default px-3 py-2.5 text-sm text-text-primary hover:bg-app"
                onClick={() => setPageMenuOpen(false)}
              >
                <Map size={15} class="shrink-0 text-text-muted" />
                Ver en mapa operativo
              </A>
              <A
                href="/planning/history"
                role="menuitem"
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

      <div
        role="tabpanel"
        id="plan-day-panel"
        aria-labelledby={tabButtonId('plan-day', planTab())}
        class="space-y-4 md:space-y-5"
      >
      <Show when={planTab() === 'plan'}>
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
            class={`order-1 flex flex-col gap-4 xl:order-2 ${hasResults() ? 'xl:col-span-12' : 'xl:col-span-9'}`}
          >
            <div class="relative order-1 xl:order-2">
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

            <div class="order-2 xl:order-1">
              <DaySummaryCard optimizedRoutes={realOptimizedRoutes()} />
            </div>

            <Show when={!hasResults()}>
              <Button
                variant="outline"
                size="sm"
                class="order-3 w-full xl:hidden"
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
                class="order-4 rounded-xl border border-dashed border-default bg-surface/40 px-4 py-10 text-center"
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

        <Show when={hasResults()}>
          <div class="space-y-4" data-testid="optimization-plan-section">
            <TabList
              idPrefix="optimization-plan"
              panelId="optimization-plan-panel"
              tabs={PLAN_TABS}
              active={planViewTab()}
              onChange={(id) => setPlanViewTab(id as 'resumen' | 'desglose' | 'rutas')}
              ariaLabel="Plan del día"
              containerClass="flex gap-1 overflow-x-auto border-b border-default"
              testId="optimization-plan-tabs"
              testIdFor={(id) => `optimization-plan-tab-${id}`}
              tabClass={(active) =>
                `shrink-0 border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-fero-green-mid text-fero-green-dark'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                }`
              }
            />

            <div
              role="tabpanel"
              id="optimization-plan-panel"
              aria-labelledby={tabButtonId('optimization-plan', planViewTab())}
            >
              <Show when={planViewTab() === 'resumen'}>
                <div class="space-y-4">
                  <Show when={baselineApplies()}>
                    <OptimizationComparisonPanel kpis={kpis()!} kpiView={optimizationState.preset.kpiView} />
                  </Show>
                  <UncoveredPointsActionsPanel
                    kpis={kpis()!}
                    dailyPlanId={dailyPlan()?.id}
                    operationDate={selectedDate()}
                    onDeferred={() => void refreshDailyPlan()}
                  />
                </div>
              </Show>

              <Show when={planViewTab() === 'desglose'}>
                <DurationBreakdownPanel kpis={kpis()!} />
              </Show>

              <Show when={planViewTab() === 'rutas'}>
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
            </div>
          </div>
        </Show>
      </Show>

      <Show when={planTab() === 'results'}>
        <Show
          when={hasRealResults()}
          fallback={
            <div
              class="rounded-xl border border-dashed border-default bg-surface/40 px-4 py-10 text-center"
              data-testid="optimization-results-empty"
            >
              <Show when={isInCourse()}>
                <p class="text-xs font-semibold uppercase tracking-wide text-fero-blue">Jornada en curso</p>
              </Show>
              <p class="text-base font-semibold text-text-primary">Aún no hay resultados reales</p>
              <p class="mx-auto mt-1 max-w-md text-sm text-text-muted">
                Cierra el día para ver el previsto frente al real.
              </p>
              <div class="mt-4 flex flex-wrap justify-center gap-2">
                <Show
                  when={isInCourse()}
                  fallback={
                    <Button variant="primary" size="sm" onClick={() => setPlanTab('plan')}>
                      Ir a planificar el día
                    </Button>
                  }
                >
                  <Button
                    variant="primary"
                    size="sm"
                    data-testid="optimization-results-close-day"
                    onClick={() => setConfirmCloseDayOpen(true)}
                  >
                    Cerrar día
                  </Button>
                </Show>
              </div>
            </div>
          }
        >
          <div class="space-y-4">
            <p class="text-sm font-semibold text-text-primary" data-testid="optimization-results-context">
              Resultados reales · {humanDateShort(selectedDate())}
            </p>
            <OptimizationDayActualsPanel />
            <Show when={!dailyPlan()?.actualKpis}>
              <p class="text-sm text-text-muted" data-testid="optimization-results-consolidating">
                Aún no hay consolidación previsto vs. real para este día.
              </p>
            </Show>
          </div>
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
            <button
              type="button"
              onClick={() => setPlanTab('plan')}
              class="font-medium text-fero-blue hover:underline"
            >
              Volver a planificar el día
            </button>
            .
          </p>
        </div>
      </Show>
      </div>

      <ConfirmDialog
        open={confirmCloseDayOpen()}
        title="¿Cerrar el día?"
        message="Se cerrará la jornada seleccionada. Los puntos no visitados quedarán como pendientes para el siguiente plan."
        confirmLabel="Cerrar día"
        tone="danger"
        onConfirm={() => {
          setConfirmCloseDayOpen(false);
          void handleCloseDay();
        }}
        onCancel={() => setConfirmCloseDayOpen(false)}
        testId="optimization-close-day-confirm"
      />

      <Drawer
        open={contingencyOpen()}
        onClose={() => setContingencyOpen(false)}
        title="Simular contingencia"
      >
        <OptimizationContingencySimulator onApplied={() => setContingencyOpen(false)} />
      </Drawer>
    </div>
  );
}
