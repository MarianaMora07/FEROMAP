import { For, Show, createEffect, createMemo, createResource, createSignal, onMount } from 'solid-js';
import { A, useNavigate, useSearchParams } from '@solidjs/router';
import {
  MapPin,
  Route,
  Clock,
  Weight,
  Map,
} from 'lucide-solid';
import {
  Button,
  Card,
  CardHeader,
} from '../../design-system/components';
import { appState } from '../../core/stores/appStore';
import { routeDisplayKind } from '../../core/map/operationalMapLayers';
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
import {
  type OptimizationTabId,
} from '../../data/mock/optimization';
import { downloadDailyPlanPdf } from '../../core/api/planning';
import { optimizationDateHref, tomorrowIso } from '../../core/planning/planningUx';
import { optimizationHref, operationalMapHref } from '../../core/planning/operationalLinks';
import { parsePlaybackQueryParam } from '../../core/planning/operationalFlowUx';
import { PlanningContextualCta } from '../planning/PlanningContextualCta';
import { PlanningEmptyState } from '../planning/PlanningEmptyState';
import { PLANNING_EMPTY_PRESETS } from '../../core/planning/planningEmptyStates';
import { AppShellSubheader } from '../../design-system/layout/pageChromeSlots';
import { OptimizationHeaderBar } from './OptimizationHeaderChrome';
import { OptimizationRouteMap } from './OptimizationRouteMap';
import { OptimizationPlaybackPanel } from './OptimizationPlaybackPanel';
import { OptimizationMainTabs } from './OptimizationMainTabs';
import { OptimizationMoreContextPanel } from './OptimizationMoreContextPanel';
import { OptimizationHistoryPanel } from './OptimizationHistoryPanel';
import { OptimizationParametersForm } from './OptimizationParametersForm';
import { OptimizationResultsCompact } from './OptimizationResultsCompact';
import { DurationBreakdownPanel } from '../simulation/DurationBreakdownPanel';
import { LandfillKpiStrip } from '../landfill/LandfillKpiStrip';
import { UncoveredPointsActionsPanel } from '../landfill/UncoveredPointsActionsPanel';
import { OptimizationParametersSheet } from './OptimizationParametersSheet';
import { OptimizationProgressPanel } from './OptimizationProgressPanel';
import { OptimizationDispatchBanner } from './OptimizationDispatchBanner';
import { OptimizationComparisonPanel } from './OptimizationComparisonPanel';
import { OptimizationConvergencePanel } from './OptimizationConvergencePanel';
import { OptimizationWeeklyPlanGateBanner } from './OptimizationWeeklyPlanGateBanner';
import { OptimizationAcoSensitivityPanel } from './OptimizationAcoSensitivityPanel';
import { useGenerateButtonVisibility } from './useGenerateButtonVisibility';
import { resolveOptimizationContextualMessage } from './optimizationLayoutUx';
import { fetchDailyRoutePlayback } from '../../core/api/routePlayback';
import { useRoutePlayback } from '../../core/route-playback/useRoutePlayback';
import { mockDailyRoutePlayback } from '../../data/mock/routePlayback';

const scenarioIconMap = {
  'map-pin': MapPin,
  route: Route,
  clock: Clock,
  weight: Weight,
} as const;

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
    <OptimizationResultsCompact
      routeResults={props.routeResults}
      totals={props.totals}
      driverByVehicleId={props.driverByVehicleId}
    />
  );
}

export default function OptimizationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [tab, setTab] = createSignal<OptimizationTabId>('nueva');
  const [paramsSheetOpen, setParamsSheetOpen] = createSignal(false);
  const [dispatchError, setDispatchError] = createSignal<string | null>(null);
  const [closeNotice, setCloseNotice] = createSignal<string | null>(null);
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
      return dailyPlan()?.id ?? 0;
    },
    async (dailyPlanId) => {
      if (!dailyPlanId) return mockDailyRoutePlayback(0);
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
  const kpis = () => optimizationState.kpis!;
  const routeResults = createMemo(() => {
    if (!hasResults()) return [];
    const optimized =
      optimizationState.lastResult?.routes.optimized ?? {
        type: 'FeatureCollection' as const,
        features: appState.routes.features.filter(
          (feature) => routeDisplayKind(feature.properties) === 'optimized',
        ),
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

  const handleViewDayFromHistory = (operationDate: string) => {
    setTab('nueva');
    navigateToDate(operationDate);
  };

  const contextualMessage = createMemo(() =>
    resolveOptimizationContextualMessage({
      closeNotice: closeNotice(),
      closeNoticeHref: closeNotice() ? optimizationDateHref(tomorrowIso()) : null,
    }),
  );

  const parametersPanel = () => (
    <>
      <OptimizationParametersForm
        onGenerate={() => void handleGenerate()}
        disabled={optimizationState.isLoadingContext}
        formGenerateVisible={formGenerateInView()}
        generateAnchorRef={setGenerateAnchorRef}
      />
      <ScenarioInfoCard />
      <OptimizationProgressPanel />
    </>
  );

  return (
    <div class="space-y-4 md:space-y-5">
      <AppShellSubheader>
        <OptimizationHeaderBar />
      </AppShellSubheader>
      <OptimizationMainTabs tab={tab()} onTabChange={setTab} />

      <OptimizationWeeklyPlanGateBanner />
      <OptimizationDispatchBanner />

      <Show when={tab() === 'nueva'}>
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
          <details class="group order-2 hidden space-y-4 xl:order-1 xl:col-span-3 xl:block" open>
            <summary class="mb-3 cursor-pointer list-none text-sm font-semibold text-text-primary marker:content-none">
              Parámetros
            </summary>
            {parametersPanel()}
          </details>

          <div class="order-1 space-y-4 xl:order-2 xl:col-span-9">
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

            <Show when={hasResults()}>
              <UncoveredPointsActionsPanel
                kpis={kpis()!}
                dailyPlanId={dailyPlan()?.id}
                operationDate={selectedDate()}
                onDeferred={() => void refreshDailyPlan()}
              />
              <OptimizationComparisonPanel kpis={kpis()!} kpiView={optimizationState.preset.kpiView} />
              <OptimizationConvergencePanel points={optimizationState.acoConvergence} />
              <LandfillKpiStrip kpis={kpis()} routes={appState.routes} />
              <DurationBreakdownPanel kpis={kpis()!} />
              <div class="flex flex-wrap items-center justify-end gap-2">
                <A href={operationalMapHref({ focus: 'routes' })}>
                  <Button variant="outline" size="sm" icon={<Map size={16} />}>
                    Ver en mapa operativo
                  </Button>
                </A>
              </div>
              <ResultsCard
                routeResults={routeResults()}
                totals={totals()!}
                driverByVehicleId={driverByVehicleId()}
              />
              <OptimizationAcoSensitivityPanel />
            </Show>
          </div>
        </div>

        <OptimizationMoreContextPanel
          selectedDate={selectedDate()}
          dailyPlan={dailyPlan()}
          weeklyPlanApproved={optimizationState.weeklyPlanApproved}
          scenarioLabel={scenarioLabel()}
          pendingCount={dailyPlan()?.pendingPoints.length ?? 0}
          scheduledCount={dailyPlan()?.scheduledPoints.length ?? 0}
          totalCount={dailyPlan()?.finalPointIds.length ?? 0}
          pendingPoints={dailyPlan()?.pendingPoints ?? []}
          loading={optimizationState.isLoadingDailyPlan}
          pdfDisabled={!dailyPlan()?.id}
          onRefreshPending={() => void refreshDailyPlan()}
          onCloseDay={() => void handleCloseDay()}
          onDownloadPdf={() => void handleDownloadDailyPdf()}
          noWeeklyApprovedSlot={
            !optimizationState.isLoadingDailyPlan && !optimizationState.weeklyPlanApproved ? (
              <Card>
                <PlanningEmptyState {...PLANNING_EMPTY_PRESETS.noWeeklyApproved} />
              </Card>
            ) : undefined
          }
        />
      </Show>

      <Show when={tab() === 'historial'}>
        <OptimizationHistoryPanel onViewDay={handleViewDayFromHistory} />
      </Show>
    </div>
  );
}
