import { For, Show } from 'solid-js';
import { ChevronDown, Trash2, Truck, Route } from 'lucide-solid';
import { mapBaseStyles, type MapBaseStyleId } from '../../data/mock/mapGis';

const toneIconBg = {
  green: 'bg-fero-green/15 text-fero-green-dark',
  red: 'bg-red-50 text-red-500',
  amber: 'bg-amber-50 text-amber-500',
  blue: 'bg-fero-blue/10 text-fero-blue',
};

export interface MapBottomControlsProps {
  baseStyle: MapBaseStyleId;
  metrics: Array<{ label: string; value: string | number; tone: string; icon: string }>;
  onChangeBaseStyle: (id: MapBaseStyleId) => void;
}

export function MapBottomControls(props: MapBottomControlsProps) {
  return (
    <div class="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3">
      <div class="pointer-events-auto flex flex-col gap-3 lg:flex-row lg:items-end">
        <div class="w-full shrink-0 rounded-xl border border-default bg-elevated/95 p-3 shadow-lg backdrop-blur-md lg:w-auto">
          <div class="mb-2 flex items-center gap-1">
            <p class="text-sm font-semibold text-text-primary">Mapa base</p>
            <ChevronDown size={14} class="text-text-muted" />
          </div>
          <div class="flex gap-2">
            <For each={[...mapBaseStyles]}>
              {(style) => (
                <button type="button" class="group flex w-18 flex-col items-center gap-1" onClick={() => props.onChangeBaseStyle(style.id)}>
                  <span class={`h-14 w-18 overflow-hidden rounded-md border-2 ${props.baseStyle === style.id ? 'border-red-500' : 'border-default'}`}>
                    <img src={style.preview} alt={style.label} class="h-full w-full object-cover" loading="lazy" referrerpolicy="no-referrer" />
                  </span>
                  <span class="text-[10px] text-text-muted group-hover:text-text-secondary">{style.label}</span>
                </button>
              )}
            </For>
          </div>
        </div>

        <div class="min-w-0 flex-1 rounded-xl border border-default bg-elevated/95 px-3 py-2.5 shadow-lg backdrop-blur-md">
          <div class="grid grid-cols-2 content-center gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <For each={props.metrics}>
              {(metric) => (
                <div class="flex items-center gap-3">
                  <span class={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneIconBg[metric.tone as keyof typeof toneIconBg] ?? toneIconBg.blue}`}>
                    <Show when={metric.icon === 'trash'}><Trash2 size={18} /></Show>
                    <Show when={metric.icon === 'truck'}><Truck size={18} /></Show>
                    <Show when={metric.icon === 'route'}><Route size={18} /></Show>
                  </span>
                  <div class="min-w-0">
                    <p class="truncate text-[11px] text-text-muted">{metric.label}</p>
                    <p class="font-heading text-lg font-bold leading-tight text-text-primary">{metric.value}</p>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
}
