import { Show, createResource } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { Menu, Bell, RefreshCw, CalendarDays } from 'lucide-solid';
import { useLocale } from '../../core/i18n/solid';
import { toggleSidebar } from '../../core/stores/appStore';
import { dashboardSummary, loadDashboardData } from '../../core/stores/dashboardStore';
import { canOptimize, isConductor, isResident, isOperationalSupervisor, CALIBRATION_ROUTE } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { fetchPlanningDashboardSnapshot } from '../../core/api/planningAnalytics';
import { fetchRecentDriverNotifications } from '../../core/api/notifications';
import { fetchResidentOverview } from '../../core/api/resident';
import { residentAlertsPreview } from '../../core/resident/residentAlertsUx';
import { residentAlertsHref } from '../../core/resident/residentDeepLinks';
import {
  plannerHomeDateChipLabel,
  plannerHomeHeaderSubtitle,
} from '../../core/planning/plannerHomeHeaderUx';
import { optimizationPageMeta } from '../../data/mock/optimization';
import { vehiclesPageMeta } from '../../data/mock/vehicles';
import { collectionPointsPageMeta } from '../../data/mock/collectionPoints';
import { demostracionPageMeta } from '../../data/mock/demostracion';
import { simulationPageMeta } from '../../data/mock/simulationScenarios';
import { monitoringPageMeta } from '../../data/mock/monitoring';
import { reportsPageMeta } from '../../data/mock/reports';
import { analyticsPageMeta } from '../../data/mock/analytics';
import { alertsPageMeta } from '../../data/mock/alerts';
import { adminPageMeta } from '../../data/mock/admin';
import { settingsPageMeta } from '../../data/mock/settings';
import { profilePageMeta } from '../../data/mock/profile';
import { UserMenu } from './UserMenu';
import { useHeaderChrome } from './pageChromeSlots';

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
  '/demostracion': demostracionPageMeta,
  '/monitoring': monitoringPageMeta,
  '/reports': reportsPageMeta,
  '/analytics': analyticsPageMeta,
  '/resident': {
    title: 'Mi Recolección',
    subtitle: 'Consulta el horario y estado de recolección en tu sector.',
  },
  '/alerts': alertsPageMeta,
  '/admin': adminPageMeta,
  '/settings': settingsPageMeta,
  '/planning/history': {
    title: 'Historial unificado',
    subtitle: 'Busca por semana, día o incidencia en un solo lugar.',
  },
  [CALIBRATION_ROUTE]: {
    title: 'Calibración del motor',
    subtitle: 'Barridos de sensibilidad y pesos del objetivo.',
  },
  '/profile': profilePageMeta,
};

export function Header(props: HeaderProps) {
  const location = useLocation();
  const tr = useLocale();
  const chrome = useHeaderChrome();
  const meta = () => pageMeta[location.pathname];
  const isOptimization = () => location.pathname === '/optimization';
  const isPlannerHome = () => location.pathname === '/' && canOptimize(authUser()?.role);

  const [planningSnapshot] = createResource(
    () => (isPlannerHome() ? 'planner-home-header' : null),
    () => fetchPlanningDashboardSnapshot(),
  );

  // Badge del conductor = notificaciones sin acusar (no críticos de flota).
  const [driverNotifs] = createResource(
    () => (isConductor(authUser()?.role) ? 'driver-unacked' : null),
    async () => {
      try {
        const rows = await fetchRecentDriverNotifications(50);
        return rows.filter((n) => !n.ackAt).length;
      } catch {
        return 0;
      }
    },
  );

  // Badge del residente = avisos del sector (no totales ciudadanos).
  const [residentAlertCount] = createResource(
    () => (isResident(authUser()?.role) ? 'resident-sector-alerts' : null),
    async () => {
      try {
        const overview = await fetchResidentOverview({ force: true });
        return residentAlertsPreview(overview, [], 99).length;
      } catch {
        return 0;
      }
    },
  );

  const notifCount = () => {
    if (isConductor(authUser()?.role)) return driverNotifs() ?? 0;
    if (isResident(authUser()?.role)) return residentAlertCount() ?? 0;
    return dashboardSummary().notifications;
  };
  const notifHref = () => {
    if (isConductor(authUser()?.role)) return '/operator/notifications';
    if (isResident(authUser()?.role)) return residentAlertsHref();
    // Planificador/admin: la campana enlaza a la vista de alertas. Es un deep link;
    // el módulo no está en el menú lateral a propósito (docs/ux/arquitectura-navegacion.md §3).
    if (isOperationalSupervisor(authUser()?.role)) return '/alerts';
    return null;
  };

  const handleRefresh = () => {
    void loadDashboardData();
    if (isResident(authUser()?.role)) {
      window.dispatchEvent(new CustomEvent('feromap:resident-refresh'));
    }
  };

  const title = () => {
    if (props.title) return props.title;
    if (location.pathname === '/') return dashboardSummary().greeting;
    return meta()?.title;
  };
  const subtitle = () => {
    if (props.subtitle) return props.subtitle;
    if (isPlannerHome()) {
      return plannerHomeHeaderSubtitle(planningSnapshot());
    }
    if (location.pathname === '/') {
      if (isConductor(authUser()?.role)) return tr('shell.subtitle.operator');
      if (isResident(authUser()?.role)) return tr('shell.subtitle.resident');
      return dashboardSummary().subtitle;
    }
    return meta()?.subtitle;
  };
  const dateLabel = () => {
    if (isPlannerHome()) {
      return plannerHomeDateChipLabel(planningSnapshot());
    }
    return meta()?.dateLabel ?? dashboardSummary().dateLabel;
  };

  return (
    <header class="sticky top-0 z-30 flex shrink-0 flex-col border-b border-default bg-elevated/90 backdrop-blur-md dark:bg-app/95 dark:backdrop-blur-sm">
      <div class="flex h-(--header-height) items-center gap-4 px-4 md:px-6">
        <button
          type="button"
          onClick={toggleSidebar}
          class="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          aria-label={tr('shell.toggleMenu')}
        >
          <Menu size={20} />
        </button>

        <div class="min-w-0 flex-1">
          <Show when={title()}>
            <h1 id="page-title" class="truncate font-heading text-lg font-bold text-text-primary">
              {title()}
            </h1>
          </Show>
          <Show when={subtitle()}>
            <p class="truncate text-xs text-text-muted">{subtitle()}</p>
          </Show>
        </div>

        <Show when={chrome?.actions()}>
          <div class="flex shrink-0 items-center gap-1.5">{chrome?.actions()}</div>
        </Show>

        <div class="flex items-center gap-2 sm:gap-3">
          <Show when={!isOptimization()}>
            <div class="hidden items-center gap-2 rounded-md border border-default bg-elevated px-3 py-1.5 text-sm text-text-secondary sm:flex dark:bg-sidebar-elevated">
              <CalendarDays size={16} class="text-fero-blue" />
              <span>{dateLabel()}</span>
            </div>
          </Show>

          <Show when={notifHref()}>
            {(href) => (
              <A
                href={href()}
                class="relative flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                aria-label={tr('shell.notifications')}
                data-testid="header-notifications"
              >
                <Bell size={18} />
                <Show when={notifCount() > 0}>
                  <span class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {notifCount()}
                  </span>
                </Show>
              </A>
            )}
          </Show>

          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label={tr('shell.refresh')}
            onClick={handleRefresh}
          >
            <RefreshCw size={18} />
          </button>

          <UserMenu />
        </div>
      </div>
      <Show when={chrome?.subheader()}>
        <div class="flex items-center border-t border-default px-4 py-2 md:px-6">
          {chrome?.subheader()}
        </div>
      </Show>
    </header>
  );
}
