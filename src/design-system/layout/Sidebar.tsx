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
} from 'lucide-solid';
import { appState, toggleDarkMode } from '../../core/stores/appStore';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  separator?: boolean;
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/optimization', label: 'Optimización', icon: Map },
  { href: '/map', label: 'Mapa GIS', icon: MapPin },
  { href: '/vehicles', label: 'Vehículos', icon: Truck },
  { href: '/collection-points', label: 'Puntos de Recolección', icon: Trash2 },
  { href: '/simulation', label: 'Simulación', icon: Brain },
  { href: '/monitoring', label: 'Monitoreo', icon: Radio },
  { href: '/analytics', label: 'Analítica', icon: BarChart3 },
  { href: '/reports', label: 'Reportes', icon: FileText },
  { href: '/alerts', label: 'Alertas', icon: AlertTriangle, separator: true },
];

const bottomItems: NavItem[] = [
  { href: '/admin', label: 'Administración', icon: Settings },
  { href: '/profile', label: 'Perfil', icon: User },
];

interface SidebarProps {
  open: boolean;
}

export function Sidebar(props: SidebarProps) {
  const location = useLocation();

  return (
    <aside
      class={`fixed top-0 left-0 h-full z-40 flex flex-col bg-sidebar transition-all duration-300 ${
        props.open ? 'w-[var(--sidebar-width)] translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Logo */}
      <div class="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <img
          src="/feromap-logo.png"
          alt="FEROMAP"
          class="h-10 w-10 object-contain"
        />
        <div>
          <p class="font-heading text-lg font-bold text-white tracking-tight">FEROMAP</p>
          <p class="text-[10px] text-white/50 uppercase tracking-widest">Sistema de Rutas</p>
        </div>
      </div>

      {/* Navigation */}
      <nav class="flex-1 overflow-y-auto py-3 px-3 space-y-1">
        <For each={navItems}>
          {(item) => (
            <>
              {item.separator && (
                <div class="my-3 border-t border-white/10" />
              )}
              <A
                href={item.href}
                class={`flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-sm font-medium transition-all duration-200 ${
                  location.pathname === item.href
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-white/60 hover:bg-white/8 hover:text-white'
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </A>
            </>
          )}
        </For>
      </nav>

      {/* Bottom Section */}
      <div class="border-t border-white/10 p-3 space-y-1">
        <For each={bottomItems}>
          {(item) => (
            <A
              href={item.href}
              class={`flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-sm font-medium transition-all duration-200 ${
                location.pathname === item.href
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-white/60 hover:bg-white/8 hover:text-white'
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </A>
          )}
        </For>

        <button
          type="button"
          onClick={toggleDarkMode}
          class="flex w-full items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-sm font-medium text-white/60 hover:bg-white/8 hover:text-white transition-all duration-200"
        >
          {appState.darkMode ? <Sun size={18} /> : <Moon size={18} />}
          {appState.darkMode ? 'Modo claro' : 'Modo oscuro'}
        </button>
      </div>
    </aside>
  );
}
