import { For, Show } from 'solid-js';
import { Play, Trash2, Truck, X } from 'lucide-solid';
import { Button } from '../../design-system/components';
import type { DailyPlan } from '../../core/api/planning';
import type { MapLayerItem } from '../../data/mock/mapGis';

export interface MapLayersPanelProps {
  open: boolean;
  residentMode: boolean;
  operationDate: string;
  dailyPlan?: DailyPlan | null;
  canOpenPlayback: boolean;
  playbackOpen: boolean;
  playbackLoading: boolean;
  layers: MapLayerItem[];
  layerState: Record<string, boolean>;
  onOperationDateChange: (date: string) => void;
  onOpenPlayback: () => void;
  onToggleLayer: (id: string) => void;
  onClose: () => void;
  onRef?: (el: HTMLElement) => void;
}

export function MapLayersPanel(props: MapLayersPanelProps) {
  return (
    <Show when={props.open}>
      <aside
        ref={props.onRef}
        id="map-layers-panel"
        aria-label="Capas del mapa"
        class="absolute top-16 left-3 z-20 w-64 rounded-lg border border-default bg-elevated/95 p-3 shadow-lg backdrop-blur-md"
        data-testid="map-layers-panel"
      >
        <div class="mb-2 flex items-center justify-between">
          <h3 class="font-heading text-sm font-semibold text-text-primary">Capas</h3>
          <button type="button" aria-label="Cerrar capas" class="text-text-muted hover:text-text-secondary" onClick={() => props.onClose()}>
            <X size={16} />
          </button>
        </div>
        <Show when={!props.residentMode}>
          <div class="mb-3 space-y-2 border-b border-default pb-3">
            <label class="block text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Plan del día
            </label>
            <input
              type="date"
              class="w-full rounded-md border border-default bg-app px-2 py-1.5 text-sm text-text-primary"
              value={props.operationDate}
              data-testid="map-operation-date"
              onChange={(event) => props.onOperationDateChange(event.currentTarget.value)}
            />
            <Show when={props.dailyPlan}>
              {(plan) => (
                <p class="text-xs text-text-muted">
                  Plan #{plan().id} · {plan().status}
                </p>
              )}
            </Show>
            <Show when={props.canOpenPlayback && !props.playbackOpen}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                class="w-full gap-1.5"
                icon={<Play size={14} />}
                loading={props.playbackLoading}
                onClick={props.onOpenPlayback}
                data-testid="map-open-playback-btn"
              >
                Ver recorrido
              </Button>
            </Show>
          </div>
        </Show>
        <ul class="space-y-1">
          <For each={props.layers}>
            {(layer) => (
              <li>
                <label class="flex cursor-pointer items-center gap-2 py-0.5 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    class="size-4 rounded border-default accent-fero-green-dark"
                    checked={props.layerState[layer.id]}
                    data-testid={layer.id === 'routes' ? 'map-layer-routes' : undefined}
                    onChange={() => props.onToggleLayer(layer.id)}
                  />
                  {layer.label}
                </label>
                <Show when={layer.children && props.layerState[layer.id]}>
                  <ul class="mt-1 mb-1.5 ml-6 space-y-1 border-l border-default pl-2.5">
                    <For each={layer.children}>
                      {(child) => (
                        <li>
                          <label class="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
                            <input
                              type="checkbox"
                              class="size-3.5 rounded border-default accent-fero-green-dark"
                              checked={props.layerState[child.id] ?? true}
                              onChange={() => props.onToggleLayer(child.id)}
                            />
                            <Show when={child.kind === 'line'}>
                              <span
                                class={`h-1 w-4 shrink-0 rounded-full ${child.class ?? ''}`}
                                style={{
                                  background:
                                    'color' in child && child.color
                                      ? String(child.color)
                                      : undefined,
                                }}
                              />
                            </Show>
                            <Show when={child.kind === 'trash'}>
                              <Trash2 size={12} class={child.class} />
                            </Show>
                            <Show when={child.kind === 'truck'}>
                              <Truck size={12} class={child.class} />
                            </Show>
                            {child.label}
                          </label>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </aside>
    </Show>
  );
}
