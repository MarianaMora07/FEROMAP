import { Show, type JSX } from 'solid-js';
import { A } from '@solidjs/router';
import {
  Menu,
  Layers,
  BookOpen,
  Bell,
  Maximize2,
  LogOut,
  Sun,
  Moon,
  Play,
} from 'lucide-solid';
import { Button } from '../../design-system/components';

export interface MapToolbarProps {
  residentMode: boolean;
  isResidentUser: boolean;
  residentSectorName: string;
  canOpenPlayback: boolean;
  playbackOpen: boolean;
  layersOpen: boolean;
  legendOpen: boolean;
  darkMode: boolean;
  notificationCount: number;
  onToggleSidebar: () => void;
  onToggleDarkMode: () => void;
  onLogout: () => void;
  onOpenPlayback: () => void;
  onToggleLayers: () => void;
  onToggleLegend: () => void;
  onRef?: (el: HTMLElement) => void;
}

export function MapToolbar(props: MapToolbarProps) {
  return (
    <header
      ref={props.onRef}
      class="absolute inset-x-0 top-0 z-20 flex flex-wrap items-center gap-2 border-b border-default/60 bg-elevated/90 px-3 py-2 shadow-sm backdrop-blur-md"
    >
      <button
        type="button"
        onClick={props.onToggleSidebar}
        class="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-app"
        aria-label="Menú"
      >
        <Menu size={20} />
      </button>

      <div class="relative min-w-0 flex-1 md:max-w-sm">
        <Show
          when={!props.residentMode}
          fallback={
            <p
              role="status"
              class="truncate py-2 pl-1 text-sm font-semibold text-fero-green-dark dark:text-fero-green"
            >
              Mi sector — {props.residentSectorName}
            </p>
          }
        >
          <p class="truncate py-2 pl-1 text-sm font-medium text-text-secondary">
            Mapa operativo — Unare
          </p>
        </Show>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <Show when={!props.residentMode}>
          <Show when={props.canOpenPlayback && !props.playbackOpen}>
            <ToolBtn
              icon={<Play size={16} />}
              label="Ver recorrido"
              onClick={props.onOpenPlayback}
            />
          </Show>
        </Show>
        <ToolBtn
          icon={<Layers size={16} />}
          label="Capas"
          active={props.layersOpen}
          aria-expanded={props.layersOpen}
          aria-controls="map-layers-panel"
          onClick={props.onToggleLayers}
        />
        <ToolBtn
          icon={<BookOpen size={16} />}
          label="Leyenda"
          active={props.legendOpen}
          aria-expanded={props.legendOpen}
          aria-controls="map-legend-panel"
          onClick={props.onToggleLegend}
        />
      </div>

      <div class="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void props.onToggleDarkMode()}
          class="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-app"
          aria-label="Tema"
        >
          {props.darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <Show when={!props.isResidentUser}>
          <A
            href="/alerts"
            class="relative flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-app"
            aria-label="Notificaciones"
          >
            <Bell size={18} />
            <Show when={props.notificationCount > 0}>
              <span class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {props.notificationCount}
              </span>
            </Show>
          </A>
        </Show>
        <Show when={props.isResidentUser}>
          <A
            href="/alerts?scope=sector"
            class="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-app"
            aria-label="Alertas de mi sector"
          >
            <Bell size={18} />
          </A>
        </Show>
        <Show when={!props.isResidentUser}>
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-app"
            aria-label="Pantalla completa"
            onClick={() => document.documentElement.requestFullscreen?.()}
          >
            <Maximize2 size={18} />
          </button>
          <Button
            variant="gradient"
            size="sm"
            icon={<LogOut size={14} />}
            onClick={() => void props.onLogout()}
          >
            Salir
          </Button>
        </Show>
        <Show when={props.isResidentUser}>
          <A href="/resident">
            <Button variant="outline" size="sm" icon={<LogOut size={14} />}>
              Salir
            </Button>
          </A>
        </Show>
      </div>
    </header>
  );
}

function ToolBtn(props: {
  icon: JSX.Element;
  label: string;
  active?: boolean;
  onClick?: () => void;
  class?: string;
  ref?: (el: HTMLButtonElement) => void;
  ariaExpanded?: boolean;
  ariaControls?: string;
}) {
  return (
    <button
      type="button"
      ref={props.ref}
      onClick={props.onClick}
      aria-expanded={props.ariaExpanded}
      aria-controls={props.ariaControls}
      class={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        props.active
          ? 'border-fero-green-dark/40 bg-fero-green/15 text-fero-green-dark'
          : 'border-default text-text-secondary hover:bg-app'
      } ${props.class ?? ''}`}
    >
      {props.icon}
      <span class="hidden lg:inline">{props.label}</span>
    </button>
  );
}
