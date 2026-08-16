import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import { Crosshair, Minus, Play, Plus, Trash2, Truck } from 'lucide-solid';
import { Button, Card } from '../../design-system/components';
import { appState } from '../../core/stores/appStore';
import { OperationalMap } from '../../core/map/OperationalMap';
import { fitMapToOperationalData } from '../../core/map/operationalMapConfig';
import { routeDisplayKind, toPlainRouteCollection } from '../../core/map/operationalMapLayers';
import { fillLevelColor } from '../../core/utils/geoUtils';
import { buildContainerPopupHtml } from '../../core/utils/popupHtml';
import type { RoutePlaybackModel } from '../../core/route-playback/routePlaybackTypes';
import type { RoutePlaybackController } from '../../core/route-playback/useRoutePlayback';
import { RoutePlaybackLayer } from '../route-playback/RoutePlaybackLayer';
import { RoutePlaybackLegend } from '../route-playback/RoutePlaybackLegend';
import { mapMarkerLegend, mapRouteLegend } from './simulationConfig';
import type { ExecutionPhaseId } from './executionPhases';
import {
  EXECUTION_MAP_LEGEND,
  activeExecutionLegend,
  buildCostMatrixFeatures,
  buildExploreRouteFeatures,
  executionOverlayMessage,
  executionPhaseLocalProgress,
  interpolateAlongLine,
  isCriticalContainer,
  routeFeaturesForExecution,
  sectorLineOpacityForPhase,
  sectorOpacityForPhase,
  shouldPulseCriticalContainers,
} from './simulationMapExecution';

function trashSvg(color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
}

function createContainerMarker(color: string, pulse = false) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = pulse ? 'sim-marker sim-marker--pulse' : 'sim-marker';
  el.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:9999px;background:${color};box-shadow:0 2px 8px rgba(0,0,0,.25);border:2px solid #fff">${trashSvg('#fff')}</span>`;
  return el;
}

function createTruckMarker() {
  const el = document.createElement('div');
  el.className = 'sim-truck-marker';
  el.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:#232AB6;box-shadow:0 2px 10px rgba(0,0,0,.3);border:2px solid #fff;color:#fff;font-size:14px">🚛</span>`;
  return el;
}

interface SimulationMapPanelProps {
  hasResults: boolean;
  executionMode?: boolean;
  executionPhase?: ExecutionPhaseId | null;
  isRunning?: boolean;
  executionProgress?: number;
  playbackActive?: boolean;
  playbackRoutes?: RoutePlaybackModel[];
  playback?: RoutePlaybackController;
  playbackLoading?: boolean;
  onOpenPlayback?: () => void;
}

export function SimulationMapPanel(props: SimulationMapPanelProps) {
  const mapRef: { current?: MapLibreMap } = {};
  const [mapInstance, setMapInstance] = createSignal<MapLibreMap | undefined>();
  const containerMarkers: Marker[] = [];
  const truckMarkers: Marker[] = [];
  let mapReady = false;
  let exploreVariant = 0;
  let exploreTimer: ReturnType<typeof setInterval> | undefined;
  let truckFrame: number | undefined;
  const [truckTick, setTruckTick] = createSignal(0);

  const showExecutionOverlay = () =>
    Boolean(
      props.executionMode &&
        props.isRunning &&
        props.executionPhase &&
        props.executionPhase !== 'listo',
    );

  const playbackActive = () => Boolean(props.playbackActive && props.playback && props.playbackRoutes?.length);

  const syncStaticRoutes = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || showExecutionOverlay()) return;

    const routeFeatures = props.hasResults
      ? toPlainRouteCollection(appState.routes).features.map((feature) => ({
          ...feature,
          properties: { ...feature.properties, kind: routeDisplayKind(feature.properties) },
        }))
      : [];

    const dimmed = playbackActive();

    if (map.getSource('sim-routes')) {
      (map.getSource('sim-routes') as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: routeFeatures,
      });
      if (map.getLayer('sim-current')) {
        map.setPaintProperty('sim-current', 'line-opacity', dimmed ? 0.15 : 0.9);
      }
      if (map.getLayer('sim-optimized')) {
        map.setPaintProperty('sim-optimized', 'line-opacity', dimmed ? 0.2 : 0.95);
      }
    }
  };

  const syncContainerMarkers = (pulseCritical: boolean) => {
    containerMarkers.forEach((marker) => marker.remove());
    containerMarkers.length = 0;

    const map = mapRef.current;
    if (!map) return;

    for (const feature of appState.containers.features) {
      const color = fillLevelColor(feature.properties.fillLevel);
      const pulse =
        pulseCritical &&
        isCriticalContainer(feature.properties.fillLevel, feature.properties.priority);
      const marker = new maplibregl.Marker({ element: createContainerMarker(color, pulse) })
        .setLngLat(feature.geometry.coordinates as [number, number])
        .setPopup(
          new maplibregl.Popup({ offset: 16, maxWidth: '260px' }).setHTML(buildContainerPopupHtml(feature)),
        )
        .addTo(map);
      containerMarkers.push(marker);
    }
  };

  const ensureExecutionLayers = (map: MapLibreMap) => {
    if (!map.getSource('sim-cost-matrix')) {
      map.addSource('sim-cost-matrix', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'sim-cost-matrix-line',
        type: 'line',
        source: 'sim-cost-matrix',
        paint: {
          'line-color': '#60a5fa',
          'line-width': 1.2,
          'line-opacity': 0.55,
          'line-dasharray': [1, 2],
        },
      });
    }

    if (!map.getSource('sim-explore')) {
      map.addSource('sim-explore', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'sim-explore-line',
        type: 'line',
        source: 'sim-explore',
        paint: {
          'line-color': '#f59e0b',
          'line-width': 3,
          'line-opacity': 0.75,
          'line-dasharray': [2, 2],
        },
      });
    }

    if (!map.getSource('sim-routes')) {
      map.addSource('sim-routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
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
    }
  };

  const syncExecutionVisuals = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !showExecutionOverlay()) return;

    ensureExecutionLayers(map);

    const phase = props.executionPhase ?? null;
    const progress = props.executionProgress ?? 0;
    const local = executionPhaseLocalProgress(phase, progress);

    map.setPaintProperty('sectors-fill', 'fill-opacity', sectorOpacityForPhase(phase, progress));
    map.setPaintProperty('sectors-line', 'line-opacity', sectorLineOpacityForPhase(phase, progress));

    const showCostMatrix = phase === 'matriz_costos' || phase === 'grafo_vial';
    const costData = showCostMatrix
      ? buildCostMatrixFeatures(appState.containers, local)
      : { type: 'FeatureCollection' as const, features: [] };
    (map.getSource('sim-cost-matrix') as maplibregl.GeoJSONSource).setData(costData);

    const showExplore = phase === 'aco';
    const exploreData = showExplore
      ? buildExploreRouteFeatures(appState.routes, exploreVariant)
      : { type: 'FeatureCollection' as const, features: [] };
    (map.getSource('sim-explore') as maplibregl.GeoJSONSource).setData(exploreData);

    const routeFeatures = routeFeaturesForExecution(appState.routes, phase, progress, exploreVariant);
    (map.getSource('sim-routes') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: routeFeatures,
    });

    map.setLayoutProperty('sim-cost-matrix-line', 'visibility', showCostMatrix ? 'visible' : 'none');
    map.setLayoutProperty('sim-explore-line', 'visibility', showExplore ? 'visible' : 'none');
    map.setLayoutProperty(
      'sim-current',
      'visibility',
      phase === 'refinamiento_2opt' || phase === 'persistencia' || phase === 'preparando_mapa' || phase === 'listo' ? 'visible' : 'none',
    );
    map.setLayoutProperty(
      'sim-optimized',
      'visibility',
      phase === 'refinamiento_2opt' || phase === 'persistencia' || phase === 'preparando_mapa' || phase === 'listo' ? 'visible' : 'none',
    );

    syncContainerMarkers(shouldPulseCriticalContainers(phase));
    updateTruckMarkers(phase, exploreVariant);
  };

  const updateTruckMarkers = (phase: ExecutionPhaseId | null, variant: number) => {
    const map = mapRef.current;
    if (!map) return;

    truckMarkers.forEach((marker) => marker.remove());
    truckMarkers.length = 0;

    if (phase !== 'aco') return;

    const explore = buildExploreRouteFeatures(appState.routes, variant);
    const line = explore.features[0]?.geometry as GeoJSON.LineString | undefined;
    if (!line || line.coordinates.length < 2) return;

    const coords = line.coordinates as [number, number][];
    const tick = truckTick();
    const offsets = [0.15, 0.45, 0.72];

    for (const offset of offsets) {
      const t = (offset + tick * 0.08 + variant * 0.05) % 1;
      const position = interpolateAlongLine(coords, t);
      const marker = new maplibregl.Marker({ element: createTruckMarker() })
        .setLngLat(position)
        .addTo(map);
      truckMarkers.push(marker);
    }
  };

  const syncMapData = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (map.getSource('sectors')) {
      (map.getSource('sectors') as maplibregl.GeoJSONSource).setData(appState.sectors);
    }

    ensureExecutionLayers(map);

    if (showExecutionOverlay()) {
      syncExecutionVisuals();
      return;
    }

    syncStaticRoutes();
    syncContainerMarkers(false);

    truckMarkers.forEach((marker) => marker.remove());
    truckMarkers.length = 0;

    (map.getSource('sim-cost-matrix') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: [],
    });
    (map.getSource('sim-explore') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: [],
    });
    map.setLayoutProperty('sim-cost-matrix-line', 'visibility', 'none');
    map.setLayoutProperty('sim-explore-line', 'visibility', 'none');
    map.setLayoutProperty('sim-current', 'visibility', 'visible');
    map.setLayoutProperty('sim-optimized', 'visibility', 'visible');
    map.setPaintProperty('sectors-fill', 'fill-opacity', 0.07);
    map.setPaintProperty('sectors-line', 'line-opacity', 0.45);
    fitMapToOperationalData(map, { routes: appState.routes });
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

  const handleMapReady = (map: MapLibreMap) => {
    mapRef.current = map;
    mapReady = true;
    setMapInstance(map);
    setupBaseLayers(map);
  };

  createEffect(() => {
    props.hasResults;
    props.executionMode;
    props.executionPhase;
    props.isRunning;
    props.executionProgress;
    props.playbackActive;
    props.playbackRoutes;
    truckTick();
    appState.routes;
    appState.containers;
    appState.sectors;
    syncMapData();
  });

  createEffect(() => {
    const running = props.isRunning && props.executionPhase === 'aco';
    if (exploreTimer) {
      clearInterval(exploreTimer);
      exploreTimer = undefined;
    }
    if (truckFrame) {
      cancelAnimationFrame(truckFrame);
      truckFrame = undefined;
    }

    if (!running) return;

    exploreTimer = setInterval(() => {
      exploreVariant = (exploreVariant + 1) % 4;
      syncExecutionVisuals();
    }, 900);

    const animateTrucks = () => {
      setTruckTick((value) => value + 1);
      truckFrame = requestAnimationFrame(animateTrucks);
    };
    truckFrame = requestAnimationFrame(animateTrucks);

    onCleanup(() => {
      if (exploreTimer) clearInterval(exploreTimer);
      if (truckFrame) cancelAnimationFrame(truckFrame);
      containerMarkers.forEach((marker) => marker.remove());
      truckMarkers.forEach((marker) => marker.remove());
    });
  });

  const activeLegend = () => activeExecutionLegend(props.executionPhase ?? null);
  const mapTitle = () =>
    showExecutionOverlay()
      ? 'Mapa de ejecución del motor'
      : playbackActive()
        ? 'Recorrido simulado (datos reales)'
        : 'Visualización del escenario';

  return (
    <Card padding={false} class="overflow-hidden">
      <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 dark:border-dark-border">
        <div>
          <h3 class="font-heading font-semibold text-text-primary dark:text-white">{mapTitle()}</h3>
          <Show when={showExecutionOverlay() && props.executionPhase}>
            <p class="mt-0.5 text-[11px] text-text-muted">
              Animación sincronizada con la fase actual del algoritmo
            </p>
          </Show>
          <Show when={playbackActive()}>
            <p class="mt-0.5 text-[11px] text-text-muted">
              Playback con geometría vial y paradas del resultado optimizado
            </p>
          </Show>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Show when={props.hasResults && !playbackActive() && props.onOpenPlayback}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              class="gap-1.5"
              loading={props.playbackLoading}
              onClick={() => props.onOpenPlayback?.()}
              data-testid="simulation-open-playback-btn"
            >
              <Play size={14} />
              Ver recorrido
            </Button>
          </Show>
          <Show
            when={showExecutionOverlay()}
          fallback={
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
          }
        >
          <div class="flex flex-wrap items-center gap-3 text-[11px]">
            <For each={EXECUTION_MAP_LEGEND}>
              {(item) => (
                <span
                  class={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 transition-colors ${
                    activeLegend() === item.id
                      ? 'bg-fero-green/15 font-semibold text-fero-green-dark'
                      : 'text-text-muted opacity-60'
                  }`}
                >
                  <span
                    class={`h-0.5 w-5 rounded-full ${
                      item.style === 'solid-green'
                        ? 'bg-fero-green-dark'
                        : item.style === 'dashed-amber'
                          ? 'border-t-2 border-dashed border-amber-500 bg-transparent'
                          : 'border-t-2 border-dashed border-blue-400 bg-transparent'
                    }`}
                  />
                  {item.label}
                </span>
              )}
            </For>
          </div>
        </Show>
        </div>
      </div>

      <div class="relative isolate h-72 bg-slate-100 dark:bg-slate-900 lg:h-85">
        <OperationalMap
          containerClass="touch-none"
          onMapReady={handleMapReady}
          onStyleRestored={() => setupBaseLayers(mapRef.current!)}
        >
        <Show when={playbackActive() && props.playback && props.playbackRoutes}>
          <RoutePlaybackLegend class="absolute bottom-3 left-3 z-10 max-w-[220px]" />
          <RoutePlaybackLayer
            map={mapInstance}
            routes={() => props.playbackRoutes ?? []}
            playback={props.playback!}
            showControls={false}
          />
        </Show>
        <Show when={!appState.dataReady}>
          <div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-surface/50 text-sm text-text-muted backdrop-blur-sm">
            Cargando sectores y contenedores…
          </div>
        </Show>
        <Show when={showExecutionOverlay() && executionOverlayMessage(props.executionPhase ?? null)}>
          {(message) => (
            <div class="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
              <span class="rounded-full border border-border bg-surface/95 px-3 py-1 text-xs font-medium text-text-secondary shadow-sm backdrop-blur-sm dark:bg-dark-surface/95">
                {message()}
              </span>
            </div>
          )}
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
            onClick={() => fitMapToOperationalData(mapRef.current!, { routes: appState.routes })}
            aria-label="Centrar"
          >
            <Crosshair size={14} />
          </button>
        </div>
        </OperationalMap>
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
        <Show when={showExecutionOverlay() && shouldPulseCriticalContainers(props.executionPhase ?? null)}>
          <span class="inline-flex items-center gap-1.5 text-amber-600">
            <Truck size={12} />
            <span>Contenedores críticos / exploración activa</span>
          </span>
        </Show>
      </div>
    </Card>
  );
}
