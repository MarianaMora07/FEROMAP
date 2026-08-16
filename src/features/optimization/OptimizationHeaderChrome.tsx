import { Show, createSignal } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import { ChevronLeft, ChevronRight, Loader2, Play, Radio, Send, Sparkles } from 'lucide-solid';
import { Button, Drawer } from '../../design-system/components';
import { canOptimize } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import {
  dispatchOptimizationResult,
  executeOptimization,
  openOptimizationPlayback,
  optimizationState,
  refreshWeekCalendar,
  selectOperationDate,
} from '../../core/stores/optimizationStore';
import { shiftWeek } from '../../core/planning/dailyPlanningUx';
import { monitoringHref, optimizationHref } from '../../core/planning/operationalLinks';
import { OptimizationWeekCalendarPopover } from './OptimizationWeekCalendarPopover';
import { OptimizationExperienceStepper } from './OptimizationExperienceStepper';
import {
  optimizationActiveStepChipLabel,
  optimizationToolbarSummary,
} from './optimizationLayoutUx';
import { DailyScenarioBanner } from './DailyScenarioBanner';
import type { ScenarioId } from '../../data/types/simulation';

export function OptimizationHeaderBar() {
  const navigate = useNavigate();
  const [stepDrawerOpen, setStepDrawerOpen] = createSignal(false);
  const dailyPlan = () => optimizationState.dailyPlan;
  const selectedDate = () => optimizationState.preset.operationDate;
  const hasResults = () => optimizationState.kpis != null;
  const canSimulate = () => dailyPlan()?.status === 'optimized' && hasResults();
  const isDispatched = () => dailyPlan()?.status === 'dispatched';
  const pointCount = () => dailyPlan()?.finalPointIds.length ?? optimizationState.context?.pointsToVisit ?? 0;
  const monitoringLink = () =>
    isDispatched()
      ? monitoringHref({
          date: dailyPlan()?.operationDate ?? selectedDate(),
          dailyPlanId: dailyPlan()?.id,
        })
      : null;

  const summaryLabel = () =>
    optimizationToolbarSummary({
      operationDate: selectedDate(),
      status: dailyPlan()?.status,
      pointCount: pointCount(),
    });

  const stepChipLabel = () =>
    optimizationActiveStepChipLabel({
      dailyStatus: dailyPlan()?.status,
      hasResults: hasResults(),
      playbackOpen: optimizationState.playbackOpen,
      weeklyPlanApproved: optimizationState.weeklyPlanApproved,
    });

  const shiftWeekNav = (weeks: number) => {
    const next = shiftWeek(optimizationState.weekStartDate, weeks);
    void refreshWeekCalendar(next);
  };

  const navigateToDate = (date: string) => {
    navigate(optimizationHref({ date }), { replace: true });
    selectOperationDate(date);
  };

  return (
    <>
      <div
        class="flex w-full min-w-0 items-center justify-between gap-x-2"
        data-testid="optimization-sticky-toolbar"
      >
        <div class="flex min-w-0 items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            class="px-2"
            aria-label="Semana anterior"
            onClick={() => shiftWeekNav(-1)}
          >
            <ChevronLeft size={14} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            class="px-2"
            aria-label="Semana siguiente"
            onClick={() => shiftWeekNav(1)}
          >
            <ChevronRight size={14} />
          </Button>
          <OptimizationWeekCalendarPopover
            selectedDate={selectedDate()}
            summaryLabel={summaryLabel()}
            onDateSelect={navigateToDate}
          />
        </div>
        <span class="hidden text-text-muted lg:inline" aria-hidden="true">
          |
        </span>
        <button
          type="button"
          class="hidden shrink-0 rounded-full border border-fero-blue/30 bg-fero-blue/10 px-2.5 py-1 text-xs font-semibold text-fero-blue hover:bg-fero-blue/15 lg:inline"
          data-testid="optimization-experience-chip"
          onClick={() => setStepDrawerOpen(true)}
        >
          {stepChipLabel()}
        </button>
        <div class="flex items-center gap-1.5">
          <Button
            variant="gradient"
            size="sm"
            class="font-semibold"
            icon={
              optimizationState.isOptimizing ? (
                <Loader2 size={14} class="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )
            }
            disabled={
              optimizationState.isOptimizing ||
              !canOptimize(authUser()?.role) ||
              !optimizationState.weeklyPlanApproved
            }
            title={!optimizationState.weeklyPlanApproved ? 'Falta aprobar plan semanal' : undefined}
            aria-label="Generar ruta operativa"
            data-testid="optimization-generate-route"
            onClick={() => void executeOptimization()}
          >
            {optimizationState.isOptimizing ? `${optimizationState.optimizationProgress}%` : 'Generar'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Play size={14} />}
            disabled={!canSimulate() || optimizationState.playbackOpen}
            data-testid="optimization-simulate-route"
            aria-label="Simular recorrido"
            onClick={() => openOptimizationPlayback()}
          >
            Simular
          </Button>
          <Show
            when={isDispatched() && monitoringLink()}
            fallback={
              <Button
                variant="primary"
                size="sm"
                icon={<Send size={14} />}
                disabled={
                  optimizationState.isDispatching ||
                  optimizationState.lastSimulationId == null ||
                  !canOptimize(authUser()?.role) ||
                  !optimizationState.weeklyPlanApproved ||
                  !hasResults()
                }
                title={!optimizationState.weeklyPlanApproved ? 'Falta aprobar plan semanal' : undefined}
                aria-label="Despachar rutas"
                data-testid="optimization-dispatch-route"
                onClick={() => void dispatchOptimizationResult()}
              >
                {optimizationState.isDispatching ? '…' : 'Despachar'}
              </Button>
            }
          >
            {(href) => (
              <A href={href()}>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Radio size={14} />}
                  aria-label="Abrir monitoreo"
                  data-testid="optimization-monitoring-route"
                >
                  Monitoreo
                </Button>
              </A>
            )}
          </Show>
        </div>
      </div>
      <Drawer
        open={stepDrawerOpen()}
        onClose={() => setStepDrawerOpen(false)}
        title="Experiencia del día"
      >
        <Show when={!optimizationState.isLoadingDailyPlan}>
          <OptimizationExperienceStepper
            dailyStatus={dailyPlan()?.status}
            hasResults={hasResults()}
            playbackOpen={optimizationState.playbackOpen}
            weeklyPlanApproved={optimizationState.weeklyPlanApproved}
            operationDate={selectedDate()}
            dailyPlanId={dailyPlan()?.id}
            onOpenPlayback={() => {
              openOptimizationPlayback();
              setStepDrawerOpen(false);
            }}
          />
        </Show>
      </Drawer>
    </>
  );
}

export function OptimizationDailyBanner() {
  const dailyPlan = () => optimizationState.dailyPlan;
  const scenarioId = (): ScenarioId =>
    dailyPlan()?.scenarioId ?? optimizationState.preset.scenarioId;
  const scenarioLabel = () =>
    optimizationState.context?.scenarios.find((scenario) => scenario.id === scenarioId())?.label ??
    scenarioId();

  return (
    <div class="border-t border-default px-4 md:px-6">
      <DailyScenarioBanner
        scenarioId={scenarioId()}
        scenarioLabel={scenarioLabel()}
        weeklyPlanApproved={optimizationState.weeklyPlanApproved}
        pendingCount={dailyPlan()?.pendingPoints.length ?? 0}
      />
    </div>
  );
}
