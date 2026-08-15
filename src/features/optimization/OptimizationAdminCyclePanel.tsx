import { ChevronDown } from 'lucide-solid';
import { DailyPlanTimeline } from './DailyPlanTimeline';

export function OptimizationAdminCyclePanel() {
  return (
    <details
      class="group rounded-xl border border-default bg-elevated/50"
      data-testid="optimization-admin-cycle-panel"
    >
      <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-text-primary">Ciclo administrativo</p>
          <p class="mt-0.5 text-xs text-text-muted">Borrador → optimizado → despachado → cerrado</p>
        </div>
        <ChevronDown
          size={18}
          class="shrink-0 text-text-muted transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div class="border-t border-default px-4 py-3">
        <DailyPlanTimeline />
      </div>
    </details>
  );
}
