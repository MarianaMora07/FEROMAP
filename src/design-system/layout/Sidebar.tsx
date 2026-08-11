import { For, Show, createMemo } from 'solid-js';
import { A, useLocation, useNavigate } from '@solidjs/router';
import {
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
  ChevronDown,
  LogOut,
} from 'lucide-solid';
import { appState, toggleDarkMode } from '../../core/stores/appStore';
import { dashboardSummary } from '../../core/stores/dashboardStore';
import {
  authUser,
  logout,
  userDisplayName,
  userInitials,
  userRoleLabel,
} from '../../core/stores/authStore';
import { navItemsForRole } from '../../core/auth/permissions';

const NAV_ICONS: Record<string, typeof LayoutDashboard> = {
  '/': LayoutDashboard,
  '/optimization': Map,
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

function navClass(active: boolean) {
  return `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
    active
      ? 'bg-fero-green-dark text-white shadow-sm'
      : 'text-white/65 hover:bg-white/10 hover:text-white'
  }`;
}

function navLabelClass(active: boolean) {
  return active ? 'text-white' : 'text-white/65 group-hover:text-white';
}

function navDescriptionClass(active: boolean) {
  return active ? 'text-white/75' : 'text-white/40 group-hover:text-white/55';
}

interface SidebarProps {
  open: boolean;
}

export function Sidebar(props: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = (href: string) => location.pathname === href;

  const nav = createMemo(() => navItemsForRole(authUser()?.role));

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside
      class={`fixed top-0 left-0 z-40 flex h-full flex-col bg-sidebar transition-all duration-300 ${
        props.open ? 'w-[var(--sidebar-width)] translate-x-0' : '-translate-x-full'
      }`}
    >
      <div class="flex items-start gap-3 border-b border-white/10 px-4 py-4">
        <img src="/feromap-logo.png" alt="FEROMAP" class="h-16 w-16 shrink-0 object-contain" />
        <div class="min-w-0 pt-0.5">
          <p class="font-heading text-xl font-extrabold tracking-tight leading-none">
            <span class="text-white">FERO</span>
            <span class="text-fero-green">MAP</span>
          </p>
          <p class="mt-1.5 text-[10px] leading-snug text-white/55">
            Sistema inteligente de recolección de desechos sólidos
          </p>
        </div>
      </div>

      <nav class="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        <For each={nav().main}>
          {(item) => {
            const Icon = NAV_ICONS[item.href] ?? LayoutDashboard;
            const active = () => isActive(item.href);
            return (
              <>
                <Show when={item.sectionBefore}>
                  <p class="mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-wider text-white/35 first:mt-0">
                    {item.sectionBefore}
                  </p>
                </Show>
                <Show when={item.href === '/alerts' && !item.sectionBefore}>
                  <div class="my-3 border-t border-white/10" />
                </Show>
                <A href={item.href} class={`group ${navClass(active())}`}>
                  <Icon size={18} class="shrink-0" />
                  <span class="min-w-0">
                    <span class={`block truncate ${navLabelClass(active())}`}>{item.label}</span>
                    <Show when={item.description}>
                      <span class={`block truncate text-[10px] font-normal leading-tight ${navDescriptionClass(active())}`}>
                        {item.description}
                      </span>
                    </Show>
                  </span>
                </A>
              </>
            );
          }}
        </For>
      </nav>

      <div class="space-y-3 border-t border-white/10 p-3">
        <div class="flex items-center gap-3 rounded-md bg-white/10 px-3 py-2.5">
          <div class="flex h-9 w-9 items-center justify-center rounded-md bg-fero-blue/30 text-white">
            <Truck size={16} />
          </div>
          <div class="min-w-0">
            <p class="text-[11px] text-white/55">Operadores conectados</p>
            <p class="text-sm font-semibold text-white">
              {dashboardSummary().operatorsOnline}{' '}
              <span class="text-fero-green">En línea</span>
            </p>
          </div>
        </div>

        <For each={nav().bottom}>
          {(item) => {
            const Icon = NAV_ICONS[item.href] ?? User;
            return (
              <A href={item.href} class={navClass(isActive(item.href))}>
                <Icon size={18} />
                {item.label}
              </A>
            );
          }}
        </For>

        <button
          type="button"
          onClick={toggleDarkMode}
          class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-white/65 transition-all duration-200 hover:bg-white/10 hover:text-white"
        >
          {appState.darkMode ? <Sun size={18} /> : <Moon size={18} />}
          {appState.darkMode ? 'Modo claro' : 'Modo oscuro'}
        </button>

        <button
          type="button"
          onClick={() => void handleLogout()}
          class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-white/65 transition-all duration-200 hover:bg-white/10 hover:text-white"
        >
          <LogOut size={18} />
          Cerrar sesión
        </button>

        <A
          href="/profile"
          class="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-white/10"
        >
          <div class="flex h-9 w-9 items-center justify-center rounded-full bg-fero-green-mid text-xs font-bold text-white">
            {userInitials()}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-white">{userDisplayName()}</p>
            <p class="truncate text-xs text-white/50">{userRoleLabel()}</p>
          </div>
          <ChevronDown size={16} class="shrink-0 text-white/40" />
        </A>
      </div>
    </aside>
  );
}
