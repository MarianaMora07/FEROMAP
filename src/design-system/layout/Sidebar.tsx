import { For, Show, createMemo } from 'solid-js';
import { useLocation, useNavigate } from '@solidjs/router';
import {
  History,
  LayoutDashboard,
  Map,
  MapPin,
  Truck,
  Trash2,
  Brain,
  Radio,
  BarChart3,
  FileText,
  AlertTriangle,
  Settings,
  User,
  Moon,
  Sun,
  LogOut,
  ClipboardList,
} from 'lucide-solid';
import { appState, toggleDarkMode } from '../../core/stores/appStore';
import { authUser, logout } from '../../core/stores/authStore';
import { navItemsForRole, isOperationalSupervisor } from '../../core/auth/permissions';
import { SidebarHeader } from './sidebar/SidebarHeader';
import { SidebarNavLink } from './sidebar/SidebarNavLink';
import { SidebarSectionLabel } from './sidebar/SidebarSectionLabel';
import { SidebarOperatorsWidget } from './sidebar/SidebarOperatorsWidget';
import { SidebarUserRow } from './sidebar/SidebarUserRow';
import { isNavItemActive, navHrefPath, sidebarActionButtonClass } from './sidebar/navUtils';

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
  '/monitoring': Radio,
  '/reports': FileText,
  '/analytics': BarChart3,
  '/resident': Trash2,
  '/alerts': AlertTriangle,
  '/admin': Settings,
  '/profile': User,
};

interface SidebarProps {
  open: boolean;
}

export function Sidebar(props: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const nav = createMemo(() => navItemsForRole(authUser()?.role));

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

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
        <For each={nav().main}>
          {(item) => {
            const Icon = NAV_ICONS[navHrefPath(item.href)] ?? LayoutDashboard;
            const active = () => isNavItemActive(item.href, location.pathname);

            return (
              <>
                <Show when={item.sectionBefore}>
                  <SidebarSectionLabel>{item.sectionBefore!}</SidebarSectionLabel>
                </Show>
                <Show when={item.href === '/alerts' && !item.sectionBefore}>
                  <div class="my-3 border-t border-sidebar-divider" />
                </Show>
                <SidebarNavLink
                  href={item.href}
                  active={active()}
                  icon={<Icon size={18} class="shrink-0" />}
                  label={item.label}
                  description={item.description}
                />
              </>
            );
          }}
        </For>
      </nav>

      <div class="space-y-3 border-t border-sidebar-divider p-3">
        <Show when={isOperationalSupervisor(authUser()?.role)}>
          <SidebarOperatorsWidget />
        </Show>

        <For each={nav().bottom}>
          {(item) => {
            const Icon = NAV_ICONS[item.href] ?? User;
            return (
              <SidebarNavLink
                href={item.href}
                active={isNavItemActive(item.href, location.pathname)}
                icon={<Icon size={18} />}
                label={item.label}
              />
            );
          }}
        </For>

        <button
          type="button"
          onClick={() => void toggleDarkMode()}
          class={sidebarActionButtonClass}
          aria-label={appState.darkMode ? 'Activar modo claro' : 'Activar modo oscuro'}
          data-testid="sidebar-theme-toggle"
        >
          {appState.darkMode ? <Sun size={18} /> : <Moon size={18} />}
          {appState.darkMode ? 'Modo claro' : 'Modo oscuro'}
        </button>

        <button type="button" onClick={() => void handleLogout()} class={sidebarActionButtonClass}>
          <LogOut size={18} />
          Cerrar sesión
        </button>

        <SidebarUserRow />
      </div>
    </aside>
  );
}
