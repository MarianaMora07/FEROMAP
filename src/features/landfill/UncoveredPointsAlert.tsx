import { Show } from 'solid-js';
import { AlertTriangle } from 'lucide-solid';
import type { KpiMetrics } from '../../data/types/simulation';
import { uncoveredAlertMessage } from '../../core/utils/landfillUx';

interface UncoveredPointsAlertProps {
  kpis: KpiMetrics;
}

export function UncoveredPointsAlert(props: UncoveredPointsAlertProps) {
  const message = () => uncoveredAlertMessage(props.kpis);
  const codes = () => props.kpis.uncoveredPointCodes ?? [];

  return (
    <Show when={message()}>
      <div
        class="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
        data-testid="uncovered-points-alert"
        role="alert"
      >
        <AlertTriangle size={18} class="mt-0.5 shrink-0" />
        <div>
          <p class="font-semibold">{message()}</p>
          <Show when={codes().length > 0}>
            <p class="mt-1 text-xs opacity-90">{codes().join(', ')}</p>
          </Show>
        </div>
      </div>
    </Show>
  );
}
