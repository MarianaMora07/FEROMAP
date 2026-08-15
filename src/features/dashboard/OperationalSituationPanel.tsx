import { createMemo } from 'solid-js';
import { A } from '@solidjs/router';
import { AlertTriangle, ArrowRight, ChevronDown, Truck } from 'lucide-solid';
import { KpiCard } from '../../design-system/components';
import { dashboardView } from '../../core/stores/dashboardStore';
import {
  activeRoutes as mockActiveRoutes,
  dashboardKpis as mockDashboardKpis,
} from '../../data/mock/dashboard';

export function OperationalSituationPanel() {
  const kpis = () => dashboardView()?.kpis ?? mockDashboardKpis;
  const activeRoutes = () => dashboardView()?.activeRoutes ?? mockActiveRoutes;
  const routesInProgress = () => activeRoutes().length;
  const alertCount = () => kpis().alerts.count;

  const summaryHint = createMemo(
    () => `${routesInProgress()} ruta${routesInProgress() === 1 ? '' : 's'} en curso · ${alertCount()} alerta${alertCount() === 1 ? '' : 's'}`,
  );

  return (
    <details
      class="group rounded-xl border border-default bg-elevated shadow-xs"
      data-testid="operational-situation-panel"
    >
      <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-text-primary">Situación operativa</p>
          <p class="mt-0.5 truncate text-xs text-text-muted">{summaryHint()}</p>
        </div>
        <ChevronDown
          size={18}
          class="shrink-0 text-text-muted transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div class="space-y-3 border-t border-default px-4 py-3" data-testid="operational-situation-content">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <KpiCard
            title="Alertas activas"
            value={alertCount()}
            unit="alertas"
            icon={<AlertTriangle size={22} />}
            iconTone="purple"
          />
          <KpiCard
            title="Rutas en curso"
            value={routesInProgress()}
            unit="rutas"
            icon={<Truck size={22} />}
            iconTone="blue"
          />
        </div>
        <A
          href="/monitoring"
          class="inline-flex items-center gap-1 text-sm font-medium text-fero-blue hover:underline"
          data-testid="operational-situation-monitoring-link"
        >
          Ver monitoreo completo
          <ArrowRight size={14} />
        </A>
      </div>
    </details>
  );
}
