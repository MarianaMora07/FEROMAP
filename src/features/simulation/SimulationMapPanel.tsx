import { For, Show, createEffect, onCleanup, onMount } from 'solid-js';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Crosshair, Minus, Plus, Trash2 } from 'lucide-solid';
import { Card } from '../../design-system/components';
import { appState } from '../../core/stores/appStore';
import { bindMapTheme, mapStyleForTheme } from '../../core/utils/mapStyle';
import { fillLevelColor } from '../../core/utils/geoUtils';
import { buildContainerPopupHtml } from '../../core/utils/popupHtml';
import { mapMarkerLegend, mapRouteLegend } from './simulationConfig';
import { UNARE_CENTER, UNARE_ZOOM } from '../../data/types/geo';

function trashSvg(color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
}

function createContainerMarker(color: string) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'sim-marker';
  el.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:9999px;background:${color};box-shadow:0 2px 8px rgba(0,0,0,.25);border:2px solid #fff">${trashSvg('#fff')}</span>`;
  return el;
}

interface SimulationMapPanelProps {
  hasResults: boolean;
}

export function SimulationMapPanel(props: SimulationMapPanelProps) {
  let mapContainer!: HTMLDivElement;
  const mapRef: { current?: MapLibreMap } = {};
  const containerMarkers: Marker[] = [];
  let mapReady = false;

  const syncMapData = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (map.getSource('sectors')) {
      (map.getSource('sectors') as maplibregl.GeoJSONSource).setData(appState.sectors);
    }

    const routeFeatures = props.hasResults
      ? appState.routes.features.map((feature) => ({
          ...feature,
          properties: { ...feature.properties, kind: feature.properties.type },
        }))
      : [];

    if (!map.getSource('sim-routes')) {
      map.addSource('sim-routes', { type: 'geojson', data: { type: 'FeatureCollection', features: routeFeatures } });
      map.addLayer({
        id: 'sim-current',
        type: 'line',
        source: 'sim-routes',
        filter: ['==', ['get', 'kind'], 'current'],
        paint: {
          'line-color': '#94a3b8',
          'line-width': 3.5,
          'line-dasharray': [2, 2],
          'line-opacity': 0.9,
        },
      });
      map.addLayer({
        id: 'sim-optimized',
        type: 'line',
        source: 'sim-routes',
        filter: ['==', ['get', 'kind'], 'optimized'],
        paint: { 'line-color': '#34D634', 'line-width': 4, 'line-opacity': 0.95 },
      });
    } else {
      (map.getSource('sim-routes') as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: routeFeatures,
      });
    }

    containerMarkers.forEach((marker) => marker.remove());
    containerMarkers.length = 0;

    for (const feature of appState.containers.features) {
      const color = fillLevelColor(feature.properties.fillLevel);
      const marker = new maplibregl.Marker({ element: createContainerMarker(color) })
        .setLngLat(feature.geometry.coordinates as [number, number])
        .setPopup(
          new maplibregl.Popup({ offset: 16, maxWidth: '260px' }).setHTML(buildContainerPopupHtml(feature)),
        )
        .addTo(map);
      containerMarkers.push(marker);
    }
  };

  const setupBaseLayers = (map: MapLibreMap) => {
    if (!map.getSource('sectors')) {
      map.addSource('sectors', { type: 'geojson', data: appState.sectors });
      map.addLayer({
        id: 'sectors-fill',
        type: 'fill',
        source: 'sectors',
        paint: { 'fill-color': '#1143F3', 'fill-opacity': 0.07 },
      });
      map.addLayer({
        id: 'sectors-line',
        type: 'line',
        source: 'sectors',
        paint: { 'line-color': '#232AB6', 'line-width': 1.2, 'line-opacity': 0.45 },
      });
    }
    syncMapData();
  };

  bindMapTheme(
    () => mapRef.current,
    () => mapReady,
    () => setupBaseLayers(mapRef.current!),
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
      setupBaseLayers(map);
      mapReady = true;
    });

    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(mapContainer);

    onCleanup(() => {
      ro.disconnect();
      containerMarkers.forEach((marker) => marker.remove());
      mapRef.current?.remove();
      mapRef.current = undefined;
      mapReady = false;
    });
  });

  createEffect(() => {
    props.hasResults;
    appState.routes;
    appState.containers;
    appState.sectors;
    syncMapData();
  });

  return (
    <Card padding={false} class="flex min-h-0 flex-col overflow-hidden xl:col-span-5 xl:h-full">
      <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 dark:border-dark-border">
        <h3 class="font-heading font-semibold text-text-primary dark:text-white">
          Visualización del escenario
        </h3>
        <div class="flex flex-wrap items-center gap-3 text-[11px] text-text-secondary">
          <For each={mapRouteLegend}>
            {(item) => (
              <span class="inline-flex items-center gap-1.5">
                <span
                  class={`h-0.5 w-5 rounded-full ${
                    item.style === 'solid-green'
                      ? 'bg-fero-green-dark'
                      : 'border-t-2 border-dashed border-slate-400 bg-transparent'
                  }`}
                />
                {item.label}
              </span>
            )}
          </For>
        </div>
      </div>

      <div class="relative min-h-64 flex-1 bg-slate-100 dark:bg-slate-900">
        <div ref={mapContainer} class="absolute inset-0 h-full w-full" />
        <Show when={!appState.dataReady}>
          <div class="absolute inset-0 flex items-center justify-center bg-surface/50 text-sm text-text-muted backdrop-blur-sm">
            Cargando sectores y contenedores…
          </div>
        </Show>
        <div class="absolute right-3 bottom-3 z-10 flex flex-col overflow-hidden rounded-md border border-border bg-surface/95 shadow-sm backdrop-blur-sm dark:bg-dark-surface/95">
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center text-text-secondary hover:bg-surface-hover disabled:opacity-40"
            disabled={!mapReady}
            onClick={() => mapRef.current?.zoomIn()}
            aria-label="Acercar"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center border-t border-border text-text-secondary hover:bg-surface-hover disabled:opacity-40"
            disabled={!mapReady}
            onClick={() => mapRef.current?.zoomOut()}
            aria-label="Alejar"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center border-t border-border text-text-secondary hover:bg-surface-hover disabled:opacity-40"
            disabled={!mapReady}
            onClick={() => mapRef.current?.flyTo({ center: UNARE_CENTER, zoom: UNARE_ZOOM - 0.3 })}
            aria-label="Centrar"
          >
            <Crosshair size={14} />
          </button>
        </div>
      </div>

      <div class="flex shrink-0 flex-wrap gap-x-4 gap-y-2 border-t border-border px-4 py-2.5 text-xs text-text-secondary dark:border-dark-border">
        <For each={mapMarkerLegend}>
          {(item) => (
            <span class={`inline-flex items-center gap-1.5 ${item.class}`}>
              <Trash2 size={12} />
              <span class="text-text-secondary">{item.label}</span>
            </span>
          )}
        </For>
      </div>
    </Card>
  );
}
