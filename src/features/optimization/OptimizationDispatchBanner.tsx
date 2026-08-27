import { Show } from 'solid-js';
import { A } from '@solidjs/router';
import { CheckCircle2, X } from 'lucide-solid';
import { Button } from '../../design-system/components';
import { monitoringHref } from '../../core/planning/operationalLinks';
import { dismissDispatchNotice, optimizationState } from '../../core/stores/optimizationStore';

export function OptimizationDispatchBanner() {
  const notice = () => {
    const current = optimizationState.lastDispatch;
    if (!current || current.dismissed) return null;
    if (optimizationState.dailyPlan?.status !== 'dispatched') return null;
    return current;
  };
  const dailyPlan = () => optimizationState.dailyPlan;

  return (
    <Show when={notice()}>
      {(active) => (
        <div
          class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-fero-green/30 bg-fero-green/10 px-4 py-3"
          role="status"
          data-testid="optimization-dispatch-banner"
        >
          <div class="flex min-w-0 items-start gap-2 text-sm text-text-primary">
            <CheckCircle2 size={18} class="mt-0.5 shrink-0 text-fero-green-dark" aria-hidden="true" />
            <div>
              <p class="font-semibold">
                {active().count} ruta{active().count === 1 ? '' : 's'} despachada
                {active().count === 1 ? '' : 's'}
                <Show when={active().vehicleCodes.length > 0}>
                  {' '}
                  · vehículos {active().vehicleCodes.join(', ')}
                </Show>
              </p>
              <p class="text-xs text-text-secondary">
                Las rutas ya están disponibles para monitoreo en campo.
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
  );
}
