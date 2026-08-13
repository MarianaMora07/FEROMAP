import { For, Show, createEffect, createMemo, createResource, onCleanup, onMount } from 'solid-js';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Plus, Minus, Crosshair } from 'lucide-solid';
import { Card } from '../../design-system/components';
import { fetchMapContext, MAP_CONTEXT_POLL_MS } from '../../core/api/map';
import {
  ensureOperationalRouteLayer,
  syncFleetMarkers,
  type OperationalRouteFeatureProps,
} from '../../core/map/operationalMapLayers';
import {
  createOperationalMapOptions,
  fitMapToOperationalData,
} from '../../core/map/operationalMapConfig';
import { bindMapTheme, mapStyleForTheme } from '../../core/utils/mapStyle';
import { appState } from '../../core/stores/appStore';
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

function routeStatusLabel(status?: string) {
  return status === 'pending' ? 'Planificada' : 'En ejecución';
}

export function DashboardMiniMap() {
  let mapContainer!: HTMLDivElement;
  const mapRef: { current?: MapLibreMap } = {};
  const markersById = new Map<string, Marker>();

  const [mapContext, { refetch }] = createResource(fetchMapContext);
  const fleet = () => mapContext()?.vehicles ?? [];
  const routes = () => mapContext()?.routes ?? { type: 'FeatureCollection', features: [] };

  const routeStats = createMemo(() => {
    const features = routes().features;
    const pending = features.filter(
      (feature) => (feature.properties as OperationalRouteFeatureProps).status === 'pending',
    ).length;
    const active = features.length - pending;
    return { total: features.length, pending, active };
  });

  const legendRoutes = createMemo(() => routes().features.slice(0, 6));

  const syncMapLayers = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    ensureOperationalRouteLayer(map, routes());
    syncFleetMarkers(map, fleet(), markersById, {
      createMarkerElement: createFleetMarker,
      buildPopupHtml: (vehicle) =>
        `<strong>${vehicle.id}</strong><br/><span style="font-size:12px;color:#64748b">${vehicle.route}</span>`,
    });
    fitMapToOperationalData(map, { vehicles: fleet(), routes: routes() });
  };

  bindMapTheme(
    () => mapRef.current,
    () => Boolean(mapRef.current?.isStyleLoaded()),
    () => syncMapLayers(),
  );

  onMount(() => {
    const map = new maplibregl.Map(
      createOperationalMapOptions({
        container: mapContainer,
        style: mapStyleForTheme(appState.darkMode),
      }),
    );
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      map.resize();
      syncMapLayers();
      mapContainer.dataset.zoom = String(Math.round(map.getZoom() * 10) / 10);
    });

    map.on('moveend', () => {
      mapContainer.dataset.zoom = String(Math.round(map.getZoom() * 10) / 10);
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
            {fleet().length} vehículo{fleet().length === 1 ? '' : 's'} · {routeStats().total} ruta
            {routeStats().total === 1 ? '' : 's'} ({routeStats().pending} planificada
            {routeStats().pending === 1 ? '' : 's'}, {routeStats().active} en ejecución)
          </p>
        </div>
      </div>

      <div class="relative h-[340px] bg-slate-100 dark:bg-slate-900 lg:h-[380px]">
        <div
          ref={mapContainer}
          class="absolute inset-0 h-full w-full"
          data-testid="dashboard-operational-map"
        />

        <Show when={mapContext.loading}>
          <div class="absolute inset-0 flex items-center justify-center bg-surface/60 text-sm text-text-muted backdrop-blur-sm">
            Cargando mapa operativo…
          </div>
        </Show>

        <div class="absolute left-3 top-3 z-10 max-w-[min(100%-5rem,14rem)] rounded-md border border-border bg-surface/95 px-2.5 py-2 text-[10px] shadow-sm backdrop-blur-sm dark:bg-dark-surface/95">
          <p class="mb-1.5 font-semibold uppercase tracking-wide text-text-muted">Rutas</p>
          <ul class="mb-2 space-y-1 text-text-secondary">
            <li class="flex items-center gap-2">
              <span class="h-0.5 w-5 border-t-2 border-dashed border-slate-400" />
              Planificada
            </li>
            <li class="flex items-center gap-2">
              <span class="h-0.5 w-5 rounded-full bg-fero-green-dark" />
              En ejecución
            </li>
          </ul>
          <Show when={legendRoutes().length > 0}>
            <ul class="space-y-1 border-t border-border pt-1.5" data-testid="dashboard-route-legend">
              <For each={legendRoutes()}>
                {(feature) => {
                  const props = () => feature.properties as OperationalRouteFeatureProps;
                  return (
                    <li class="flex items-center gap-2 truncate text-text-secondary">
                      <span
                        class="h-1.5 w-3 shrink-0 rounded-full"
                        style={{ background: props().color ?? '#34D634' }}
                      />
                      <span class="truncate">{props().label ?? props().vehicleId}</span>
                      <span class="ml-auto shrink-0 text-text-muted">
                        {routeStatusLabel(props().status)}
                      </span>
                    </li>
                  );
                }}
              </For>
            </ul>
          </Show>
        </div>

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
            onClick={() => {
              const map = mapRef.current;
              if (!map) return;
              fitMapToOperationalData(map, {
                vehicles: fleet(),
                routes: routes(),
              });
            }}
          >
            <Crosshair size={14} />
          </button>
        </div>
      </div>
    </Card>
  );
}
