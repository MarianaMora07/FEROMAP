import { Show, createSignal } from 'solid-js';
import { A } from '@solidjs/router';
import { ChevronLeft, ChevronRight, Loader2, Play, Radio, Send, Sparkles } from 'lucide-solid';
import { Button, Drawer } from '../../design-system/components';
import { canOptimize } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { optimizationState, refreshWeekCalendar } from '../../core/stores/optimizationStore';
import { shiftWeek } from '../../core/planning/dailyPlanningUx';
import { OptimizationWeekCalendarPopover } from './OptimizationWeekCalendarPopover';
import { OptimizationExperienceStepper } from './OptimizationExperienceStepper';
import {
  optimizationActiveStepChipLabel,
  optimizationToolbarSummary,
} from './optimizationLayoutUx';

interface OptimizationStickyToolbarProps {
  selectedDate: string;
  dailyStatus?: string | null;
  pointCount: number;
  hasResults: boolean;
  playbackOpen: boolean;
  weeklyPlanApproved: boolean;
  dailyPlanId?: number;
  canSimulate: boolean;
  isOptimizing: boolean;
  isDispatching: boolean;
  showStickyGenerate: boolean;
  isDispatched: boolean;
  monitoringHref?: string | null;
  onDateSelect: (date: string) => void;
  onGenerate: () => void;
  onSimulate: () => void;
  onDispatch: () => void;
  onOpenPlayback?: () => void;
}

export function OptimizationStickyToolbar(props: OptimizationStickyToolbarProps) {
  const [stepDrawerOpen, setStepDrawerOpen] = createSignal(false);

  const summaryLabel = () =>
    optimizationToolbarSummary({
      operationDate: props.selectedDate,
      status: props.dailyStatus,
      pointCount: props.pointCount,
    });

  const stepChipLabel = () =>
    optimizationActiveStepChipLabel({
      dailyStatus: props.dailyStatus,
      hasResults: props.hasResults,
      playbackOpen: props.playbackOpen,
      weeklyPlanApproved: props.weeklyPlanApproved,
    });

  const shiftWeekNav = (weeks: number) => {
    const next = shiftWeek(optimizationState.weekStartDate, weeks);
    void refreshWeekCalendar(next);
  };

  return (
    <>
      <div
        class="sticky top-(--header-height) z-20 -mx-4 border-b border-default bg-elevated/95 px-3 py-2 backdrop-blur-md md:-mx-6 md:px-4"
        data-testid="optimization-sticky-toolbar"
      >
        <div class="flex flex-wrap items-center gap-x-2 gap-y-2">
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
              selectedDate={props.selectedDate}
              summaryLabel={summaryLabel()}
              onDateSelect={props.onDateSelect}
            />
          </div>

          <span class="hidden text-text-muted sm:inline" aria-hidden="true">
            |
          </span>

          <button
            type="button"
            class="shrink-0 rounded-full border border-fero-blue/30 bg-fero-blue/10 px-2.5 py-1 text-xs font-semibold text-fero-blue hover:bg-fero-blue/15"
            data-testid="optimization-experience-chip"
            onClick={() => setStepDrawerOpen(true)}
          >
            {stepChipLabel()}
          </button>

          <div class="ml-auto flex flex-wrap items-center gap-1.5">
            <Show when={props.showStickyGenerate}>
              <Button
                variant="gradient"
                size="sm"
                class="font-semibold"
                icon={
                  props.isOptimizing ? (
                    <Loader2 size={14} class="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )
                }
                disabled={
                  props.isOptimizing ||
                  !canOptimize(authUser()?.role) ||
                  !props.weeklyPlanApproved
                }
                title={!props.weeklyPlanApproved ? 'Falta aprobar plan semanal' : undefined}
                aria-label="Generar ruta operativa"
                data-testid="optimization-generate-route"
                onClick={() => props.onGenerate()}
              >
                {props.isOptimizing ? `${optimizationState.optimizationProgress}%` : 'Generar'}
              </Button>
            </Show>
            <Button
              variant="secondary"
              size="sm"
              icon={<Play size={14} />}
              disabled={!props.canSimulate || props.playbackOpen}
              data-testid="optimization-simulate-route"
              aria-label="Simular recorrido"
              onClick={() => props.onSimulate()}
            >
              Simular
            </Button>
            <Show
              when={props.isDispatched && props.monitoringHref}
              fallback={
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Send size={14} />}
                  disabled={
                    props.isDispatching ||
                    optimizationState.lastSimulationId == null ||
                    !canOptimize(authUser()?.role) ||
                    !props.weeklyPlanApproved ||
                    !props.hasResults
                  }
                  title={!props.weeklyPlanApproved ? 'Falta aprobar plan semanal' : undefined}
                  aria-label="Despachar rutas"
                  data-testid="optimization-dispatch-route"
                  onClick={() => props.onDispatch()}
                >
                  {props.isDispatching ? '…' : 'Despachar'}
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
      </div>

      <Drawer
        open={stepDrawerOpen()}
        onClose={() => setStepDrawerOpen(false)}
        title="Experiencia del día"
      >
        <Show when={!optimizationState.isLoadingDailyPlan}>
          <OptimizationExperienceStepper
            dailyStatus={props.dailyStatus}
            hasResults={props.hasResults}
            playbackOpen={props.playbackOpen}
            weeklyPlanApproved={props.weeklyPlanApproved}
            operationDate={props.selectedDate}
            dailyPlanId={props.dailyPlanId}
            onOpenPlayback={() => {
              props.onOpenPlayback?.();
              setStepDrawerOpen(false);
            }}
          />
        </Show>
      </Drawer>
    </>
  );
}
