import { Match, Show, Switch } from 'solid-js';
import { A } from '@solidjs/router';
import { AlertTriangle, CheckCircle2, X } from 'lucide-solid';
import { Button } from '../../design-system/components';
import { PlanningContextualCta } from '../planning/PlanningContextualCta';
import { monitoringHref } from '../../core/planning/operationalLinks';
import { mondayOfDate } from '../../core/planning/dailyPlanningUx';
import { formatWeekRangeLabel } from '../../core/planning/weekLabels';
import { optimizationDateHref, tomorrowIso } from '../../core/planning/planningUx';
import { weeklyPlanWeekHref } from '../../core/planning/weeklyPlanLinks';
import { dismissDispatchNotice, optimizationState } from '../../core/stores/optimizationStore';
import {
  resolveOptimizationContextBand,
  resolveOptimizationContextualMessage,
} from './optimizationLayoutUx';

/**
 * Banda de estado contextual (BDC, Fase E). Antes eran tres avisos dispersos
 * (`OptimizationDispatchBanner`, la CTA de cierre y la alerta de error) más el recordatorio
 * de aprobación dentro de «Situación del día»; ahora es **una sola** banda que cambia según
 * el estado, con prioridad error > semana sin aprobar > despacho > cierre. (El archivo
 * conserva su nombre histórico para no romper importaciones.)
 */
export function OptimizationContextBand(props: { closeNotice: string | null }) {
  const dailyPlan = () => optimizationState.dailyPlan;

  // Aviso de despacho: solo mientras el día sigue despachado y el usuario no lo descartó.
  const dispatchNotice = () => {
    const current = optimizationState.lastDispatch;
    if (!current || current.dismissed) return null;
    if (dailyPlan()?.status !== 'dispatched') return null;
    return current;
  };

  const weeklyHref = () =>
    weeklyPlanWeekHref(mondayOfDate(dailyPlan()?.operationDate ?? optimizationState.preset.operationDate));

  // Semana del día en foco, para que el aviso diga exactamente qué semana falta aprobar.
  const weekRange = () =>
    formatWeekRangeLabel(
      mondayOfDate(dailyPlan()?.operationDate ?? optimizationState.preset.operationDate),
    );

  const kind = () =>
    resolveOptimizationContextBand({
      error: optimizationState.error,
      weeklyPlanApproved: optimizationState.weeklyPlanApproved,
      dispatchVisible: dispatchNotice() != null,
      closeNotice: props.closeNotice,
    });

  const closeMessage = () =>
    resolveOptimizationContextualMessage({
      closeNotice: props.closeNotice,
      closeNoticeHref: props.closeNotice ? optimizationDateHref(tomorrowIso()) : null,
    });

  return (
    <Show when={kind()}>
      {(active) => (
        <Switch>
          <Match when={active() === 'error'}>
            <div
              role="alert"
              class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200"
              data-testid="optimization-context-error"
            >
              {optimizationState.error}
            </div>
          </Match>

          <Match when={active() === 'week-pending'}>
            <div
              class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/30"
              role="status"
              data-testid="optimization-week-pending-band"
            >
              <p class="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
                <AlertTriangle size={16} class="shrink-0" aria-hidden="true" />
                La semana {weekRange()} no tiene plan semanal aprobado: el despacho del día está
                bloqueado hasta aprobarla (la aprobación es directiva).
              </p>
              <A href={weeklyHref()} class="shrink-0">
                <Button variant="outline" size="sm" data-testid="optimization-band-review-week">
                  Ir al Plan semanal
                </Button>
              </A>
            </div>
          </Match>

          <Match when={active() === 'dispatched'}>
            <Show when={dispatchNotice()}>
              {(notice) => (
                <div
                  class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-fero-green/30 bg-fero-green/10 px-4 py-3"
                  role="status"
                  data-testid="optimization-dispatch-banner"
                >
                  <div class="flex min-w-0 items-start gap-2 text-sm text-text-primary">
                    <CheckCircle2 size={18} class="mt-0.5 shrink-0 text-fero-green-dark" aria-hidden="true" />
                    <div>
                      <p class="font-semibold">
                        {notice().count} ruta{notice().count === 1 ? '' : 's'} notificada
                        {notice().count === 1 ? '' : 's'} a conductores
                        <Show when={notice().vehicleCodes.length > 0}>
                          {' '}
                          · camiones {notice().vehicleCodes.join(', ')}
                        </Show>
                      </p>
                      <p class="text-xs text-text-secondary">
                        El despacho es automático: cada conductor ya puede consultar su recorrido
                        asignado. Sigue el avance desde Monitoreo.
                      </p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <A
                      href={monitoringHref({
                        date: dailyPlan()?.operationDate,
                        dailyPlanId: dailyPlan()?.id,
                      })}
                    >
                      <Button variant="primary" size="sm" data-testid="optimization-dispatch-monitoring-link">
                        Ir a monitoreo
                      </Button>
                    </A>
                    <button
                      type="button"
                      class="rounded-md p-1 text-text-muted hover:bg-elevated hover:text-text-primary"
                      aria-label="Cerrar aviso de despacho"
                      onClick={() => dismissDispatchNotice()}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              )}
            </Show>
          </Match>

          <Match when={active() === 'closed'}>
            <Show when={closeMessage()}>
              {(message) => (
                <div data-testid="optimization-contextual-cta" role="status" aria-live="polite">
                  <PlanningContextualCta
                    message={message().message}
                    href={message().href}
                    linkLabel={message().linkLabel}
                    tone={message().tone}
                  />
                </div>
              )}
            </Show>
          </Match>
        </Switch>
      )}
    </Show>
  );
}
