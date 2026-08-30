import { For, Show, createMemo } from 'solid-js';
import { useLocation } from '@solidjs/router';
import {
  History,
  LayoutDashboard,
  Map,
  MapPin,
  Truck,
  Users,
  Trash2,
  Brain,
  Beaker,
  Radio,
  BarChart3,
  FileText,
  AlertTriangle,
  ClipboardList,
  CalendarDays,
} from 'lucide-solid';
import { authUser } from '../../core/stores/authStore';
import { isOperationalSupervisor, sidebarNavLayout } from '../../core/auth/permissions';
import { SidebarHeader } from './sidebar/SidebarHeader';
import { SidebarNavLink } from './sidebar/SidebarNavLink';
import { SidebarCollapsibleGroup } from './sidebar/SidebarCollapsibleGroup';
import { SidebarOperatorsWidget } from './sidebar/SidebarOperatorsWidget';
import { isNavItemActive, navHrefPath } from './sidebar/navUtils';

const NAV_ICONS: Record<string, typeof LayoutDashboard> = {
  '/': LayoutDashboard,
  '/operator': ClipboardList,
  '/optimization': Map,
  '/planning': LayoutDashboard,
  '/planning/weekly': CalendarDays,
  '/planning/history': History,
  '/map': MapPin,
  '/vehicles': Truck,
  '/drivers': Users,
  '/collection-points': Trash2,
  '/simulation': Brain,
  '/demostracion': Beaker,
  '/monitoring': Radio,
  '/reports': FileText,
  '/analytics': BarChart3,
  '/resident': Trash2,
  '/alerts': AlertTriangle,
};

interface SidebarProps {
  open: boolean;
}

export function Sidebar(props: SidebarProps) {
  const location = useLocation();
  const layout = createMemo(() => sidebarNavLayout(authUser()?.role));

  return (
    <aside
      data-testid="app-sidebar"
      aria-label="Navegación principal"
      class={`fixed top-0 left-0 z-40 flex h-full w-[var(--sidebar-width)] flex-col border-r border-sidebar bg-sidebar transition-transform duration-300 ${
        props.open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <SidebarHeader />

      <nav class="sidebar-nav-scroll flex-1 space-y-1 overflow-y-auto px-3 py-3" aria-label="Módulos">
        <For each={layout().primary}>
          {(item) => {
            const Icon = NAV_ICONS[navHrefPath(item.href)] ?? LayoutDashboard;
            const active = () => isNavItemActive(item.href, location.pathname);
            return (
              <SidebarNavLink
                href={item.href}
                active={active()}
                icon={<Icon size={18} class="shrink-0" />}
                label={item.label}
                description={item.description}
              />
            );
          }}
        </For>

        <div class="my-2 border-t border-sidebar-divider" />

        <For each={layout().sections}>
          {(section) => (
            <SidebarCollapsibleGroup
              label={section.label}
              items={section.items}
              iconMap={NAV_ICONS}
            />
          )}
        </For>
      </nav>

      <Show when={isOperationalSupervisor(authUser()?.role)}>
        <div class="border-t border-sidebar-divider p-3">
          <SidebarOperatorsWidget />
        </div>
      </Show>
    </aside>
  );
}
