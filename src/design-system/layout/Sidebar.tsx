import { For, Show, createEffect, createMemo } from 'solid-js';
import { useLocation } from '@solidjs/router';
import {
  History,
  Layers,
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
  Settings,
} from 'lucide-solid';
import { authUser } from '../../core/stores/authStore';
import { sidebarNavLayout, SIDEBAR_SECTION_LABEL_KEYS } from '../../core/auth/permissions';
import { useLocale } from '../../core/i18n/solid';
import { SidebarHeader } from './sidebar/SidebarHeader';
import { SidebarNavLink } from './sidebar/SidebarNavLink';
import { SidebarCollapsibleGroup } from './sidebar/SidebarCollapsibleGroup';
import { isNavItemActive, navHrefPath } from './sidebar/navUtils';

const NAV_ICONS: Record<string, typeof LayoutDashboard> = {
  '/': LayoutDashboard,
  '/operator': ClipboardList,
  '/optimization': Map,
  '/planning/weekly': CalendarDays,
  '/planning/history': History,
  '/map': MapPin,
  '/vehicles': Truck,
  '/drivers': Users,
  '/collection-points': Trash2,
  '/simulation': Brain,
  '/case-studies': Layers,
  '/demostracion': Beaker,
  '/monitoring': Radio,
  '/reports': FileText,
  '/analytics': BarChart3,
  '/resident': Trash2,
  '/alerts': AlertTriangle,
  '/settings': Settings,
};

interface SidebarProps {
  open: boolean;
}

export function Sidebar(props: SidebarProps) {
  const location = useLocation();
  const tr = useLocale();
  const layout = createMemo(() => {
    tr(''); // dependencia reactiva: recalcula al cambiar el idioma
    return sidebarNavLayout(authUser()?.role);
  });
  const showKinds = () => authUser()?.role === 'administrador';

  let asideRef: HTMLElement | undefined;
  // Sidebar cerrado (off-canvas): sale del orden de tabulación y del árbol de
  // accesibilidad. Ver docs/design-system/contratos-ui.md §2.
  createEffect(() => {
    asideRef?.toggleAttribute('inert', !props.open);
  });

  const navLabel = (item: { label: string; labelKey?: string }) =>
    tr(item.labelKey ?? '', item.label);
  const navDescription = (item: { description?: string; descriptionKey?: string }) =>
    item.description ? tr(item.descriptionKey ?? '', item.description) : undefined;

  return (
    <aside
      ref={asideRef}
      data-testid="app-sidebar"
      aria-label={tr('ui.mainNav')}
      class={`fixed top-0 left-0 z-40 flex h-full w-[var(--sidebar-width)] flex-col border-r border-sidebar bg-sidebar transition-transform duration-300 ${
        props.open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <SidebarHeader />

      <nav class="sidebar-nav-scroll flex-1 space-y-1 overflow-y-auto px-3 py-3" aria-label={tr('ui.modulesNav')}>
        <For each={layout().primary}>
          {(item) => {
            const Icon = NAV_ICONS[navHrefPath(item.href)] ?? LayoutDashboard;
            const active = () => isNavItemActive(item.href, location.pathname);
            return (
              <SidebarNavLink
                href={item.href}
                active={active()}
                icon={<Icon size={18} class="shrink-0" />}
                label={navLabel(item)}
                description={navDescription(item)}
                kind={showKinds() ? (item.kind ?? 'producto') : undefined}
              />
            );
          }}
        </For>

        <div class="my-2 border-t border-sidebar-divider" />

        <For each={layout().sections}>
          {(section) => (
            <SidebarCollapsibleGroup
              label={tr(SIDEBAR_SECTION_LABEL_KEYS[section.label] ?? '', section.label)}
              items={section.items}
              iconMap={NAV_ICONS}
              showKinds={showKinds()}
            />
          )}
        </For>
      </nav>
    </aside>
  );
}
