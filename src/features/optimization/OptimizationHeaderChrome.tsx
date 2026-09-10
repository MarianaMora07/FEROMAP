import { Show, createMemo, createSignal } from 'solid-js';
import { Portal } from 'solid-js/web';
import { A, useNavigate } from '@solidjs/router';
import { ChevronLeft, ChevronRight, Loader2, Radio, Send, Sparkles, AlertTriangle } from 'lucide-solid';
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
  cancelOptimization,
} from '../../core/stores/optimizationStore';
import { shiftWeek } from '../../core/planning/dailyPlanningUx';
import { monitoringHref, optimizationHref } from '../../core/planning/operationalLinks';
import { weeklyPlanHref } from '../../core/planning/weeklyPlanLinks';
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
  const [gateOpen, setGateOpen] = createSignal(false);
  const dailyPlan = () => optimizationState.dailyPlan;
  const selectedDate = () => optimizationState.preset.operationDate;
  const hasResults = () => optimizationState.kpis != null;
  // El plan del día ya generado no se regenera desde esta vista (no cambian las
  // condiciones iniciales aquí): el botón solo se muestra mientras no hay resultados.
  const showGenerate = () => !hasResults() || optimizationState.isOptimizing;
  const isDispatched = () => dailyPlan()?.status === 'dispatched';
  const isPlanClosed = () => dailyPlan()?.status === 'closed';
  const generateActionLabel = () => 'Generar Plan Operativo';
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

  const weekRange = createMemo(() => {
    const start = optimizationState.weekStartDate;
    if (!start) return null;
    const end = new Date(`${start}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 6);
    return { start, end: end.toISOString().slice(0, 10) };
  });

  const nextWeek = createMemo(() => {
    const start = optimizationState.weekStartDate;
    if (!start) return null;
    const nextStart = new Date(`${start}T00:00:00Z`);
    nextStart.setUTCDate(nextStart.getUTCDate() + 7);
    const nextEnd = new Date(nextStart);
    nextEnd.setUTCDate(nextEnd.getUTCDate() + 6);
    return {
      start: nextStart.toISOString().slice(0, 10),
      end: nextEnd.toISOString().slice(0, 10),
    };
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
          <Show when={optimizationState.isOptimizing}>
            <Button
              variant="outline"
              size="sm"
              data-testid="optimization-cancel-toolbar"
              onClick={() => void cancelOptimization()}
            >
              Cancelar
            </Button>
          </Show>
          <Show when={showGenerate()}>
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
              disabled={optimizationState.isOptimizing || !canOptimize(authUser()?.role)}
              aria-label={generateActionLabel()}
              data-testid="optimization-generate-route"
              onClick={() => {
                if (!optimizationState.weeklyPlanApproved) {
                  setGateOpen(true);
                  return;
                }
                setGateOpen(false);
                void executeOptimization();
              }}
            >
              {optimizationState.isOptimizing ? `${optimizationState.optimizationProgress}%` : generateActionLabel()}
            </Button>
          </Show>
          <Show
            when={isDispatched() && monitoringLink()}
            fallback={
              <Show when={hasResults() && !isPlanClosed()}>
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
                  aria-label="Notificar a conductores"
                  data-testid="optimization-dispatch-route"
                  onClick={() => void dispatchOptimizationResult()}
                >
                  {optimizationState.isDispatching ? '…' : 'Notificar a conductores'}
                </Button>
              </Show>
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

      <Show when={weekRange()}>
        {(range) => (
          <div class="flex w-full flex-wrap items-center gap-2 pt-1.5">
            <span class="text-xs text-text-muted" data-testid="optimization-week-context">
              Semana {range().start} – {range().end}
            </span>
            <Show
              when={optimizationState.weeklyPlanApproved}
              fallback={
                <span
                  class="inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300"
                  data-testid="optimization-week-unapproved-chip"
                >
                  <AlertTriangle size={11} />
                  sin plan semanal aprobado
                </span>
              }
            >
              <span
                class="inline-flex items-center rounded-full border border-fero-green/30 bg-fero-green/10 px-2 py-0.5 text-[11px] font-semibold text-fero-green-dark dark:text-fero-green"
                data-testid="optimization-week-approved-chip"
              >
                semana aprobada
              </span>
            </Show>
          </div>
        )}
      </Show>

      <Show when={gateOpen() && !optimizationState.weeklyPlanApproved}>
        <Portal>
          <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            data-testid="optimization-approval-dialog"
            onClick={() => setGateOpen(false)}
          >
            <div
              class="flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-xl border border-default bg-surface p-5 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 class="font-heading text-lg font-bold text-text-primary dark:text-white">
                La semana del {selectedDate()} no está aprobada
              </h3>
              <p class="mt-1 text-sm text-text-muted">
                Para generar rutas hace falta aprobar el plan semanal de esta semana. Puedes ir al
                Plan semanal, o elegir un día de la próxima semana que ya esté aprobada.
              </p>
              <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  class="w-full sm:w-auto"
                  onClick={() => setGateOpen(false)}
                >
                  Cancelar
                </Button>
                <Show when={nextWeek()}>
                  {(week) => (
                    <Button
                      variant="outline"
                      size="sm"
                      class="w-full sm:w-auto"
                      data-testid="optimization-dialog-next-week"
                      onClick={() => {
                        setGateOpen(false);
                        navigate(optimizationHref({ date: week().start }), { replace: true });
                        selectOperationDate(week().start);
                      }}
                    >
                      Ver un día de la semana {week().start}
                    </Button>
                  )}
                </Show>
                <Button
                  variant="primary"
                  size="sm"
                  class="w-full sm:w-auto"
                  data-testid="optimization-dialog-weekly"
                  onClick={() => {
                    setGateOpen(false);
                    navigate(weeklyPlanHref);
                  }}
                >
                  Ir al Plan semanal
                </Button>
              </div>
            </div>
          </div>
        </Portal>
      </Show>

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
