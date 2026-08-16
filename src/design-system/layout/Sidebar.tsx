import { For, Show, createMemo } from 'solid-js';
import { useLocation } from '@solidjs/router';
import {
  History,
  LayoutDashboard,
  Map,
  MapPin,
  Truck,
  Trash2,
  Brain,
  Beaker,
  Radio,
  BarChart3,
  FileText,
  AlertTriangle,
  ClipboardList,
} from 'lucide-solid';
import { authUser } from '../../core/stores/authStore';
import { navItemsForRole, isOperationalSupervisor, type NavItemDef } from '../../core/auth/permissions';
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
  '/planning/history': History,
  '/map': MapPin,
  '/vehicles': Truck,
  '/collection-points': Trash2,
  '/simulation': Brain,
  '/demostracion': Beaker,
  '/monitoring': Radio,
  '/reports': FileText,
  '/analytics': BarChart3,
  '/resident': Trash2,
  '/alerts': AlertTriangle,
};

const SECTION_GROUPS: Record<string, string[]> = {
  'Análisis': ['/simulation', '/demostracion'],
  'Operación': ['/planning', '/optimization', '/planning/history'],
  'Resultados': ['/reports', '/analytics'],
};

const TOP_LEVEL_HREFS = new Set(['/', '/map', '/alerts', '/operator']);

interface SidebarProps {
  open: boolean;
}

export function Sidebar(props: SidebarProps) {
  const location = useLocation();
  const nav = createMemo(() => navItemsForRole(authUser()?.role));

  const topLevel = createMemo(() =>
    nav().main.filter((item) => TOP_LEVEL_HREFS.has(item.href)),
  );

  const groupedSections = createMemo(() => {
    const items = nav().main;
    return Object.entries(SECTION_GROUPS)
      .map(([label, hrefs]) => ({
        label,
        items: items.filter((item) => hrefs.includes(item.href)),
      }))
      .filter((section) => section.items.length > 0);
  });

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
        <For each={topLevel()}>
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

        <For each={groupedSections()}>
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
