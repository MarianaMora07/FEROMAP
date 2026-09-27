import { Plus, Minus, Crosshair } from 'lucide-solid';

export interface MapViewControlsProps {
  mapReady: boolean;
  coords: { lng: number; lat: number; zoom: number };
  onZoomIn: () => void;
  onZoomOut: () => void;
  onLocate: () => void;
}

export function MapViewControls(props: MapViewControlsProps) {
  return (
    <>
      <div class="absolute right-3 bottom-36 z-20 flex flex-col gap-2 sm:bottom-32">
        <div class="flex flex-col overflow-hidden rounded-lg border border-default bg-elevated/95 shadow-md backdrop-blur-md">
          <button type="button" class="flex h-9 w-9 items-center justify-center text-text-secondary transition-colors hover:bg-app disabled:opacity-40" onClick={props.onZoomIn} disabled={!props.mapReady} aria-label="Acercar">
            <Plus size={16} />
          </button>
          <button type="button" class="flex h-9 w-9 items-center justify-center border-t border-default text-text-secondary transition-colors hover:bg-app disabled:opacity-40" onClick={props.onZoomOut} disabled={!props.mapReady} aria-label="Alejar">
            <Minus size={16} />
          </button>
        </div>
        <button type="button" class="flex h-9 w-9 items-center justify-center rounded-lg border border-default bg-elevated/95 text-text-secondary shadow-md backdrop-blur-md transition-colors hover:bg-app disabled:opacity-40" onClick={props.onLocate} disabled={!props.mapReady} aria-label="Mi ubicación" title="Centrar en mi ubicación">
          <Crosshair size={16} />
        </button>
      </div>

      <div class="absolute bottom-44 left-3 z-20 rounded-md border border-default bg-elevated/95 px-2.5 py-1 text-[11px] font-bold text-text-secondary shadow-sm backdrop-blur-md sm:bottom-40">
        {props.coords.lat}, {props.coords.lng} · z{props.coords.zoom}
      </div>
    </>
  );
}
