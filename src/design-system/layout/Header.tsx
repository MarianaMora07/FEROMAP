import { Show } from 'solid-js';
import { useLocation } from '@solidjs/router';
import { Menu, Bell, RefreshCw, CalendarDays } from 'lucide-solid';
import { toggleSidebar } from '../../core/stores/appStore';
import { dashboardSummary, loadDashboardData } from '../../core/stores/dashboardStore';
import { optimizationPageMeta } from '../../data/mock/optimization';
import { vehiclesPageMeta } from '../../data/mock/vehicles';
import { collectionPointsPageMeta } from '../../data/mock/collectionPoints';
import { simulationPageMeta } from '../../data/mock/simulationScenarios';
import { monitoringPageMeta } from '../../data/mock/monitoring';
import { reportsPageMeta } from '../../data/mock/reports';
import { analyticsPageMeta } from '../../data/mock/analytics';
import { alertsPageMeta } from '../../data/mock/alerts';
import { adminPageMeta } from '../../data/mock/admin';
import { profilePageMeta } from '../../data/mock/profile';
import { UserMenu } from './UserMenu';

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

type PageMeta = { title: string; subtitle: string; dateLabel?: string };

const pageMeta: Record<string, PageMeta> = {
  '/optimization': optimizationPageMeta,
  '/vehicles': vehiclesPageMeta,
  '/collection-points': collectionPointsPageMeta,
  '/simulation': simulationPageMeta,
  '/monitoring': monitoringPageMeta,
  '/reports': reportsPageMeta,
  '/analytics': analyticsPageMeta,
  '/resident': {
    title: 'Mi Recolección',
    subtitle: 'Consulta el horario y estado de recolección en tu sector.',
  },
  '/alerts': alertsPageMeta,
  '/admin': adminPageMeta,
  '/profile': profilePageMeta,
};

export function Header(props: HeaderProps) {
  const location = useLocation();
  const meta = () => pageMeta[location.pathname];

  const title = () => {
    if (props.title) return props.title;
    if (location.pathname === '/') return dashboardSummary().greeting;
    return meta()?.title;
  };
  const subtitle = () => {
    if (props.subtitle) return props.subtitle;
    if (location.pathname === '/') return dashboardSummary().subtitle;
    return meta()?.subtitle;
  };
  const dateLabel = () => meta()?.dateLabel ?? dashboardSummary().dateLabel;

  return (
    <header class="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center gap-4 border-b border-default bg-elevated/90 px-4 backdrop-blur-md md:px-6 dark:bg-app/95 dark:backdrop-blur-sm">
      <button
        type="button"
        onClick={toggleSidebar}
        class="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        aria-label="Alternar menú"
      >
        <Menu size={20} />
      </button>

      <div class="min-w-0 flex-1">
        <Show when={title()}>
          <h1 class="truncate font-heading text-lg font-bold text-text-primary">
            {title()}
          </h1>
        </Show>
        <Show when={subtitle()}>
          <p class="truncate text-xs text-text-muted">{subtitle()}</p>
        </Show>
      </div>

      <div class="flex items-center gap-2 sm:gap-3">
        <div class="hidden items-center gap-2 rounded-md border border-default bg-elevated px-3 py-1.5 text-sm text-text-secondary sm:flex dark:bg-sidebar-elevated">
          <CalendarDays size={16} class="text-fero-blue" />
          <span>{dateLabel()}</span>
        </div>

        <button
          type="button"
          class="relative flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          aria-label="Notificaciones"
        >
          <Bell size={18} />
          <Show when={dashboardSummary().notifications > 0}>
            <span class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {dashboardSummary().notifications}
            </span>
          </Show>
        </button>

        <button
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          aria-label="Actualizar"
          onClick={() => void loadDashboardData()}
        >
          <RefreshCw size={18} />
        </button>

        <UserMenu />
      </div>
    </header>
  );
}
