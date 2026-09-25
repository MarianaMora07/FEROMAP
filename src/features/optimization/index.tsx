import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount } from 'solid-js';
import { A, useNavigate, useSearchParams } from '@solidjs/router';
import {
  Download,
  ListChecks,
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
  simulateDayExecution,
} from '../../core/stores/optimizationStore';
import {
  buildDaySummaryRows,
  buildResultsTotals,
  buildRouteResults,
} from '../../core/utils/optimizationResults';
import { downloadDailyPlanPdf } from '../../core/api/planning';
import { mapDailyStatusToCalendar } from '../../core/planning/dailyPlanningUx';
import {
  operationalMapHref,
  daySimulationHref,
  optimizationHrefFrom,
  type OptimizationQueryPatch,
  type DaySimulationCondition,
} from '../../core/planning/operationalLinks';
import { parsePlaybackQueryParam } from '../../core/planning/operationalFlowUx';
import { AppShellSubheader } from '../../design-system/layout/pageChromeSlots';
import { globalToast } from '../../core/stores/toastStore';
import { OptimizationHeaderBar } from './OptimizationHeaderChrome';
import { OptimizationRouteMap } from './OptimizationRouteMap';
import { OptimizationPlaybackPanel } from './OptimizationPlaybackPanel';
import { PendingManagementPanel } from './PendingManagementPanel';
import { DurationBreakdownPanel } from '../simulation/DurationBreakdownPanel';
import { UncoveredPointsActionsPanel } from '../landfill/UncoveredPointsActionsPanel';
import { OptimizationProgressPanel } from './OptimizationProgressPanel';
import { OptimizationContextBand } from './OptimizationDispatchBanner';
import { OptimizationComparisonPanel } from './OptimizationComparisonPanel';
import { OptimizationContingencySimulator } from './OptimizationContingencySimulator';
import { OptimizationDayActualsPanel } from './OptimizationDayActualsPanel';
import { DaySimulationDialog } from './DaySimulationDialog';
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

type PlanTab = 'plan' | 'results' | 'routes' | 'pending';

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
  const [closeNotice, setCloseNotice] = createSignal<string | null>(null);
  // Pestañas persistidas en la URL (P1, L): `?tab=plan|results|routes|pending`.
  // La URL es la única fuente de verdad, lo que habilita deep-linking/ compartir y evita el reset
  // sorpresa al recargar.
  const readParam = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;
  const planTab = (): PlanTab => {
    const raw = readParam(searchParams.tab);
    return raw === 'results' || raw === 'pending' || raw === 'routes' ? raw : 'plan';
  };
  const navigateWithParams = (patch: OptimizationQueryPatch) => {
    navigate(optimizationHrefFrom(searchParams, patch), { replace: true });
  };
  const setPlanTab = (tab: PlanTab) => {
    if (planTab() === tab) return;
    navigateWithParams({ tab });
  };
  const [pageMenuOpen, setPageMenuOpen] = createSignal(false);
  const [confirmCloseDayOpen, setConfirmCloseDayOpen] = createSignal(false);
  const [contingencyOpen, setContingencyOpen] = createSignal(false);
  const [simulationDialogOpen, setSimulationDialogOpen] = createSignal(false);

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

  // Carry-over visible en la pestaña L1 «Pendientes» (P1, E): conserva la señal que antes
  // vivía en la tarjeta «Situación del día».
  const pendingTabLabel = () => {
    const count = dailyPlan()?.pendingPoints.length ?? 0;
    return count > 0 ? `Pendientes (${count})` : 'Pendientes';
  };

  const hasResults = () => optimizationState.kpis != null;
  // Fase del día (P3): en borrador el tab Plan muestra un único bloque «Siguiente paso» y
  // oculta el mapa y el resumen.
  const isDraftDay = () =>
    !hasResults() &&
    !optimizationState.isOptimizing &&
    !optimizationState.isLoadingDailyPlan &&
    !optimizationState.isLoadingContext &&
    (dailyPlan()?.status ?? 'draft') === 'draft';
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

  // Simulación guionada del día: vista propia (el mapa es el protagonista). El escenario a
  // simular lo elige el diálogo (what-if); aquí solo se propaga a la URL.
  const openDaySimulation = (condition?: DaySimulationCondition, scenario?: string | null) => {
    const plan = dailyPlan();
    if (plan?.id == null) return;
    if (optimizationState.playbackOpen) closeOptimizationPlayback();
    navigate(
      daySimulationHref({
        dailyPlanId: plan.id,
        date: plan.operationDate ?? selectedDate(),
        condition,
        scenario: scenario ?? undefined,
      }),
    );
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
  // El previsto del plan solo se muestra tras ejecutar «Simular día» para la fecha elegida
  // (antes aparecía junto a la generación, lo que se leía como resultados anticipados).
  // El marcador vive en `sessionStorage`, así que un recargo no vuelve a pedir simular.
  const hasSimulatedDay = () => {
    const marker = optimizationState.simulatedDayDate;
    if (!marker) return false;
    return marker === (dailyPlan()?.operationDate ?? selectedDate());
  };
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
    // Preserva la pestaña activa (tab) al cambiar de día.
    navigate(optimizationHrefFrom(searchParams, { date }), { replace: true });
    selectOperationDate(date);
  };

  onMount(() => {
    const dateParam = Array.isArray(searchParams.date) ? searchParams.date[0] : searchParams.date;
    void initOptimizationPage(dateParam ?? undefined);
  });

  // Deep link '#pendientes' (desde el Dashboard o el hub) abre la pestaña Pendientes (J).
  onMount(() => {
    const syncTabFromHash = () => {
      if (typeof window !== 'undefined' && window.location.hash === '#pendientes') {
        if (readParam(searchParams.tab) !== 'pending') setPlanTab('pending');
      }
    };
    syncTabFromHash();
    window.addEventListener('hashchange', syncTabFromHash);
    onCleanup(() => window.removeEventListener('hashchange', syncTabFromHash));
  });

  // Al cambiar de día o al completar una corrida nueva se descarta el aviso de cierre del día anterior.
  createEffect(() => {
    selectedDate();
    optimizationState.lastSimulationId;
    setCloseNotice(null);
  });

  createEffect(() => {
    const dateParam = Array.isArray(searchParams.date) ? searchParams.date[0] : searchParams.date;
    if (!dateParam || dateParam === optimizationState.preset.operationDate) return;
    selectOperationDate(dateParam);
  });

  // Limpieza de la URL: el parámetro `view` (antigua sub-vista del Plan) quedó obsoleto al retirar
  // las sub-tabs; se elimina al entrar conservando el resto del query y el hash `#pendientes`.
  createEffect(() => {
    if (readParam(searchParams.view) == null) return;
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      const single = Array.isArray(value) ? value[0] : value;
      if (single != null && single !== '' && key !== 'view') next.set(key, single);
    }
    const query = next.toString();
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    navigate(`${query ? `/optimization?${query}` : '/optimization'}${hash}`, { replace: true });
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

  // Ejecución simulada (demo): registra el "real" del día para poder contrastarlo con el plan.
  const [isSimulatingExecution, setIsSimulatingExecution] = createSignal(false);
  const handleSimulateExecution = async () => {
    setIsSimulatingExecution(true);
    try {
      const executed = await simulateDayExecution();
      globalToast.addToast(
        `Ejecución simulada: ${executed} parada(s) marcadas como visitadas.`,
        'success',
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo simular la ejecución del día';
      globalToast.addToast(message, 'error');
    } finally {
      setIsSimulatingExecution(false);
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

  // Pestaña propia «Rutas por vehículo» (L1), con el disparador «Simular día» en su cabecera.
  const routesPanel = () => (
    <>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-text-primary">Rutas por vehículo</h3>
        <Button
          variant="outline"
          size="sm"
          class="gap-1.5"
          icon={<Play size={14} />}
          data-testid="optimization-simulate-day"
          onClick={() => setSimulationDialogOpen(true)}
        >
          Simular día
        </Button>
      </div>

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

      <OptimizationContextBand closeNotice={closeNotice()} />

      <div class="flex items-center justify-between gap-2 border-b border-default">
        <TabList
          idPrefix="plan-day"
          panelId="plan-day-panel"
          tabs={[
            { id: 'plan', label: 'Plan' },
            { id: 'routes', label: 'Rutas por vehículo' },
            { id: 'results', label: 'Resultados' },
            { id: 'pending', label: pendingTabLabel() },
          ]}
          active={planTab()}
          onChange={(id) => setPlanTab(id as PlanTab)}
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
              class="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-lg border border-default bg-surface py-1 shadow-lg"
              data-testid="optimization-page-menu-items"
            >
              <div role="group" aria-labelledby="optimization-menu-group-simulation">
                <p
                  id="optimization-menu-group-simulation"
                  class="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted"
                >
                  Simulación
                </p>
                <button
                  type="button"
                  role="menuitem"
                  class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-text-primary hover:bg-app disabled:opacity-40"
                  disabled={!hasResults()}
                  data-testid="optimization-menu-simulate-day"
                  onClick={() => {
                    setPageMenuOpen(false);
                    setSimulationDialogOpen(true);
                  }}
                >
                  <Play size={15} class="shrink-0 text-text-muted" />
                  Simular día…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-text-primary hover:bg-app disabled:opacity-40"
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
                <button
                  type="button"
                  role="menuitem"
                  class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-text-primary hover:bg-app disabled:opacity-40"
                  disabled={!hasResults() || dayStatusKey() === 'closed' || isSimulatingExecution()}
                  data-testid="optimization-menu-simulate-execution"
                  onClick={() => {
                    setPageMenuOpen(false);
                    void handleSimulateExecution();
                  }}
                >
                  <ListChecks size={15} class="shrink-0 text-text-muted" />
                  Simular ejecución del día
                </button>
              </div>

              <div
                role="group"
                aria-labelledby="optimization-menu-group-notify"
                class="mt-1 border-t border-default pt-1"
              >
                <p
                  id="optimization-menu-group-notify"
                  class="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted"
                >
                  Notificación y exportación
                </p>
                <button
                  type="button"
                  role="menuitem"
                  class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-text-primary hover:bg-app disabled:opacity-40"
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
              </div>

              <div
                role="group"
                aria-labelledby="optimization-menu-group-nav"
                class="mt-1 border-t border-default pt-1"
              >
                <p
                  id="optimization-menu-group-nav"
                  class="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted"
                >
                  Navegación
                </p>
                <A
                  href={operationalMapHref({ focus: 'routes' })}
                  role="menuitem"
                  class="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-text-primary hover:bg-app"
                  onClick={() => setPageMenuOpen(false)}
                >
                  <Map size={15} class="shrink-0 text-text-muted" />
                  Ver en mapa operativo
                </A>
              </div>
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
        <Show when={isDraftDay()}>
          <div class="mx-auto w-full max-w-3xl space-y-4" data-testid="optimization-next-step">
            <div class="rounded-xl border border-default bg-elevated px-5 py-8 text-center shadow-sm">
              <span class="inline-flex items-center rounded-full border border-fero-blue/30 bg-fero-blue/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-fero-blue">
                Siguiente paso
              </span>
              <h2 class="mt-3 font-heading text-xl font-bold text-text-primary">
                Generar las rutas del día
              </h2>
              <p class="mx-auto mt-2 max-w-lg text-sm text-text-muted">
                El {humanDateShort(selectedDate())} todavía no tiene rutas generadas. Ejecuta la
                optimización: al terminar verás el mapa, el resumen y el despacho automático.
              </p>
              <p class="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-default bg-app px-3 py-1.5 text-xs font-medium text-text-secondary">
                <Sparkles size={14} class="text-fero-green-mid" aria-hidden="true" />
                Usa «Generar rutas del día» en la barra superior.
              </p>
            </div>
          </div>
        </Show>

        <Show when={!isDraftDay()}>
        <div class="flex flex-col gap-4">
          <OptimizationProgressPanel />

          <div class="relative">
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

          <DaySummaryCard optimizedRoutes={realOptimizedRoutes()} />
        </div>

        <Show when={hasResults()}>
          <div class="space-y-4" data-testid="optimization-plan-section">
            <UncoveredPointsActionsPanel
              kpis={kpis()!}
              dailyPlanId={dailyPlan()?.id}
              operationDate={selectedDate()}
              onDeferred={() => void refreshDailyPlan()}
            />
          </div>
        </Show>
        </Show>
      </Show>

      <Show when={planTab() === 'routes'}>
        <div class="space-y-4" data-testid="optimization-routes-tab">
          {routesPanel()}
        </div>
      </Show>

      <Show when={planTab() === 'results'}>
        <div class="space-y-4">
          {/* Estado vacío unificado: sin previsto simulado ni resultados reales (antes eran dos
              tarjetas apiladas con mensajes redundantes). */}
          <Show when={!hasSimulatedDay() && !hasRealResults()}>
            <div
              class="rounded-xl border border-dashed border-default bg-surface/40 px-4 py-10 text-center"
              data-testid="optimization-results-empty"
            >
              <Show when={isInCourse()}>
                <p class="text-xs font-semibold uppercase tracking-wide text-fero-blue">Jornada en curso</p>
              </Show>
              <p class="text-base font-semibold text-text-primary">Aún no hay resultados</p>
              <p class="mx-auto mt-1 max-w-md text-sm text-text-muted">
                Simula el día para ver el previsto del plan frente a la operación actual y, al
                terminar la jornada, ciérrala para ver el previsto frente al real.
              </p>
              <div class="mt-4 flex flex-wrap justify-center gap-2">
                <Show
                  when={baselineApplies()}
                  fallback={
                    <Button variant="primary" size="sm" onClick={() => setPlanTab('plan')}>
                      Ir a planificar el día
                    </Button>
                  }
                >
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Play size={14} />}
                    data-testid="optimization-results-simulate-cta"
                    onClick={() => setSimulationDialogOpen(true)}
                  >
                    Simular día
                  </Button>
                </Show>
              </div>
              <Show when={isInCourse()}>
                <p class="mx-auto mt-3 max-w-md text-xs text-text-muted">
                  Cuando termine, ciérrala con{' '}
                  <span class="font-semibold text-text-secondary">Cerrar día</span> en la barra
                  superior.
                </p>
              </Show>
            </div>
          </Show>

          <Show when={baselineApplies() && hasSimulatedDay()}>
            <section class="space-y-2" data-testid="optimization-results-forecast">
              <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-text-primary">
                    Previsto · línea base del turno vs. plan
                  </p>
                  <p class="mt-0.5 text-xs text-text-muted">
                    KPIs del plan frente a la operación actual. Simulación de la jornada calculada.
                  </p>
                </div>
                {/* Puente Plan ↔ Resultados: el disparador primario vive en Plan, pero
                    simular solo tiene sentido donde se leen las cifras, así que aquí se
                    ofrece como acceso secundario (mismo drawer). */}
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 text-xs font-medium text-fero-blue hover:underline"
                  title="Animar el recorrido del día con contingencias (solo lectura, no cambia el plan)"
                  data-testid="optimization-results-simulate-day"
                  onClick={() => setSimulationDialogOpen(true)}
                >
                  <Play size={14} aria-hidden="true" />
                  Simular día
                </button>
              </div>
              <OptimizationComparisonPanel kpis={kpis()!} kpiView={optimizationState.preset.kpiView} />
              <DurationBreakdownPanel kpis={kpis()!} />
            </section>
          </Show>

          <Show when={hasRealResults()}>
            <section class="space-y-2">
              <p class="text-sm font-semibold text-text-primary" data-testid="optimization-results-context">
                Real · previsto vs. real · {humanDateShort(selectedDate())}
              </p>
              <OptimizationDayActualsPanel />
              <Show
                when={
                  (dailyPlan()?.actualKpis?.servedPoints ?? 0) === 0 && dayStatusKey() !== 'closed'
                }
              >
                <div class="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    class="gap-1.5"
                    icon={<Play size={14} />}
                    loading={isSimulatingExecution()}
                    disabled={isSimulatingExecution()}
                    data-testid="optimization-simulate-execution"
                    onClick={() => void handleSimulateExecution()}
                  >
                    Simular ejecución del día
                  </Button>
                  <span class="text-xs text-text-muted">
                    Registra una ejecución de demo (paradas visitadas) para contrastar previsto vs.
                    real.
                  </span>
                </div>
              </Show>
              <Show when={!dailyPlan()?.actualKpis}>
                <p class="text-sm text-text-muted" data-testid="optimization-results-consolidating">
                  Aún no hay consolidación previsto vs. real para este día.
                </p>
              </Show>
            </section>
          </Show>

          {/* Ya simulado pero sin cierre: solo falta el real. Comparte el testid del estado
              vacío de Resultados (ambos son mutuamente excluyentes). Se mantiene compacto para
              no leerse como «la simulación no hizo nada». */}
          <Show when={hasSimulatedDay() && !hasRealResults()}>
            <div
              class="rounded-xl border border-dashed border-default bg-surface/40 px-4 py-4"
              data-testid="optimization-results-empty"
            >
              <p class="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
                <Show when={isInCourse()}>
                  <span class="rounded-full border border-fero-blue/30 bg-fero-blue/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-fero-blue">
                    Jornada en curso
                  </span>
                </Show>
                Real · previsto vs. real
              </p>
              <p class="mt-1 text-sm text-text-muted">
                La simulación del día ya se calculó. El comparativo{' '}
                <span class="font-semibold text-text-secondary">previsto vs. real</span> aparecerá al
                cerrar el día
                <Show when={isInCourse()}>
                  {' '}
                  — usa <span class="font-semibold text-text-secondary">Cerrar día</span> en la
                  barra superior cuando termine.
                </Show>
              </p>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={planTab() === 'pending'}>
        <div class="space-y-4" data-testid="optimization-pending-section">
          <div class="rounded-xl border border-default bg-elevated shadow-xs">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-default px-4 py-3">
              <div class="min-w-0">
                <p class="text-sm font-semibold text-text-primary">Gestión de pendientes</p>
                <p class="mt-0.5 text-xs text-text-muted">
                  Puntos no visitados de días anteriores que se incorporan al consolidar el plan.
                </p>
              </div>
              <Show when={(dailyPlan()?.pendingPoints.length ?? 0) > 0}>
                <span class="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  {dailyPlan()?.pendingPoints.length ?? 0} pendiente
                  {(dailyPlan()?.pendingPoints.length ?? 0) === 1 ? '' : 's'}
                </span>
              </Show>
            </div>
            <div class="px-4 py-3">
              <PendingManagementPanel operationDate={selectedDate()} embedded />
            </div>
          </div>
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

      <Drawer
        open={simulationDialogOpen()}
        onClose={() => setSimulationDialogOpen(false)}
        title="Simular día"
      >
        <DaySimulationDialog
          onWatch={(condition, scenario) => {
            setSimulationDialogOpen(false);
            openDaySimulation(condition, scenario);
          }}
          onClose={() => setSimulationDialogOpen(false)}
        />
      </Drawer>
    </div>
  );
}
