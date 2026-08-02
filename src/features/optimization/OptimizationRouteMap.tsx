import { For, Show, createEffect, onCleanup, onMount } from 'solid-js';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Crosshair, Layers, Maximize2, Minus, Plus, Trash2, Truck } from 'lucide-solid';
import { Card } from '../../design-system/components';
import { appState } from '../../core/stores/appStore';
import { bindMapTheme, mapStyleForTheme } from '../../core/utils/mapStyle';
import { mapLegendContainers } from '../../data/mock/optimization';
import { UNARE_CENTER, UNARE_ZOOM } from '../../data/types/geo';
import type { OptimizationRouteResult } from '../../core/utils/optimizationResults';

const vehicleLegendClass: Record<string, string> = {
  blue: 'text-fero-blue',
  green: 'text-fero-green-dark',
  purple: 'text-violet-600',
};

interface OptimizationRouteMapProps {
  hasResults: boolean;
  routeResults: OptimizationRouteResult[];
}

export function OptimizationRouteMap(props: OptimizationRouteMapProps) {
  let mapContainer!: HTMLDivElement;
  const mapRef: { current?: MapLibreMap } = {};
  let mapReady = false;

  const syncRoutes = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const features = props.hasResults
      ? appState.routes.features.map((feature) => ({
          ...feature,
          properties: {
            ...feature.properties,
            kind: feature.properties.type,
          },
        }))
      : [];

    if (!map.getSource('opt-routes')) {
      map.addSource('opt-routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      });
      map.addLayer({
        id: 'opt-current',
        type: 'line',
        source: 'opt-routes',
        filter: ['==', ['get', 'kind'], 'current'],
        paint: {
          'line-color': '#94a3b8',
          'line-width': 3.5,
          'line-dasharray': [2, 2],
          'line-opacity': 0.9,
        },
      });
      map.addLayer({
        id: 'opt-optimized',
        type: 'line',
        source: 'opt-routes',
        filter: ['==', ['get', 'kind'], 'optimized'],
        paint: { 'line-color': '#34D634', 'line-width': 4, 'line-opacity': 0.95 },
      });
      return;
    }

    (map.getSource('opt-routes') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features,
    });
  };

  bindMapTheme(
    () => mapRef.current,
    () => mapReady,
    () => syncRoutes(),
  );

  onMount(() => {
    const map = new maplibregl.Map({
      container: mapContainer,
      style: mapStyleForTheme(appState.darkMode),
      center: UNARE_CENTER,
      zoom: UNARE_ZOOM - 0.3,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      map.resize();
      mapReady = true;
      syncRoutes();
    });

    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(mapContainer);

    onCleanup(() => {
      ro.disconnect();
      mapRef.current?.remove();
      mapRef.current = undefined;
      mapReady = false;
    });
  });

  createEffect(() => {
    props.hasResults;
    appState.routes;
    syncRoutes();
  });

  return (
    <Card padding={false} class="overflow-hidden">
      <div class="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 class="font-heading font-semibold text-text-primary dark:text-white">
          Vista de la ruta óptima
        </h3>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="hidden items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-text-secondary sm:inline-flex"
          >
            <Layers size={14} />
            Rutas actual / optimizada
          </button>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary"
            aria-label="Pantalla completa"
            onClick={() => document.documentElement.requestFullscreen?.()}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      <div class="relative h-85 bg-slate-100 dark:bg-slate-900 lg:h-95">
        <div ref={mapContainer} class="absolute inset-0 h-full w-full" />

        <Show when={!props.hasResults}>
          <div class="absolute inset-0 flex items-center justify-center bg-surface/50 text-sm text-text-muted backdrop-blur-sm">
            Ejecute la optimización para visualizar las rutas
          </div>
        </Show>

        <div class="absolute right-3 top-3 flex flex-col overflow-hidden rounded-md border border-border bg-surface shadow-sm dark:bg-dark-surface">
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
            onClick={() => mapRef.current?.flyTo({ center: UNARE_CENTER, zoom: UNARE_ZOOM - 0.3 })}
          >
            <Crosshair size={14} />
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-xs text-text-secondary">
        <For each={props.routeResults}>
          {(route) => (
            <span class={`inline-flex items-center gap-1.5 font-medium ${vehicleLegendClass[route.tone] ?? 'text-fero-blue'}`}>
              <Truck size={14} />
              {route.id}
            </span>
          )}
        </For>
        <Show when={props.routeResults.length > 0}>
          <span class="hidden h-4 w-px bg-border sm:block" />
        </Show>
        <For each={mapLegendContainers}>
          {(c) => (
            <span class={`inline-flex items-center gap-1.5 ${c.class}`}>
              <Trash2 size={14} />
              {c.label}
            </span>
          )}
        </For>
      </div>
    </Card>
  );
}
