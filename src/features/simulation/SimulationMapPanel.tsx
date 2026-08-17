import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import { Crosshair, Minus, Play, Plus, Trash2, Truck } from 'lucide-solid';
import { Button, Card } from '../../design-system/components';
import { appState } from '../../core/stores/appStore';
import { OperationalMap } from '../../core/map/OperationalMap';
import { fitMapToOperationalData, fitMapToStudyArea, studyAreaBoundsLike, STUDY_AREA_MIN_ZOOM, STUDY_AREA_SQUARE_FIT_PADDING } from '../../core/map/operationalMapConfig';
import { fillLevelColor } from '../../core/utils/geoUtils';
import { buildContainerPopupHtml } from '../../core/utils/popupHtml';
import type { RoutePlaybackModel } from '../../core/route-playback/routePlaybackTypes';
import type { RoutePlaybackController } from '../../core/route-playback/useRoutePlayback';
import { RoutePlaybackLayer } from '../route-playback/RoutePlaybackLayer';
import { RoutePlaybackLegend } from '../route-playback/RoutePlaybackLegend';
import { mapManualRouteLegend, mapMarkerLegend, mapPlanningMarkerLegend, mapRouteLegend, DEFAULT_PLANNING_CONTAINER_MARKER_SIZE_PX, PLANNING_CONTAINER_MARKER_COLOR, PLANNING_CONTAINER_MARKER_HALO_COLOR, planningContainerCircleMetrics, planningContainerMarkerSizeOptions } from './simulationConfig';
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

const PLANNING_CONTAINERS_SOURCE_ID = 'sim-containers-planning';
const PLANNING_CONTAINERS_HALO_LAYER_ID = 'sim-containers-planning-halo';
const PLANNING_CONTAINERS_LAYER_ID = 'sim-containers-planning-circle';

function trashSvg(color: string, size = 12) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
}

function createContainerMarker(color: string, pulse = false, large = false) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = pulse ? 'sim-marker sim-marker--pulse' : 'sim-marker';
  const size = large ? 40 : 24;
  const icon = large ? 20 : 12;
  const border = large ? 2.5 : 2;
  el.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:${color};box-shadow:0 2px 10px rgba(0,0,0,.28);border:${border}px solid #fff">${trashSvg('#fff', icon)}</span>`;
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
  squareLayout?: boolean;
  largeMap?: boolean;
  studyAreaFit?: boolean;
  showBaselineRoute?: boolean;
  uniformContainers?: boolean;
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
  let planningContainerPopupsBound = false;
  const [containerMarkerSizePx, setContainerMarkerSizePx] = createSignal(
    DEFAULT_PLANNING_CONTAINER_MARKER_SIZE_PX,
  );
  const [truckTick, setTruckTick] = createSignal(0);

  const containerCircleMetrics = () => planningContainerCircleMetrics(containerMarkerSizePx());

  const showExecutionOverlay = () =>
    Boolean(
      props.executionMode &&
        props.isRunning &&
        props.executionPhase &&
        props.executionPhase !== 'listo',
    );

  const playbackActive = () => Boolean(props.playbackActive && props.playback && props.playbackRoutes?.length);

  const baselineRouteFeatures = () =>
    appState.routes.features
      .filter((feature) => feature.properties.type === 'current')
      .map((feature) => ({
        ...feature,
        properties: { ...feature.properties, kind: feature.properties.type },
      }));

  const visibleRouteFeatures = () => {
    if (props.hasResults) {
      return appState.routes.features.map((feature) => ({
        ...feature,
        properties: { ...feature.properties, kind: feature.properties.type },
      }));
    }
    if (props.showBaselineRoute) {
      return baselineRouteFeatures();
    }
    return [];
  };

  const fitMapView = () => {
    const map = mapRef.current;
    if (!map) return;
    if (props.studyAreaFit) {
      fitMapToStudyArea(map, {
        sectors: appState.sectors,
        padding: props.squareLayout ? STUDY_AREA_SQUARE_FIT_PADDING : 64,
      });
      return;
    }
    fitMapToOperationalData(map, { routes: appState.routes });
  };

  const studyAreaMaxBounds = () =>
    props.studyAreaFit ? studyAreaBoundsLike(appState.sectors) : undefined;

  const bindPlanningContainerPopups = (map: MapLibreMap) => {
    if (planningContainerPopupsBound) return;
    planningContainerPopupsBound = true;

    map.on('click', PLANNING_CONTAINERS_LAYER_ID, (event) => {
      const mapFeature = event.features?.[0];
      if (!mapFeature) return;
      const containerId = mapFeature.properties?.id;
      const container = appState.containers.features.find(
        (feature) => feature.properties.id === containerId,
      );
      if (!container) return;

      new maplibregl.Popup({ offset: 16, maxWidth: '260px' })
        .setLngLat(event.lngLat)
        .setHTML(buildContainerPopupHtml(container))
        .addTo(map);
    });

    map.on('mouseenter', PLANNING_CONTAINERS_LAYER_ID, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', PLANNING_CONTAINERS_LAYER_ID, () => {
      map.getCanvas().style.cursor = '';
    });
  };

  const planningContainerBeforeId = (map: MapLibreMap) =>
    map.getLayer('sim-current') ? 'sim-current' : map.getLayer('sim-cost-matrix-line') ? 'sim-cost-matrix-line' : undefined;

  const applyPlanningContainerPaint = (map: MapLibreMap) => {
    const metrics = containerCircleMetrics();
    if (map.getLayer(PLANNING_CONTAINERS_HALO_LAYER_ID)) {
      map.setPaintProperty(PLANNING_CONTAINERS_HALO_LAYER_ID, 'circle-radius', metrics.haloRadius);
      map.setPaintProperty(PLANNING_CONTAINERS_HALO_LAYER_ID, 'circle-color', PLANNING_CONTAINER_MARKER_HALO_COLOR);
    }
    if (map.getLayer(PLANNING_CONTAINERS_LAYER_ID)) {
      map.setPaintProperty(PLANNING_CONTAINERS_LAYER_ID, 'circle-radius', metrics.radius);
      map.setPaintProperty(PLANNING_CONTAINERS_LAYER_ID, 'circle-color', PLANNING_CONTAINER_MARKER_COLOR);
      map.setPaintProperty(PLANNING_CONTAINERS_LAYER_ID, 'circle-stroke-width', metrics.strokeWidth);
    }
  };

  const ensurePlanningContainerLayer = (map: MapLibreMap) => {
    if (!map.getSource(PLANNING_CONTAINERS_SOURCE_ID)) {
      map.addSource(PLANNING_CONTAINERS_SOURCE_ID, {
        type: 'geojson',
        data: appState.containers,
      });
      const beforeId = planningContainerBeforeId(map);
      const metrics = containerCircleMetrics();
      map.addLayer(
        {
          id: PLANNING_CONTAINERS_HALO_LAYER_ID,
          type: 'circle',
          source: PLANNING_CONTAINERS_SOURCE_ID,
          paint: {
            'circle-radius': metrics.haloRadius,
            'circle-color': PLANNING_CONTAINER_MARKER_HALO_COLOR,
            'circle-opacity': 1,
          },
        },
        beforeId,
      );
      map.addLayer(
        {
          id: PLANNING_CONTAINERS_LAYER_ID,
          type: 'circle',
          source: PLANNING_CONTAINERS_SOURCE_ID,
          paint: {
            'circle-radius': metrics.radius,
            'circle-color': PLANNING_CONTAINER_MARKER_COLOR,
            'circle-stroke-width': metrics.strokeWidth,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 1,
          },
        },
        beforeId,
      );
      bindPlanningContainerPopups(map);
    }
    applyPlanningContainerPaint(map);
  };

  const syncPlanningContainerLayer = (map: MapLibreMap) => {
    ensurePlanningContainerLayer(map);
    (map.getSource(PLANNING_CONTAINERS_SOURCE_ID) as maplibregl.GeoJSONSource).setData(
      appState.containers,
    );
    map.setLayoutProperty(PLANNING_CONTAINERS_HALO_LAYER_ID, 'visibility', 'visible');
    map.setLayoutProperty(PLANNING_CONTAINERS_LAYER_ID, 'visibility', 'visible');
  };

  const hidePlanningContainerLayer = (map: MapLibreMap) => {
    if (map.getLayer(PLANNING_CONTAINERS_HALO_LAYER_ID)) {
      map.setLayoutProperty(PLANNING_CONTAINERS_HALO_LAYER_ID, 'visibility', 'none');
    }
    if (map.getLayer(PLANNING_CONTAINERS_LAYER_ID)) {
      map.setLayoutProperty(PLANNING_CONTAINERS_LAYER_ID, 'visibility', 'none');
    }
  };

  const syncStaticRoutes = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || showExecutionOverlay()) return;

    const routeFeatures = visibleRouteFeatures();

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
        map.setLayoutProperty('sim-optimized', 'visibility', props.hasResults ? 'visible' : 'none');
      }
      if (map.getLayer('sim-current')) {
        map.setLayoutProperty('sim-current', 'visibility', routeFeatures.length > 0 ? 'visible' : 'none');
      }
    }
  };

  const syncContainerMarkers = (pulseCritical: boolean) => {
    containerMarkers.forEach((marker) => marker.remove());
    containerMarkers.length = 0;

    const map = mapRef.current;
    if (!map) return;

    if (props.uniformContainers) {
      syncPlanningContainerLayer(map);
      return;
    }

    hidePlanningContainerLayer(map);

    const largeMarkers = Boolean(props.largeMap);

    for (const feature of appState.containers.features) {
      const color = fillLevelColor(feature.properties.fillLevel);
      const pulse =
        pulseCritical &&
        isCriticalContainer(feature.properties.fillLevel, feature.properties.priority);
      const marker = new maplibregl.Marker({ element: createContainerMarker(color, pulse, largeMarkers) })
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
    const mergedRouteFeatures =
      props.showBaselineRoute && !props.hasResults
        ? [
            ...baselineRouteFeatures().filter(
              (baseline) => !routeFeatures.some((feature) => feature.properties?.kind === 'current'),
            ),
            ...routeFeatures,
          ]
        : routeFeatures;

    (map.getSource('sim-routes') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: mergedRouteFeatures,
    });

    map.setLayoutProperty('sim-cost-matrix-line', 'visibility', showCostMatrix ? 'visible' : 'none');
    map.setLayoutProperty('sim-explore-line', 'visibility', showExplore ? 'visible' : 'none');
    map.setLayoutProperty('sim-current', 'visibility', mergedRouteFeatures.some((f) => f.properties?.kind === 'current') ? 'visible' : 'none');
    map.setLayoutProperty(
      'sim-optimized',
      'visibility',
      props.hasResults &&
        (phase === 'refinamiento_2opt' ||
          phase === 'persistencia' ||
          phase === 'preparando_mapa' ||
          phase === 'listo')
        ? 'visible'
        : 'none',
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
    map.setLayoutProperty('sim-current', 'visibility', visibleRouteFeatures().length > 0 ? 'visible' : 'none');
    map.setLayoutProperty('sim-optimized', 'visibility', props.hasResults ? 'visible' : 'none');
    map.setPaintProperty('sectors-fill', 'fill-opacity', 0.07);
    map.setPaintProperty('sectors-line', 'line-opacity', 0.45);
    fitMapView();
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
    if (props.studyAreaFit) {
      requestAnimationFrame(() => {
        map.resize();
        fitMapView();
      });
    }
  };

  createEffect(() => {
    props.hasResults;
    props.executionMode;
    props.squareLayout;
    props.largeMap;
    props.studyAreaFit;
    props.showBaselineRoute;
    props.uniformContainers;
    containerMarkerSizePx();
    props.executionPhase;
    props.isRunning;
    props.executionProgress;
    props.playbackActive;
    props.playbackRoutes;
    truckTick();
    appState.routes;
    appState.containers;
    appState.sectors;
    appState.dataReady;
    syncMapData();
  });

  createEffect(() => {
    if (!props.uniformContainers) return;
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!map.getLayer(PLANNING_CONTAINERS_LAYER_ID)) return;
    containerMarkerSizePx();
    applyPlanningContainerPaint(map);
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
  const staticRouteLegend = () =>
    props.showBaselineRoute && !props.hasResults ? mapManualRouteLegend : mapRouteLegend;

  const markerLegend = () => (props.uniformContainers ? mapPlanningMarkerLegend : mapMarkerLegend);

  const mapContainerClass = () => {
    if (props.largeMap && props.squareLayout) {
      return 'aspect-square w-full min-h-[min(52vw,42rem)] max-h-[min(78vh,48rem)]';
    }
    if (props.squareLayout) {
      return 'mx-auto aspect-square w-full max-w-3xl';
    }
    return 'h-72 lg:h-85';
  };

  const mapTitle = () => {
    if (showExecutionOverlay()) return 'Mapa de ejecución del motor';
    if (playbackActive()) return 'Recorrido simulado (datos reales)';
    if (props.showBaselineRoute && !props.hasResults) {
      return 'Área de estudio — Unare';
    }
    return 'Visualización del escenario';
  };

  const mapSubtitle = () => {
    if (showExecutionOverlay() && props.executionPhase) {
      return 'Animación sincronizada con la fase actual del algoritmo';
    }
    if (playbackActive()) {
      return 'Playback con geometría vial y paradas del resultado optimizado';
    }
    if (props.showBaselineRoute && !props.hasResults) {
      return 'Ruta planificada a mano del municipio — referencia antes de optimizar';
    }
    return null;
  };

  return (
    <Card padding={false} class="overflow-hidden">
      <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 dark:border-dark-border">
        <div>
          <h3 class="font-heading font-semibold text-text-primary dark:text-white">{mapTitle()}</h3>
          <Show when={mapSubtitle()}>
            <p class="mt-0.5 text-[11px] text-text-muted">{mapSubtitle()}</p>
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
              <For each={staticRouteLegend()}>
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

      <div
        class={`relative isolate bg-slate-100 dark:bg-slate-900 ${mapContainerClass()}`}
        data-testid={props.squareLayout ? 'simulation-map-square' : undefined}
      >
        <OperationalMap
          containerClass="touch-none"
          minZoom={props.studyAreaFit ? STUDY_AREA_MIN_ZOOM : undefined}
          maxBounds={studyAreaMaxBounds()}
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
            onClick={() => fitMapView()}
            aria-label="Centrar"
          >
            <Crosshair size={14} />
          </button>
        </div>
        </OperationalMap>
      </div>

      <div class="flex shrink-0 flex-col gap-3 border-t border-border px-4 py-2.5 dark:border-dark-border">
        <Show when={props.uniformContainers}>
          <div
            class="flex flex-col gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-dark-border"
            data-testid="container-marker-size-control"
          >
            <div class="min-w-0">
              <p class="text-xs font-semibold text-text-primary dark:text-white">Tamaño de contenedores</p>
              <p class="text-[11px] text-text-muted">
                Ajusta el diámetro en pantalla para elegir el valor adecuado con este zoom.
              </p>
            </div>
            <div class="flex w-full flex-col gap-2 sm:max-w-md">
              <div class="flex items-center gap-3">
                <input
                  type="range"
                  min={16}
                  max={200}
                  step={4}
                  value={containerMarkerSizePx()}
                  onInput={(event) => setContainerMarkerSizePx(Number(event.currentTarget.value))}
                  class="h-2 min-w-0 flex-1 cursor-pointer accent-fero-green-dark"
                  aria-label="Tamaño de contenedores en píxeles"
                  data-testid="container-marker-size-slider"
                />
                <span class="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-text-primary dark:text-white">
                  {containerMarkerSizePx()} px
                </span>
              </div>
              <select
                value={String(containerMarkerSizePx())}
                onChange={(event) => setContainerMarkerSizePx(Number(event.currentTarget.value))}
                class="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs dark:border-dark-border dark:bg-dark-surface-hover dark:text-white"
                data-testid="container-marker-size-select"
              >
                <For each={planningContainerMarkerSizeOptions}>
                  {(option) => <option value={option.value}>{option.label}</option>}
                </For>
              </select>
            </div>
          </div>
        </Show>
        <div class="flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-secondary">
        <For each={markerLegend()}>
          {(item) => (
            <span class={`inline-flex items-center gap-1.5 ${item.class}`}>
              <Show
                when={props.uniformContainers}
                fallback={
                  <>
                    <Trash2 size={12} />
                    <span class="text-text-secondary">{item.label}</span>
                  </>
                }
              >
                <span
                  class="inline-block rounded-full border-2 border-white shadow-sm"
                  style={{
                    width: `${Math.min(containerMarkerSizePx() / 4, 28)}px`,
                    height: `${Math.min(containerMarkerSizePx() / 4, 28)}px`,
                    background: PLANNING_CONTAINER_MARKER_COLOR,
                  }}
                  aria-hidden="true"
                />
                <span class="text-text-secondary">{item.label}</span>
              </Show>
            </span>
          )}
        </For>
        <Show
          when={
            !props.uniformContainers &&
            showExecutionOverlay() &&
            shouldPulseCriticalContainers(props.executionPhase ?? null)
          }
        >
          <span class="inline-flex items-center gap-1.5 text-amber-600">
            <Truck size={12} />
            <span>Contenedores críticos / exploración activa</span>
          </span>
        </Show>
        </div>
      </div>
    </Card>
  );
}
