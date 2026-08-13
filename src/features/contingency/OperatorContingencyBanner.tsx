import { Show } from 'solid-js';
import { CheckCircle2, X } from 'lucide-solid';
import {
  clearOperatorContingencyReport,
  operatorContingencyState,
  operatorContingencySuccessMessage,
} from '../../core/stores/contingencyStore';

export function OperatorContingencyBanner() {
  const report = () => operatorContingencyState.lastReport;

  return (
    <Show when={report()}>
      {(result) => (
        <div
          class="rounded-xl border border-fero-green/40 bg-fero-green/10 px-4 py-3"
          role="status"
          aria-live="polite"
          data-testid="operator-contingency-success"
        >
          <div class="flex items-start gap-3">
            <CheckCircle2 size={20} class="mt-0.5 shrink-0 text-fero-green-dark" aria-hidden="true" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-fero-green-dark">
                {operatorContingencySuccessMessage(result())}
              </p>
              <p class="mt-1 text-xs text-text-secondary">
                Tu reporte quedó registrado. Planificación revisará los puntos pendientes de tu ruta.
              </p>
            </div>
            <button
              type="button"
              class="shrink-0 rounded-md p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary"
              aria-label="Cerrar mensaje de confirmación"
              onClick={() => clearOperatorContingencyReport()}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </Show>
  );
}
