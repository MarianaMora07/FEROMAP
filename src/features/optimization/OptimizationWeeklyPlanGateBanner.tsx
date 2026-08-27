import { Show } from 'solid-js';
import { A } from '@solidjs/router';
import { AlertTriangle } from 'lucide-solid';
import { Button } from '../../design-system/components';
import { optimizationState } from '../../core/stores/optimizationStore';

export function OptimizationWeeklyPlanGateBanner() {
  return (
    <Show when={!optimizationState.weeklyPlanApproved && !optimizationState.isLoadingContext}>
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30"
        role="alert"
        data-testid="optimization-weekly-plan-gate"
      >
        <div class="flex min-w-0 items-start gap-2 text-sm text-amber-950 dark:text-amber-100">
          <AlertTriangle size={18} class="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p class="font-semibold">Plan semanal sin aprobar</p>
            <p class="mt-0.5 text-xs text-amber-900/90 dark:text-amber-100/90">
              Aprueba el plan semanal antes de generar rutas, simular recorridos o despachar operación.
            </p>
          </div>
        </div>
        <A href="/planning/weekly">
          <Button variant="primary" size="sm" data-testid="optimization-weekly-plan-cta">
            Ir al plan semanal
          </Button>
        </A>
      </div>
    </Show>
  );
}
