import { Show } from 'solid-js';
import { useLocation } from '@solidjs/router';
import { Menu, Bell, RefreshCw, CalendarDays } from 'lucide-solid';
import { toggleSidebar } from '../../core/stores/appStore';
import { dashboardSummary } from '../../data/mock/dashboard';
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

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

type PageMeta = { title: string; subtitle: string; dateLabel?: string };

const pageMeta: Record<string, PageMeta> = {
  '/': {
    title: dashboardSummary.greeting,
    subtitle: dashboardSummary.subtitle,
  },
  '/optimization': optimizationPageMeta,
  '/vehicles': vehiclesPageMeta,
  '/collection-points': collectionPointsPageMeta,
  '/simulation': simulationPageMeta,
  '/monitoring': monitoringPageMeta,
  '/reports': reportsPageMeta,
  '/analytics': analyticsPageMeta,
  '/alerts': alertsPageMeta,
  '/admin': adminPageMeta,
  '/profile': profilePageMeta,
};

export function Header(props: HeaderProps) {
  const location = useLocation();
  const meta = () => pageMeta[location.pathname];

  const title = () => props.title ?? meta()?.title;
  const subtitle = () => props.subtitle ?? meta()?.subtitle;
  const dateLabel = () => meta()?.dateLabel ?? dashboardSummary.dateLabel;

  return (
    <header class="sticky top-0 z-30 flex h-(--header-height) items-center gap-4 border-b border-border bg-surface/90 px-4 backdrop-blur-md md:px-6 dark:bg-dark-surface/90 dark:border-dark-border">
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
          <h1 class="truncate font-heading text-lg font-bold text-text-primary dark:text-white">
            {title()}
          </h1>
        </Show>
        <Show when={subtitle()}>
          <p class="truncate text-xs text-text-muted">{subtitle()}</p>
        </Show>
      </div>

      <div class="flex items-center gap-2 sm:gap-3">
        <div class="hidden items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-secondary sm:flex dark:bg-dark-surface dark:border-dark-border">
          <CalendarDays size={16} class="text-fero-blue" />
          <span>{dateLabel()}</span>
        </div>

        <button
          type="button"
          class="relative flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          aria-label="Notificaciones"
        >
          <Bell size={18} />
          <Show when={dashboardSummary.notifications > 0}>
            <span class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {dashboardSummary.notifications}
            </span>
          </Show>
        </button>

        <button
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          aria-label="Actualizar"
        >
          <RefreshCw size={18} />
        </button>
      </div>
    </header>
  );
}
