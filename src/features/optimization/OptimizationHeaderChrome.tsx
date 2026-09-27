import { Show, createMemo, createSignal } from 'solid-js';
import { Portal } from 'solid-js/web';
import { A, useNavigate, useSearchParams } from '@solidjs/router';
import { ChevronLeft, ChevronRight, CloudRain, Compass, Flag, Loader2, Radio, Sparkles } from 'lucide-solid';
import { Button, Drawer } from '../../design-system/components';
import { canOptimize } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import {
  executeOptimization,
  openOptimizationPlayback,
  optimizationState,
  selectOperationDate,
  cancelOptimization,
} from '../../core/stores/optimizationStore';
import { dailyPlanStatusLabel } from '../../core/map/mapPlaybackUx';
import {
  DAILY_CALENDAR_STATUS_STYLES,
  mapDailyStatusToCalendar,
  mondayOfDate,
} from '../../core/planning/dailyPlanningUx';
import { monitoringHref, optimizationHrefFrom } from '../../core/planning/operationalLinks';
import { PLANNING_LEVELS } from '../../core/planning/planningUx';
import { weeklyPlanWeekHref } from '../../core/planning/weeklyPlanLinks';
import { formatWeekRangeLabel } from '../../core/planning/weekLabels';
import { OptimizationWeekCalendarPopover } from './OptimizationWeekCalendarPopover';
import { OptimizationExperienceStepper } from './OptimizationExperienceStepper';
import {
  optimizationActiveStepChipLabel,
  optimizationToolbarSummary,
} from './optimizationLayoutUx';

export function OptimizationHeaderBar(
  props: {
    onCloseDay?: () => void;
    notifiedCount?: number | null;
    onViewResults?: () => void;
  } = {},
) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [stepDrawerOpen, setStepDrawerOpen] = createSignal(false);
  const [gateOpen, setGateOpen] = createSignal(false);
  const dailyPlan = () => optimizationState.dailyPlan;
  const selectedDate = () => optimizationState.preset.operationDate;
  // Semana del día en foco, para nombrarla en el candado de aprobación.
  const selectedWeekRange = () => formatWeekRangeLabel(mondayOfDate(selectedDate()));
  const hasResults = () => optimizationState.kpis != null;
  const isDispatched = () => dailyPlan()?.status === 'dispatched';
  const isPlanClosed = () => dailyPlan()?.status === 'closed';
  const generateActionLabel = () => 'Generar rutas del día';
  // Nivel de planificación de esta pantalla (D5): administrativo/día.
  const levelChip = () => PLANNING_LEVELS.administrativo;
  // Estado del día (D9): texto crudo (Parcial/Cerrado…) con el tono del calendario.
  const dayStatus = () => dailyPlan()?.status;
  // ¿El día ya tiene plan? Se decide por el **estado del plan**, no por `kpis`: en un día
  // despachado/cerrado (p. ej. sembrado) los KPIs pueden no estar hidratados y la barra
  // mostraba «Generar» y el stepper en el paso 1 aunque el día ya estuviera en marcha.
  const dayPlanExists = () => {
    const key = mapDailyStatusToCalendar(dayStatus());
    return (
      optimizationState.isOptimizing ||
      key === 'optimized' ||
      key === 'dispatched' ||
      key === 'closed'
    );
  };
  // «Generar» es la acción siguiente solo mientras el día sigue en borrador.
  const showGenerate = () => optimizationState.isOptimizing || !dayPlanExists();
  const statusChip = () => {
    const status = dayStatus();
    if (!status) return null;
    return {
      label: dailyPlanStatusLabel(status),
      cell: DAILY_CALENDAR_STATUS_STYLES[mapDailyStatusToCalendar(status)].cell,
    };
  };
  // D3: el despacho es automático; la barra solo informa su resultado.
  const notifyIndicator = () => {
    if (isDispatched()) {
      const count = props.notifiedCount ?? null;
      return {
        toneClass: 'border-fero-green/30 bg-fero-green/10 text-fero-green-dark dark:text-fero-green',
        label:
          count != null
            ? `Conductores notificados · ${count} ruta${count === 1 ? '' : 's'}`
            : 'Conductores notificados',
      };
    }
    if (
      hasResults() &&
      mapDailyStatusToCalendar(dayStatus()) !== 'closed' &&
      optimizationState.weeklyPlanApproved
    ) {
      return optimizationState.isDispatching
        ? {
            toneClass: 'border-fero-blue/30 bg-fero-blue/10 text-fero-blue',
            label: 'Notificando a conductores…',
          }
        : {
            toneClass:
              'border-amber-300/60 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200',
            label: 'Conductores sin notificar',
          };
    }
    return null;
  };
  // Guía previa al despacho: «Experiencia del día» deja de aportar cuando el día ya está
  // despachado o cerrado (el flujo terminó).
  const isDayFinished = () => isDispatched() || mapDailyStatusToCalendar(dayStatus()) === 'closed';
  const showExperienceGuide = () => !isDayFinished();
  // El indicador «Conductores notificados · N rutas» duplicaría la banda BDC de despacho: se
  // oculta mientras esa banda está visible (queda como único aviso).
  const dispatchBandVisible = () => {
    const notice = optimizationState.lastDispatch;
    return notice != null && !notice.dismissed && dailyPlan()?.status === 'dispatched';
  };
  const headerNotice = () => (dispatchBandVisible() ? null : notifyIndicator());
  const pointCount = () => dailyPlan()?.finalPointIds.length ?? optimizationState.context?.pointsToVisit ?? 0;
  // Escenario heredado del plan semanal (P1, E): chip en la cabecera en lugar de la
  // tarjeta permanente «Situación del día».
  const scenarioId = () => dailyPlan()?.scenarioId ?? optimizationState.preset.scenarioId;
  const scenarioLabel = () =>
    optimizationState.context?.scenarios.find((scenario) => scenario.id === scenarioId())?.label ??
    scenarioId();

  // Resumen compacto para móvil (P2, G/H): estado + nivel en un chip, con el escenario
  // referido por icono/tooltip para no romper el ancho en pantallas pequeñas.
  const compactSummary = () => {
    const parts: string[] = [];
    const status = statusChip();
    if (status) parts.push(status.label);
    parts.push(levelChip().shortLabel);
    return parts.join(' · ');
  };
  const compactTone = () =>
    statusChip()?.cell ?? `${levelChip().toneClass} ${levelChip().titleClass}`;
  const compactTitle = () => {
    const parts: string[] = [];
    const status = statusChip();
    if (status) parts.push(`Estado: ${status.label}`);
    parts.push(`Nivel: ${levelChip().shortLabel}`);
    if ((optimizationState.context?.scenarios.length ?? 0) > 0) {
      parts.push(`Escenario: ${scenarioLabel()}`);
    }
    return parts.join(' · ');
  };
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
      pointCount: pointCount(),
    });

  const stepChipLabel = () =>
    optimizationActiveStepChipLabel({
      dailyStatus: dailyPlan()?.status,
      hasResults: dayPlanExists(),
      playbackOpen: optimizationState.playbackOpen,
      weeklyPlanApproved: optimizationState.weeklyPlanApproved,
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

  const navigateToDate = (date: string) => {
    // Preserva la pestaña activa (tab) al cambiar de día.
    navigate(optimizationHrefFrom(searchParams, { date }), { replace: true });
    selectOperationDate(date);
  };

  // Navegación temporal por día (P0): `‹ ›` mueven un día. El salto de semana vive
  // solo dentro del calendario del popover para no duplicar semánticas.
  const shiftDayNav = (days: number) => {
    const base = new Date(`${selectedDate()}T00:00:00Z`);
    if (Number.isNaN(base.getTime())) return;
    base.setUTCDate(base.getUTCDate() + days);
    navigateToDate(base.toISOString().slice(0, 10));
  };

  return (
    <>
      <div
        class="flex w-full min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5"
        data-testid="optimization-sticky-toolbar"
      >
        <div class="flex min-w-0 items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            class="px-2"
            aria-label="Día anterior"
            onClick={() => shiftDayNav(-1)}
          >
            <ChevronLeft size={14} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            class="px-2"
            aria-label="Día siguiente"
            onClick={() => shiftDayNav(1)}
          >
            <ChevronRight size={14} />
          </Button>
          <OptimizationWeekCalendarPopover
            selectedDate={selectedDate()}
            summaryLabel={summaryLabel()}
            onDateSelect={navigateToDate}
          />
          <span
            class={`inline-flex max-w-36 shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold sm:hidden ${compactTone()}`}
            title={compactTitle()}
            data-testid="optimization-compact-chip"
          >
            <Show when={(optimizationState.context?.scenarios.length ?? 0) > 0}>
              <CloudRain size={12} class="shrink-0" aria-hidden="true" />
            </Show>
            <span class="truncate">{compactSummary()}</span>
          </span>
          <Show when={statusChip()}>
            {(chip) => (
              <span
                class={`hidden shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold sm:inline-flex ${chip().cell}`}
                data-testid="optimization-status-chip"
              >
                {chip().label}
              </span>
            )}
          </Show>
          <span
            class={`hidden shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold sm:inline-flex ${levelChip().toneClass} ${levelChip().titleClass}`}
            data-testid="optimization-level-chip"
          >
            {levelChip().shortLabel}
          </span>
          <Show when={(optimizationState.context?.scenarios.length ?? 0) > 0}>
            <span
              class="hidden max-w-56 shrink-0 items-center gap-1 rounded-full border border-violet-300/50 bg-violet-50/70 px-2.5 py-1 text-xs font-semibold text-violet-800 dark:border-violet-900/40 dark:bg-violet-950/20 dark:text-violet-200 sm:inline-flex"
              title={`Escenario heredado del plan semanal: ${scenarioLabel()}. Ajustable en «Simular día».`}
              data-testid="optimization-scenario-chip"
            >
              <CloudRain size={12} class="shrink-0" aria-hidden="true" />
              <span class="truncate">{scenarioLabel()}</span>
            </span>
          </Show>
          <Show when={showExperienceGuide()}>
            <button
              type="button"
              class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-fero-blue/30 bg-fero-blue/10 text-fero-blue transition-colors hover:bg-fero-blue/15 lg:hidden"
              aria-label="Experiencia del día"
              data-testid="optimization-experience-icon"
              onClick={() => setStepDrawerOpen(true)}
            >
              <Compass size={16} />
            </button>
          </Show>
        </div>
        <Show when={showExperienceGuide()}>
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
        </Show>
        <div class="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          <Show when={headerNotice()}>
            {(indicator) => (
              <span
                class={`inline-flex min-w-0 max-w-full items-center truncate rounded-full border px-2.5 py-1 text-xs font-semibold ${indicator().toneClass}`}
                role="status"
                data-testid="optimization-notify-indicator"
              >
                {indicator().label}
              </span>
            )}
          </Show>
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
            when={
              !showGenerate() &&
              !isDispatched() &&
              mapDailyStatusToCalendar(dayStatus()) === 'closed'
            }
          >
            <Button
              variant="primary"
              size="sm"
              data-testid="optimization-view-results"
              onClick={() => props.onViewResults?.()}
            >
              Ver resultados
            </Button>
          </Show>
          <Show when={isDispatched() && monitoringLink()}>
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
          <Show when={isDispatched() && props.onCloseDay}>
            <Button
              variant="outline"
              size="sm"
              class="gap-2"
              icon={<Flag size={14} />}
              data-testid="optimization-close-day-action"
              onClick={() => props.onCloseDay?.()}
            >
              Cerrar día
            </Button>
          </Show>
        </div>
      </div>

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
                La semana {selectedWeekRange()} no está aprobada
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
                        navigate(optimizationHrefFrom(searchParams, { date: week().start }), {
                          replace: true,
                        });
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
                    navigate(weeklyPlanWeekHref(mondayOfDate(selectedDate())));
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
            hasResults={dayPlanExists()}
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
