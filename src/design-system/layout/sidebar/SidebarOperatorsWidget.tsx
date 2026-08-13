import { Truck } from 'lucide-solid';
import { dashboardSummary } from '../../../core/stores/dashboardStore';

export function SidebarOperatorsWidget() {
  return (
    <div class="flex items-center gap-3 rounded-md border border-sidebar-divider bg-sidebar-elevated px-3 py-2.5">
      <div class="flex h-9 w-9 items-center justify-center rounded-md bg-fero-blue/30 text-white">
        <Truck size={16} />
      </div>
      <div class="min-w-0">
        <p class="text-[11px] text-nav-muted">Operadores conectados</p>
        <p class="text-sm font-semibold text-white dark:text-nav">
          {dashboardSummary().operatorsOnline}{' '}
          <span class="text-fero-green">En línea</span>
        </p>
      </div>
    </div>
  );
}
