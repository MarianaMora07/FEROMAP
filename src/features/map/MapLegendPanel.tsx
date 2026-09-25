import { For, Show } from 'solid-js';
import { Trash2, Truck, Fuel, Landmark, X } from 'lucide-solid';
import { mapLegend } from '../../data/mock/mapGis';

export interface MapLegendPanelProps {
  open: boolean;
  onClose: () => void;
  onRef?: (el: HTMLElement) => void;
}

export function MapLegendPanel(props: MapLegendPanelProps) {
  return (
    <Show when={props.open}>
      <aside
        ref={props.onRef}
        id="map-legend-panel"
        aria-label="Leyenda del mapa"
        class="absolute top-16 right-3 z-20 w-52 rounded-lg border border-default bg-elevated/95 p-3 shadow-lg backdrop-blur-md"
      >
        <div class="mb-2 flex items-center justify-between">
          <h3 class="font-heading text-sm font-semibold text-text-primary">Leyenda</h3>
          <button type="button" aria-label="Cerrar leyenda" class="text-text-muted hover:text-text-secondary" onClick={() => props.onClose()}>
            <X size={16} />
          </button>
        </div>
        <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Contenedores</p>
        <ul class="mb-2 space-y-1">
          <For each={mapLegend.containers}>
            {(item) => (
              <li class={`flex items-center gap-2 text-xs ${item.class}`}>
                <Trash2 size={13} />
                <span class="text-text-secondary">{item.label}</span>
              </li>
            )}
          </For>
        </ul>
        <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Vehículos</p>
        <ul class="mb-2 space-y-1">
          <For each={mapLegend.vehicles}>
            {(item) => (
              <li class={`flex items-center gap-2 text-xs ${item.class}`}>
                <Truck size={13} />
                <span class="text-text-secondary">{item.label}</span>
              </li>
            )}
          </For>
        </ul>
        <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Rutas</p>
        <ul class="mb-2 space-y-1">
          <For each={mapLegend.routes}>
            {(item) => (
              <li class="flex items-center gap-2 text-xs text-text-secondary">
                <span class={`h-1 w-5 rounded-full ${item.class}`} />
                {item.label}
              </li>
            )}
          </For>
        </ul>
        <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Otros</p>
        <ul class="space-y-1">
          <For each={mapLegend.others}>
            {(item) => (
              <li class="flex items-center gap-2 text-xs text-text-secondary">
                <Show when={item.icon === 'fuel'} fallback={<Landmark size={13} class="text-slate-500" />}>
                  <Fuel size={13} class="text-fero-blue" />
                </Show>
                {item.label}
              </li>
            )}
          </For>
        </ul>
      </aside>
    </Show>
  );
}
