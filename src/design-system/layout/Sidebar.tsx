import { For, Show } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
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
} from 'lucide-solid';
import { appState, toggleDarkMode } from '../../core/stores/appStore';
import { dashboardSummary } from '../../data/mock/dashboard';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  separator?: boolean;
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/optimization', label: 'Optimización de Rutas', icon: Map },
  { href: '/map', label: 'Mapa GIS', icon: MapPin },
  { href: '/vehicles', label: 'Vehículos', icon: Truck },
  { href: '/collection-points', label: 'Puntos de Recolección', icon: Trash2 },
  { href: '/simulation', label: 'Simulación', icon: Brain },
  { href: '/monitoring', label: 'Monitoreo en Tiempo Real', icon: Radio },
  { href: '/reports', label: 'Reportes', icon: FileText },
  { href: '/analytics', label: 'Analítica', icon: BarChart3 },
  { href: '/alerts', label: 'Alertas', icon: AlertTriangle, separator: true },
];

const bottomItems: NavItem[] = [
  { href: '/admin', label: 'Administración', icon: Settings },
  { href: '/profile', label: 'Perfil', icon: User },
];

function navClass(active: boolean) {
  return `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
    active
      ? 'bg-fero-green-dark text-white shadow-sm'
      : 'text-white/65 hover:bg-white/10 hover:text-white'
  }`;
}

interface SidebarProps {
  open: boolean;
}

export function Sidebar(props: SidebarProps) {
  const location = useLocation();
  const isActive = (href: string) => location.pathname === href;

  return (
    <aside
      class={`fixed top-0 left-0 z-40 flex h-full flex-col bg-sidebar transition-all duration-300 ${
        props.open ? 'w-[var(--sidebar-width)] translate-x-0' : '-translate-x-full'
      }`}
    >
      <div class="flex items-start gap-3 border-b border-white/10 px-4 py-4">
        <img
          src="/feromap-logo.png"
          alt="FEROMAP"
          class="h-16 w-16 shrink-0 object-contain"
        />
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
        <For each={navItems}>
          {(item) => (
            <>
              <Show when={item.separator}>
                <div class="my-3 border-t border-white/10" />
              </Show>
              <A href={item.href} class={navClass(isActive(item.href))}>
                <item.icon size={18} />
                <span class="truncate">{item.label}</span>
              </A>
            </>
          )}
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
              {dashboardSummary.operatorsOnline}{' '}
              <span class="text-fero-green">En línea</span>
            </p>
          </div>
        </div>

        <For each={bottomItems}>
          {(item) => (
            <A href={item.href} class={navClass(isActive(item.href))}>
              <item.icon size={18} />
              {item.label}
            </A>
          )}
        </For>

        <button
          type="button"
          onClick={toggleDarkMode}
          class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-white/65 transition-all duration-200 hover:bg-white/10 hover:text-white"
        >
          {appState.darkMode ? <Sun size={18} /> : <Moon size={18} />}
          {appState.darkMode ? 'Modo claro' : 'Modo oscuro'}
        </button>

        <A
          href="/profile"
          class="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-white/10"
        >
          <div class="flex h-9 w-9 items-center justify-center rounded-full bg-fero-green-mid text-xs font-bold text-white">
            {dashboardSummary.user.initials}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-white">{dashboardSummary.user.name}</p>
            <p class="truncate text-xs text-white/50">{dashboardSummary.user.role}</p>
          </div>
          <ChevronDown size={16} class="shrink-0 text-white/40" />
        </A>
      </div>
    </aside>
  );
}
