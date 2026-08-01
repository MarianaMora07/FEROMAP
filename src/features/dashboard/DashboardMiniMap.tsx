import { For, Show, createEffect, createResource, onCleanup, onMount } from 'solid-js';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Plus, Minus, Crosshair } from 'lucide-solid';
import { Card } from '../../design-system/components';
import { fetchMapContext, MAP_CONTEXT_POLL_MS } from '../../core/api/map';
import {
  ensureOperationalRouteLayer,
  syncFleetMarkers,
} from '../../core/map/operationalMapLayers';
import { bindMapTheme, mapStyleForTheme } from '../../core/utils/mapStyle';
import { appState } from '../../core/stores/appStore';
import { UNARE_CENTER, UNARE_ZOOM } from '../../data/types/geo';
import type { LiveVehicle } from '../../core/api/monitoring';

function truckSvg(color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>`;
}

function createFleetMarker(vehicle: LiveVehicle) {
  const el = document.createElement('button');
  el.type = 'button';
  el.title = vehicle.id;
  el.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:${vehicle.color};box-shadow:0 2px 8px rgba(0,0,0,.25);border:2px solid #fff">${truckSvg('#fff')}</span>`;
  return el;
}

export function DashboardMiniMap() {
  let mapContainer!: HTMLDivElement;
  const mapRef: { current?: MapLibreMap } = {};
  const markersById = new Map<string, Marker>();

  const [mapContext, { refetch }] = createResource(fetchMapContext);
  const fleet = () => mapContext()?.vehicles ?? [];
  const routes = () => mapContext()?.routes ?? { type: 'FeatureCollection', features: [] };

  const syncMapLayers = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    ensureOperationalRouteLayer(map, routes());
    syncFleetMarkers(map, fleet(), markersById, {
      createMarkerElement: createFleetMarker,
      buildPopupHtml: (vehicle) =>
        `<strong>${vehicle.id}</strong><br/><span style="font-size:12px;color:#64748b">${vehicle.route}</span>`,
    });
  };

  bindMapTheme(
    () => mapRef.current,
    () => Boolean(mapRef.current?.isStyleLoaded()),
    () => syncMapLayers(),
  );

  onMount(() => {
    const map = new maplibregl.Map({
      container: mapContainer,
      style: mapStyleForTheme(appState.darkMode),
      center: UNARE_CENTER,
      zoom: UNARE_ZOOM - 0.5,
      attributionControl: false,
      interactive: true,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      map.resize();
      syncMapLayers();
    });

    const pollTimer = window.setInterval(() => {
      void refetch();
    }, MAP_CONTEXT_POLL_MS);

    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(mapContainer);

    onCleanup(() => {
      window.clearInterval(pollTimer);
      ro.disconnect();
      markersById.forEach((marker) => marker.remove());
      markersById.clear();
      mapRef.current?.remove();
      mapRef.current = undefined;
    });
  });

  createEffect(() => {
    mapContext();
    syncMapLayers();
  });

  return (
    <Card padding={false} class="overflow-hidden">
      <div class="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 class="font-heading font-semibold text-text-primary dark:text-white">
            Mapa de operaciones en tiempo real
          </h3>
          <p class="text-xs text-text-muted">
            {fleet().length} vehículo{fleet().length === 1 ? '' : 's'} · {routes().features.length} ruta
            {routes().features.length === 1 ? '' : 's'} activa{routes().features.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div class="relative h-[340px] bg-slate-100 dark:bg-slate-900 lg:h-[380px]">
        <div ref={mapContainer} class="absolute inset-0 h-full w-full" />

        <Show when={mapContext.loading}>
          <div class="absolute inset-0 flex items-center justify-center bg-surface/60 text-sm text-text-muted backdrop-blur-sm">
            Cargando mapa operativo…
          </div>
        </Show>

        <div class="absolute right-3 top-3 z-10 flex flex-col overflow-hidden rounded-md border border-border bg-surface shadow-sm dark:bg-dark-surface">
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center text-text-secondary hover:bg-surface-hover"
            aria-label="Acercar"
            onClick={() => mapRef.current?.zoomIn()}
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center border-t border-border text-text-secondary hover:bg-surface-hover"
            aria-label="Alejar"
            onClick={() => mapRef.current?.zoomOut()}
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center border-t border-border text-text-secondary hover:bg-surface-hover"
            aria-label="Centrar"
            onClick={() => mapRef.current?.flyTo({ center: UNARE_CENTER, zoom: UNARE_ZOOM - 0.5 })}
          >
            <Crosshair size={14} />
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 border-t border-border px-3 py-2.5 sm:grid-cols-4 dark:border-dark-border">
        <For each={mapContext()?.mapMetrics?.slice(0, 4) ?? []}>
          {(metric) => (
            <div class="rounded-md bg-slate-50 px-2 py-1.5 text-center dark:bg-dark-surface-hover">
              <p class="text-[10px] text-text-muted">{metric.label}</p>
              <p class="font-heading text-sm font-bold text-text-primary dark:text-white">{metric.value}</p>
            </div>
          )}
        </For>
      </div>
    </Card>
  );
}
