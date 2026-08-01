import { For, Show, createEffect, createResource, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { A, useSearchParams } from '@solidjs/router';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Menu,
  Search,
  Filter,
  Layers,
  BookOpen,
  Ruler,
  Printer,
  Bell,
  Maximize2,
  LogOut,
  Sun,
  Moon,
  Plus,
  Minus,
  Crosshair,
  Trash2,
  Truck,
  Route,
  X,
  Fuel,
  Landmark,
  ChevronDown,
} from 'lucide-solid';
import { Button } from '../../design-system/components';
import {
  appState,
  toggleSidebar,
  toggleDarkMode,
  initAppData,
} from '../../core/stores/appStore';
import { dashboardSummary } from '../../core/stores/dashboardStore';
import { fetchMapContext, MAP_CONTEXT_POLL_MS } from '../../core/api/map';
import {
  ensureOperationalRouteLayer,
  syncContainerMarkers,
  syncFleetMarkers,
  vehicleStatusKey,
} from '../../core/map/operationalMapLayers';
import { UNARE_CENTER, UNARE_ZOOM } from '../../data/types/geo';
import { buildContainerPopupHtml } from '../../core/utils/popupHtml';
import { mapStylesById, mapStyleForTheme, themeBaseStyleId } from '../../core/utils/mapStyle';
import {
  mapBaseStyles,
  mapLayers,
  mapLegend,
  initialLayerState,
  type MapBaseStyleId,
} from '../../data/mock/mapGis';

const toneIconBg = {
  green: 'bg-fero-green/15 text-fero-green-dark',
  red: 'bg-red-50 text-red-500',
  amber: 'bg-amber-50 text-amber-500',
  blue: 'bg-fero-blue/10 text-fero-blue',
};

function trashSvg(color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
}

function truckSvg(color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>`;
}

function createPinEl(bg: string, svg: string) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'gis-marker';
  el.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:${bg};box-shadow:0 2px 8px rgba(0,0,0,.25);border:2px solid #fff">${svg}</span>`;
  return el;
}

export default function MapPage() {
  let mapContainer!: HTMLDivElement;
  const mapRef: { current?: MapLibreMap } = {};
  const vehicleMarkersById = new Map<string, Marker>();
  const containerMarkers: Marker[] = [];
  const [searchParams] = useSearchParams();
  const [mapContext, { refetch }] = createResource(fetchMapContext);

  const focusVehicleId = () => {
    const value = searchParams.vehicle;
    if (typeof value === 'string' && value.trim()) return value.trim().toUpperCase();
    if (Array.isArray(value) && value[0]) return value[0].trim().toUpperCase();
    return undefined;
  };

  const [layersOpen, setLayersOpen] = createSignal(true);
  const [legendOpen, setLegendOpen] = createSignal(true);
  const [baseStyle, setBaseStyle] = createSignal<MapBaseStyleId>(
    themeBaseStyleId(appState.darkMode),
  );
  const [coords, setCoords] = createSignal({ lng: UNARE_CENTER[0], lat: UNARE_CENTER[1], zoom: UNARE_ZOOM });
  const [layerState, setLayerState] = createSignal<Record<string, boolean>>(initialLayerState());
  const [mapReady, setMapReady] = createSignal(false);

  const mapMetrics = () =>
    mapContext()?.mapMetrics?.length
      ? mapContext()!.mapMetrics
      : dashboardSummary().mapMetrics?.length
        ? dashboardSummary().mapMetrics!
        : [];

  const operationalRoutes = () => mapContext()?.routes ?? { type: 'FeatureCollection', features: [] };
  const operationalContainers = () => mapContext()?.containers ?? { type: 'FeatureCollection', features: [] };
  const operationalFleet = () => mapContext()?.vehicles ?? [];

  const getMap = () => mapRef.current;

  const zoomIn = () => getMap()?.zoomIn({ duration: 300 });
  const zoomOut = () => getMap()?.zoomOut({ duration: 300 });
  const locateUser = () => {
    const map = getMap();
    if (!map) return;
    if (!navigator.geolocation) {
      map.flyTo({ center: UNARE_CENTER, zoom: UNARE_ZOOM });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 15,
          essential: true,
        });
      },
      () => map.flyTo({ center: UNARE_CENTER, zoom: UNARE_ZOOM }),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const toggleLayerItem = (id: string) => {
    let enablingSatellite = false;
    let disablingSatellite = false;

    setLayerState((prev) => {
      const enabled = !prev[id];
      const next = { ...prev, [id]: enabled };
      const parent = mapLayers.find((l) => l.id === id);
      if (parent?.children) {
        for (const child of parent.children) {
          next[child.id] = enabled;
        }
      }
      if (id === 'satellite') {
        enablingSatellite = enabled;
        disablingSatellite = !enabled;
      }
      return next;
    });

    if (enablingSatellite) changeBaseStyle('satelital');
    if (disablingSatellite && baseStyle() === 'satelital') {
      changeBaseStyle(themeBaseStyleId(appState.darkMode));
    }
  };

  const clearOperationalMarkers = () => {
    vehicleMarkersById.forEach((marker) => marker.remove());
    vehicleMarkersById.clear();
    containerMarkers.forEach((marker) => marker.remove());
    containerMarkers.length = 0;
  };

  const syncOverlayLayers = () => {
    const map = getMap();
    if (!map) return;
    const state = layerState();

    const setVis = (id: string, visible: boolean) => {
      if (!map.getLayer(id)) return;
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    };

    // Base raster (calles / satélite vía estilo)
    setVis('base-tiles-layer', state.streets || state.satellite);

    setVis('sectors-fill', state.sectors || state.neighborhoods);
    setVis('sectors-line', state.sectors || state.neighborhoods);
    if (map.getLayer('sectors-fill')) {
      map.setPaintProperty(
        'sectors-fill',
        'fill-opacity',
        state.neighborhoods && !state.sectors ? 0.14 : 0.08,
      );
    }

    const routesVisible = state.routes;
    setVis('operational-routes-line', routesVisible);
    if (map.getSource('operational-routes')) {
      const routes = routesVisible
        ? operationalRoutes()
        : { type: 'FeatureCollection' as const, features: [] };
      ensureOperationalRouteLayer(map, routes);
    }

    if (state.containers) {
      const visibleBuckets = new Set<string>();
      if (state['bin-critical']) visibleBuckets.add('critical');
      if (state['bin-full']) visibleBuckets.add('full');
      if (state['bin-normal']) visibleBuckets.add('normal');
      if (state['bin-partial']) visibleBuckets.add('partial');

      syncContainerMarkers(map, operationalContainers(), containerMarkers, {
        visibleBuckets,
        createMarkerElement: (color) => createPinEl(color, trashSvg('#fff')),
        buildPopupHtml: buildContainerPopupHtml,
      });
    } else {
      containerMarkers.forEach((marker) => marker.remove());
      containerMarkers.length = 0;
    }

    if (state.vehicles) {
      const focusedId = focusVehicleId();
      const filteredFleet = operationalFleet().filter((vehicle) => {
        const statusKey = `veh-${vehicleStatusKey(vehicle.status)}`;
        return state[statusKey];
      });

      syncFleetMarkers(map, filteredFleet, vehicleMarkersById, {
        createMarkerElement: (vehicle) => {
          const isFocused = focusedId === vehicle.id;
          const el = createPinEl(vehicle.color, truckSvg('#fff'));
          el.title = vehicle.id;
          if (isFocused) {
            el.style.transform = 'scale(1.2)';
            el.style.zIndex = '10';
          }
          return el;
        },
        buildPopupHtml: (vehicle) =>
          `<strong>${vehicle.id}</strong><br/><span style="font-size:12px;color:#64748b">${vehicle.status.replace('_', ' ')}</span>`,
      });

      if (focusedId) {
        const focused = filteredFleet.find((vehicle) => vehicle.id === focusedId);
        const marker = vehicleMarkersById.get(focusedId);
        if (focused && marker) {
          map.flyTo({
            center: [focused.lng, focused.lat],
            zoom: Math.max(map.getZoom(), 14),
            essential: true,
          });
          const popup = marker.getPopup();
          if (popup && !popup.isOpen()) marker.togglePopup();
        }
      }
    } else {
      vehicleMarkersById.forEach((marker) => marker.remove());
      vehicleMarkersById.clear();
    }
  };

  const addDataLayers = () => {
    const map = getMap();
    if (!map) return;

    if (!map.getSource('sectors')) {
      map.addSource('sectors', { type: 'geojson', data: appState.sectors });
      map.addLayer({
        id: 'sectors-fill',
        type: 'fill',
        source: 'sectors',
        paint: { 'fill-color': '#1143F3', 'fill-opacity': 0.08 },
      });
      map.addLayer({
        id: 'sectors-line',
        type: 'line',
        source: 'sectors',
        paint: { 'line-color': '#232AB6', 'line-width': 1.5, 'line-opacity': 0.5 },
      });
    }

    ensureOperationalRouteLayer(map, operationalRoutes());
    syncOverlayLayers();
  };

  onMount(() => {
    void initAppData();
    const map = new maplibregl.Map({
      container: mapContainer,
      style: mapStyleForTheme(appState.darkMode),
      center: UNARE_CENTER,
      zoom: UNARE_ZOOM,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    const resizeMap = () => mapRef.current?.resize();
    map.on('load', () => {
      resizeMap();
      addDataLayers();
      setMapReady(true);
      requestAnimationFrame(resizeMap);
    });
    map.on('move', () => {
      const m = mapRef.current;
      if (!m) return;
      const c = m.getCenter();
      setCoords({ lng: +c.lng.toFixed(5), lat: +c.lat.toFixed(5), zoom: +m.getZoom().toFixed(1) });
    });

    const ro = new ResizeObserver(() => resizeMap());
    ro.observe(mapContainer);

    const pollTimer = window.setInterval(() => {
      void refetch();
    }, MAP_CONTEXT_POLL_MS);

    onCleanup(() => {
      window.clearInterval(pollTimer);
      ro.disconnect();
    });
  });

  createEffect(() => {
    focusVehicleId();
    if (getMap()?.isStyleLoaded()) syncOverlayLayers();
  });

  createEffect(() => {
    if (appState.showOptimizedOnly) {
      setLayerState((state) => ({
        ...state,
        routes: true,
      }));
    }
    layerState();
    mapContext();
    if (getMap()?.isStyleLoaded()) syncOverlayLayers();
  });

  createEffect(() => {
    const sectors = appState.sectors;
    const map = getMap();
    if (map?.getSource('sectors') && sectors.features.length > 0) {
      (map.getSource('sectors') as maplibregl.GeoJSONSource).setData(sectors);
    }
  });

  createEffect(() => {
    const dark = appState.darkMode;
    if (!mapReady()) return;
    const style = baseStyle();
    if (style === 'satelital' || style === 'terreno') return;
    const next = themeBaseStyleId(dark);
    if (style !== next) changeBaseStyle(next);
  });

  onCleanup(() => {
    clearOperationalMarkers();
    mapRef.current?.remove();
    mapRef.current = undefined;
    setMapReady(false);
  });

  const changeBaseStyle = (id: MapBaseStyleId) => {
    setBaseStyle(id);
    const map = getMap();
    if (!map) return;
    clearOperationalMarkers();
    map.setStyle(mapStylesById[id]);
    map.once('style.load', () => {
      map.resize();
      addDataLayers();
    });
  };

  return (
    <div class="relative h-full min-h-0 overflow-hidden bg-slate-100 dark:bg-slate-900">
      {/* Full-bleed map — UI floats above it */}
      <div ref={mapContainer} class="absolute inset-0 h-full w-full" />

      {/* Toolbar overlay */}
      <header class="absolute inset-x-0 top-0 z-20 flex flex-wrap items-center gap-2 border-b border-border/60 bg-surface/90 px-3 py-2 shadow-sm backdrop-blur-md dark:bg-dark-surface/90 dark:border-dark-border">
        <button
          type="button"
          onClick={toggleSidebar}
          class="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover"
          aria-label="Menú"
        >
          <Menu size={20} />
        </button>

        <div class="relative min-w-0 flex-1 md:max-w-sm">
          <Search size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            placeholder="Buscar dirección o lugar"
            class="w-full rounded-md border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-fero-blue focus:outline-none focus:ring-2 focus:ring-fero-blue/20 dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
          />
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          <ToolBtn icon={<Filter size={16} />} label="Filtros" />
          <ToolBtn
            icon={<Layers size={16} />}
            label="Capas"
            active={layersOpen()}
            onClick={() => setLayersOpen((v) => !v)}
          />
          <ToolBtn
            icon={<BookOpen size={16} />}
            label="Leyenda"
            active={legendOpen()}
            onClick={() => setLegendOpen((v) => !v)}
          />
          <ToolBtn icon={<Ruler size={16} />} label="Medir" class="hidden sm:inline-flex" />
          <ToolBtn icon={<Printer size={16} />} label="Imprimir" class="hidden md:inline-flex" />
        </div>

        <div class="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleDarkMode}
            class="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover"
            aria-label="Tema"
          >
            {appState.darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            type="button"
            class="relative flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover"
            aria-label="Notificaciones"
          >
            <Bell size={18} />
            <span class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {dashboardSummary().notifications}
            </span>
          </button>
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover"
            aria-label="Pantalla completa"
            onClick={() => document.documentElement.requestFullscreen?.()}
          >
            <Maximize2 size={18} />
          </button>
          <A href="/login">
            <Button variant="gradient" size="sm" icon={<LogOut size={14} />}>
              Salir
            </Button>
          </A>
        </div>
      </header>

      <Show when={layersOpen()}>
        <aside class="absolute top-16 left-3 z-20 w-64 rounded-lg border border-border bg-surface/95 p-3 shadow-lg backdrop-blur-md dark:bg-dark-surface/95 dark:border-dark-border">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="font-heading text-sm font-semibold text-text-primary dark:text-white">Capas</h3>
            <button type="button" class="text-text-muted hover:text-text-secondary" onClick={() => setLayersOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <ul class="space-y-1">
            <For each={mapLayers}>
              {(layer) => (
                <li>
                  <label class="flex cursor-pointer items-center gap-2 py-0.5 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      class="size-4 rounded border-border accent-fero-green-dark"
                      checked={layerState()[layer.id]}
                      onChange={() => toggleLayerItem(layer.id)}
                    />
                    {layer.label}
                  </label>
                  <Show when={layer.children && layerState()[layer.id]}>
                    <ul class="mt-1 mb-1.5 ml-6 space-y-1 border-l border-border pl-2.5">
                      <For each={layer.children}>
                        {(child) => (
                          <li>
                            <label class="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
                              <input
                                type="checkbox"
                                class="size-3.5 rounded border-border accent-fero-green-dark"
                                checked={layerState()[child.id]}
                                onChange={() => toggleLayerItem(child.id)}
                              />
                              <Show when={child.kind === 'line'}>
                                <span class={`h-1 w-4 shrink-0 rounded-full ${child.class}`} />
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
          <button type="button" class="mt-3 inline-flex items-center gap-1 text-sm font-medium text-fero-blue hover:underline">
            <Plus size={14} />
            Agregar capa
          </button>
        </aside>
      </Show>

      <Show when={legendOpen()}>
        <aside class="absolute top-16 right-3 z-20 w-52 rounded-lg border border-border bg-surface/95 p-3 shadow-lg backdrop-blur-md dark:bg-dark-surface/95 dark:border-dark-border">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="font-heading text-sm font-semibold text-text-primary dark:text-white">Leyenda</h3>
            <button type="button" class="text-text-muted hover:text-text-secondary" onClick={() => setLegendOpen(false)}>
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

      <div class="absolute right-3 bottom-36 z-20 flex flex-col gap-2 sm:bottom-32">
        <div class="flex flex-col overflow-hidden rounded-lg border border-border bg-surface/95 shadow-md backdrop-blur-md dark:bg-dark-surface/95">
          <button type="button" class="flex h-9 w-9 items-center justify-center text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-40" onClick={zoomIn} disabled={!mapReady()} aria-label="Acercar">
            <Plus size={16} />
          </button>
          <button type="button" class="flex h-9 w-9 items-center justify-center border-t border-border text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-40" onClick={zoomOut} disabled={!mapReady()} aria-label="Alejar">
            <Minus size={16} />
          </button>
        </div>
        <button type="button" class="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface/95 text-text-secondary shadow-md backdrop-blur-md transition-colors hover:bg-surface-hover disabled:opacity-40 dark:bg-dark-surface/95" onClick={locateUser} disabled={!mapReady()} aria-label="Mi ubicación" title="Centrar en mi ubicación">
          <Crosshair size={16} />
        </button>
      </div>

      <div class="absolute bottom-44 left-3 z-20 rounded-md border border-border bg-surface/95 px-2.5 py-1 text-[11px] font-bold text-text-secondary shadow-sm backdrop-blur-md dark:bg-dark-surface/95 sm:bottom-40">
        {coords().lat}, {coords().lng} · z{coords().zoom}
      </div>

      <div class="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3">
        <div class="pointer-events-auto flex flex-col gap-3 lg:flex-row lg:items-end">
          <div class="w-full shrink-0 rounded-xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur-md dark:bg-dark-surface/95 dark:border-dark-border lg:w-auto">
            <div class="mb-2 flex items-center gap-1">
              <p class="text-sm font-semibold text-text-primary dark:text-white">Mapa base</p>
              <ChevronDown size={14} class="text-text-muted" />
            </div>
            <div class="flex gap-2">
              <For each={[...mapBaseStyles]}>
                {(style) => (
                  <button type="button" class="group flex w-18 flex-col items-center gap-1" onClick={() => changeBaseStyle(style.id)}>
                    <span class={`h-14 w-18 overflow-hidden rounded-md border-2 ${baseStyle() === style.id ? 'border-red-500' : 'border-border'}`}>
                      <img src={style.preview} alt={style.label} class="h-full w-full object-cover" loading="lazy" referrerpolicy="no-referrer" />
                    </span>
                    <span class="text-[10px] text-text-muted group-hover:text-text-secondary">{style.label}</span>
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class="min-w-0 flex-1 rounded-xl border border-border bg-surface/95 px-3 py-2.5 shadow-lg backdrop-blur-md dark:bg-dark-surface/95 dark:border-dark-border">
            <div class="grid grid-cols-2 content-center gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <For each={mapMetrics()}>
                {(metric) => (
                  <div class="flex items-center gap-3">
                    <span class={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneIconBg[metric.tone as keyof typeof toneIconBg] ?? toneIconBg.blue}`}>
                      <Show when={metric.icon === 'trash'}><Trash2 size={18} /></Show>
                      <Show when={metric.icon === 'truck'}><Truck size={18} /></Show>
                      <Show when={metric.icon === 'route'}><Route size={18} /></Show>
                    </span>
                    <div class="min-w-0">
                      <p class="truncate text-[11px] text-text-muted">{metric.label}</p>
                      <p class="font-heading text-lg font-bold leading-tight text-text-primary dark:text-white">{metric.value}</p>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolBtn(props: {
  icon: JSX.Element;
  label: string;
  active?: boolean;
  onClick?: () => void;
  class?: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        props.active
          ? 'border-fero-green-dark/40 bg-fero-green/15 text-fero-green-dark'
          : 'border-border text-text-secondary hover:bg-surface-hover'
      } ${props.class ?? ''}`}
    >
      {props.icon}
      <span class="hidden lg:inline">{props.label}</span>
    </button>
  );
}
