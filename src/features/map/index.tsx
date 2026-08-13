import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
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
import { fetchOperatorRouteSnapshot } from '../../core/api/operator';
import { fetchResidentOverview } from '../../core/api/resident';
import { isConductor, isResident } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { fleetForOperatorField } from '../../core/operator/operatorMonitoringUx';
import { parseVehicleIdParam } from '../../core/operator/operatorDeepLinks';
import {
  ensureOperatorRouteLayer,
  fitMapToStops,
  routeCollectionFromStops,
  syncNextStopMarker,
  OPERATOR_ROUTE_GLOW_LAYER_ID,
  OPERATOR_ROUTE_LAYER_ID,
} from '../../core/map/operatorRouteMapLayers';
import {
  containersFromResidentPoints,
  ensureResidentSectorHighlight,
  ensureResidentSectorRouteLayer,
  filterRoutesForSector,
  findSectorFeature,
  fitMapToSector,
  parseResidentMapFocus,
  parseResidentScope,
  residentMapMetrics,
  resolveResidentNextStop,
  resolveResidentTruck,
  syncResidentNextStopMarker,
  RESIDENT_SECTOR_HIGHLIGHT_FILL_ID,
  RESIDENT_SECTOR_HIGHLIGHT_LINE_ID,
  RESIDENT_SECTOR_ROUTE_GLOW_LAYER_ID,
  RESIDENT_SECTOR_ROUTE_LAYER_ID,
} from '../../core/map/residentSectorMapLayers';
import {
  ensureOperationalRouteLayer,
  syncContainerMarkers,
  syncFleetMarkers,
  vehicleStatusKey,
  enabledOperationalRouteIds,
  routeLayerStateKey,
  syncOperationalRouteLayerFilters,
  type OperationalRouteFeatureProps,
} from '../../core/map/operationalMapLayers';
import {
  createOperationalMapOptions,
  fitMapToOperationalData,
  operationalMapContextFilters,
} from '../../core/map/operationalMapConfig';
import { UNARE_CENTER, UNARE_ZOOM } from '../../data/types/geo';
import { residentHubHref, residentPointsHref } from '../../core/resident/residentDeepLinks';
import { ResidentBreadcrumbs } from '../resident/ResidentBreadcrumbs';
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

function buildResidentContainerPopupHtml(container: Parameters<typeof buildContainerPopupHtml>[0]) {
  return `${buildContainerPopupHtml(container)}<p style="margin:8px 0 0;font-size:10px;color:#94a3b8;">Vista de consulta — solo lectura</p>`;
}

export default function MapPage() {
  let mapContainer!: HTMLDivElement;
  const mapRef: { current?: MapLibreMap } = {};
  const vehicleMarkersById = new Map<string, Marker>();
  const containerMarkers: Marker[] = [];
  const [searchParams] = useSearchParams();
  const residentScope = () => parseResidentScope(searchParams.scope);
  const residentMode = () => isResident(authUser()?.role) && residentScope();
  const [residentOverview, { refetch: refetchResidentOverview }] = createResource(
    () => (residentMode() ? 'resident-map' : null),
    () => fetchResidentOverview(),
  );
  const mapContextSource = createMemo(() => {
    if (residentMode()) {
      const sector = residentOverview()?.sectorName ?? authUser()?.sectorName ?? undefined;
      return sector ? ({ mode: 'sector' as const, sector } as const) : null;
    }
    return { mode: 'global' as const } as const;
  });
  const [mapContext, { refetch }] = createResource(mapContextSource, (source) => {
    if (!source) return Promise.resolve(undefined);
    if (source.mode === 'sector') {
      return fetchMapContext(operationalMapContextFilters({ sector: source.sector }));
    }
    return fetchMapContext();
  });
  const operationDate = () => {
    const date = Array.isArray(searchParams.date) ? searchParams.date[0] : searchParams.date;
    return date || new Date().toISOString().slice(0, 10);
  };
  const [routeSnapshot] = createResource(operationDate, (date) => fetchOperatorRouteSnapshot(date));
  const operatorMode = () => isConductor(authUser()?.role) && !residentScope();
  const nextStopHolder: { marker?: maplibregl.Marker } = {};
  const residentNextStopHolder: { marker?: maplibregl.Marker } = {};

  const residentMapFocus = () => parseResidentMapFocus(searchParams.focus);
  const residentSectorName = () =>
    residentOverview()?.sectorName ?? authUser()?.sectorName ?? 'Mi sector';
  const residentSectorFeature = createMemo(() =>
    findSectorFeature(appState.sectors, residentSectorName()),
  );
  const residentFitKey = createMemo(() => {
    const rawSectorId = searchParams.sectorId;
    const sectorId = Array.isArray(rawSectorId) ? rawSectorId[0] : rawSectorId;
    return `${residentMapFocus()}|${residentSectorName()}|${sectorId ?? ''}`;
  });

  const focusVehicleId = () => {
    const fromParam = parseVehicleIdParam(searchParams.vehicleId) ?? parseVehicleIdParam(searchParams.vehicle);
    if (fromParam) return fromParam;
    if (operatorMode()) {
      return routeSnapshot()?.vehicleId ?? fleetForOperatorField(mapContext()?.vehicles ?? [], authUser())[0]?.id;
    }
    return undefined;
  };

  const mapFocus = () => {
    const raw = Array.isArray(searchParams.focus) ? searchParams.focus[0] : searchParams.focus;
    if (raw === 'routes') return 'routes';
    return raw === 'next' ? 'next' : 'route';
  };

  const [layersOpen, setLayersOpen] = createSignal(true);
  const [legendOpen, setLegendOpen] = createSignal(true);
  const [baseStyle, setBaseStyle] = createSignal<MapBaseStyleId>(
    themeBaseStyleId(appState.darkMode),
  );
  const [coords, setCoords] = createSignal({ lng: UNARE_CENTER[0], lat: UNARE_CENTER[1], zoom: UNARE_ZOOM });
  const [layerState, setLayerState] = createSignal<Record<string, boolean>>({
    ...initialLayerState(),
    sectors: false,
    neighborhoods: false,
  });
  const [mapReady, setMapReady] = createSignal(false);

  const operationalRoutesForMap = () =>
    mapContext()?.routes ?? { type: 'FeatureCollection' as const, features: [] };

  const routeLayerChildren = createMemo(() => {
    const features = operationalRoutesForMap().features;
    if (features.length === 0) return mapLayers.find((layer) => layer.id === 'routes')?.children ?? [];
    return features.map((feature) => {
      const props = feature.properties as OperationalRouteFeatureProps;
      const routeId = props.routeId ?? props.id ?? feature.properties.id;
      return {
        id: routeLayerStateKey(routeId),
        label: props.label ?? String(routeId),
        checked: true,
        kind: 'line' as const,
        class: '',
        color: props.color ?? '#34D634',
        filter: String(routeId),
      };
    });
  });

  const displayMapLayers = createMemo(() => {
    if (residentMode()) {
      return mapLayers.filter((layer) => ['routes', 'containers', 'vehicles'].includes(layer.id));
    }
    return mapLayers.map((layer) =>
      layer.id === 'routes' ? { ...layer, children: routeLayerChildren() } : layer,
    );
  });

  createEffect(() => {
    if (residentMode()) return;
    const features = operationalRoutesForMap().features;
    if (features.length === 0) return;
    setLayerState((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const feature of features) {
        const props = feature.properties as OperationalRouteFeatureProps;
        const routeId = props.routeId ?? props.id;
        if (routeId == null) continue;
        const key = routeLayerStateKey(routeId);
        if (next[key] === undefined) {
          next[key] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  });

  const mapMetrics = () => {
    if (residentMode() && residentOverview()) {
      const overview = residentOverview()!;
      return residentMapMetrics({
        totalPoints: overview.stats.totalPoints,
        criticalPoints: overview.stats.criticalPoints,
        activeRoutes: overview.stats.routesServingSector,
        truckCode: overview.proximity?.vehicleCode,
      });
    }
    return mapContext()?.mapMetrics?.length
      ? mapContext()!.mapMetrics
      : dashboardSummary().mapMetrics?.length
        ? dashboardSummary().mapMetrics!
        : [];
  };

  const operationalRoutes = () => {
    if (residentMode()) {
      const routeIds = residentOverview()?.activeRoutesInSector.map((route) => route.routeId) ?? [];
      return filterRoutesForSector(
        mapContext()?.routes ?? { type: 'FeatureCollection', features: [] },
        routeIds,
      );
    }
    if (operatorMode() && (routeSnapshot()?.stops.length ?? 0) > 0) {
      return routeCollectionFromStops(routeSnapshot()!.stops, {
        label: 'Mi ruta hoy',
      });
    }
    return mapContext()?.routes ?? { type: 'FeatureCollection', features: [] };
  };
  const operationalContainers = () => {
    if (residentMode() && residentOverview()) {
      return containersFromResidentPoints(
        residentOverview()!.collectionPoints,
        residentSectorName(),
      );
    }
    const containers = mapContext()?.containers ?? { type: 'FeatureCollection', features: [] };
    if (!operatorMode() || (routeSnapshot()?.stops.length ?? 0) === 0) {
      return containers;
    }
    const codes = new Set(
      routeSnapshot()!.stops.map((stop) => stop.code.replace(/^CNT-/i, '').toUpperCase()),
    );
    return {
      ...containers,
      features: containers.features.filter((feature) => {
        const id = String(feature.properties?.id ?? '').replace(/^CNT-/i, '').toUpperCase();
        return codes.has(id);
      }),
    };
  };
  const operationalFleet = () => {
    const fleet = mapContext()?.vehicles ?? [];
    if (residentMode()) {
      const truck = resolveResidentTruck(fleet, residentOverview()?.proximity?.vehicleCode);
      return truck ? [truck] : [];
    }
    if (!operatorMode()) return fleet;
    const focused = focusVehicleId();
    const scoped = fleetForOperatorField(fleet, authUser());
    if (focused) {
      const match = scoped.find((vehicle) => vehicle.id === focused) ?? fleet.find((v) => v.id === focused);
      return match ? [match] : scoped;
    }
    return scoped;
  };

  const getMap = () => mapRef.current;

  const zoomIn = () => getMap()?.zoomIn({ duration: 300 });
  const zoomOut = () => getMap()?.zoomOut({ duration: 300 });
  const recenterOperationalView = () => {
    const map = getMap();
    if (!map) return;
    fitMapToOperationalData(map, {
      vehicles: operationalFleet(),
      routes: operationalRoutes(),
    });
  };

  const locateUser = () => {
    const map = getMap();
    if (!map) return;
    if (!navigator.geolocation) {
      recenterOperationalView();
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
      () => recenterOperationalView(),
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
      if (id === 'routes') {
        for (const child of routeLayerChildren()) {
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

    setVis('sectors-fill', !residentMode() && (state.sectors || state.neighborhoods));
    setVis('sectors-line', !residentMode() && (state.sectors || state.neighborhoods));
    if (map.getLayer('sectors-fill')) {
      map.setPaintProperty(
        'sectors-fill',
        'fill-opacity',
        state.neighborhoods && !state.sectors ? 0.14 : 0.08,
      );
    }

    setVis(RESIDENT_SECTOR_HIGHLIGHT_FILL_ID, residentMode());
    setVis(RESIDENT_SECTOR_HIGHLIGHT_LINE_ID, residentMode());

    const routesVisible =
      state.routes ||
      (operatorMode() && (routeSnapshot()?.stops.length ?? 0) > 0) ||
      (residentMode() && operationalRoutes().features.length > 0);

    const operationalRouteData =
      routesVisible && !operatorMode() && !residentMode()
        ? operationalRoutesForMap()
        : { type: 'FeatureCollection' as const, features: [] };

    if (!operatorMode() && !residentMode()) {
      ensureOperationalRouteLayer(map, operationalRouteData);
      syncOperationalRouteLayerFilters(map, 'operational-routes', {
        routesVisible,
        enabledRouteIds: enabledOperationalRouteIds(operationalRouteData, state),
        splitByStatus: true,
      });
    }

    setVis(OPERATOR_ROUTE_LAYER_ID, routesVisible && operatorMode());
    setVis(OPERATOR_ROUTE_GLOW_LAYER_ID, routesVisible && operatorMode());
    setVis(RESIDENT_SECTOR_ROUTE_LAYER_ID, routesVisible && residentMode());
    setVis(RESIDENT_SECTOR_ROUTE_GLOW_LAYER_ID, routesVisible && residentMode());
    if (residentMode()) {
      ensureResidentSectorHighlight(map, residentSectorFeature());
      if (routesVisible && operationalRoutes().features.length > 0) {
        ensureResidentSectorRouteLayer(map, operationalRoutes());
      }
      const overview = residentOverview();
      syncResidentNextStopMarker(
        map,
        overview ? resolveResidentNextStop(overview) : null,
        residentNextStopHolder,
      );
    } else if (residentNextStopHolder.marker) {
      residentNextStopHolder.marker.remove();
      residentNextStopHolder.marker = undefined;
    }
    if (operatorMode() && routesVisible && (routeSnapshot()?.stops.length ?? 0) > 0) {
      ensureOperatorRouteLayer(map, operationalRoutes());
      syncNextStopMarker(
        map,
        mapFocus() === 'next' ? routeSnapshot()?.nextStop : routeSnapshot()?.nextStop,
        nextStopHolder,
      );
    } else if (nextStopHolder.marker) {
      nextStopHolder.marker.remove();
      nextStopHolder.marker = undefined;
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
        buildPopupHtml: residentMode() ? buildResidentContainerPopupHtml : buildContainerPopupHtml,
      });
    } else {
      containerMarkers.forEach((marker) => marker.remove());
      containerMarkers.length = 0;
    }

    if (state.vehicles) {
      const focusedId = residentMode()
        ? residentOverview()?.proximity?.vehicleCode ?? undefined
        : focusVehicleId();
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
    const map = new maplibregl.Map(
      createOperationalMapOptions({
        container: mapContainer,
        style: mapStyleForTheme(appState.darkMode),
      }),
    );
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
      if (residentMode()) void refetchResidentOverview();
    }, MAP_CONTEXT_POLL_MS);

    onCleanup(() => {
      window.clearInterval(pollTimer);
      ro.disconnect();
    });
  });

  createEffect(() => {
    if (!mapReady() || residentMode() || operatorMode()) return;
    mapContext();
    const map = getMap();
    if (!map?.isStyleLoaded()) return;
    if (mapFocus() === 'routes') {
      setLayerState((state) => ({ ...state, routes: true }));
    }
    fitMapToOperationalData(map, {
      vehicles: operationalFleet(),
      routes: operationalRoutes(),
    });
  });

  createEffect(() => {
    focusVehicleId();
    if (getMap()?.isStyleLoaded()) syncOverlayLayers();
  });

  createEffect(() => {
    if (!mapReady() || !residentMode()) return;
    const map = getMap();
    if (!map?.isStyleLoaded()) return;
    syncOverlayLayers();
  });

  createEffect(() => {
    residentFitKey();
    if (!mapReady() || !residentMode()) return;
    const map = getMap();
    if (!map?.isStyleLoaded()) return;
    const overview = residentOverview();
    if (!overview) return;

    const focus = residentMapFocus();
    const sectorFeature = residentSectorFeature();
    const truck = resolveResidentTruck(
      mapContext()?.vehicles ?? [],
      overview.proximity?.vehicleCode,
    );
    const routePoints = operationalRoutes().features.flatMap((feature) => {
      if (feature.geometry.type !== 'LineString') return [];
      return feature.geometry.coordinates.map(([lng, lat]) => ({ lng, lat }));
    });

    if (focus === 'truck' && truck) {
      map.flyTo({
        center: [truck.lng, truck.lat],
        zoom: Math.max(map.getZoom(), 14.5),
        essential: true,
      });
      return;
    }
    if (focus === 'routes' && routePoints.length > 0) {
      fitMapToSector(map, { points: routePoints, padding: 64 });
      return;
    }
    fitMapToSector(map, {
      sectorFeature,
      points: overview.collectionPoints.map((point) => ({ lng: point.lng, lat: point.lat })),
      padding: 56,
    });
  });

  createEffect(() => {
    routeSnapshot();
    if (!mapReady() || !operatorMode()) return;
    const map = getMap();
    if (!map?.isStyleLoaded()) return;
    syncOverlayLayers();
    const stops = routeSnapshot()?.stops ?? [];
    if (stops.length > 0) fitMapToStops(map, stops);
  });

  createEffect(() => {
    if (!residentMode()) return;
    setLayerState((state) => ({
      ...state,
      routes: true,
      containers: true,
      vehicles: true,
      sectors: false,
      neighborhoods: false,
      'bin-critical': true,
      'bin-full': true,
      'bin-normal': true,
      'bin-partial': true,
      'veh-active': true,
      'veh-idle': false,
      'veh-maintenance': false,
      'veh-offline': false,
    }));
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
    if (style === 'satelital' || style === 'terreno' || style === 'unare-local') return;
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
    <div class="relative h-full min-h-0 overflow-hidden bg-app">
      {/* Full-bleed map — UI floats above it */}
      <div ref={mapContainer} class="absolute inset-0 h-full w-full" />

      {/* Toolbar overlay */}
      <header class="absolute inset-x-0 top-0 z-20 flex flex-wrap items-center gap-2 border-b border-default/60 bg-elevated/90 px-3 py-2 shadow-sm backdrop-blur-md">
        <button
          type="button"
          onClick={toggleSidebar}
          class="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-app"
          aria-label="Menú"
        >
          <Menu size={20} />
        </button>

        <div class="relative min-w-0 flex-1 md:max-w-sm">
          <Show
            when={!residentMode()}
            fallback={
              <p
                role="status"
                class="truncate py-2 pl-1 text-sm font-semibold text-fero-green-dark dark:text-fero-green"
              >
                Mi sector — {residentSectorName()}
              </p>
            }
          >
            <Search size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              placeholder="Buscar dirección o lugar"
              class="w-full rounded-md border border-default bg-elevated py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-fero-blue focus:outline-none focus:ring-2 focus:ring-fero-blue/20"
            />
          </Show>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          <Show when={!residentMode()}>
            <ToolBtn icon={<Filter size={16} />} label="Filtros" />
          </Show>
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
          <Show when={!residentMode()}>
            <ToolBtn icon={<Ruler size={16} />} label="Medir" class="hidden sm:inline-flex" />
            <ToolBtn icon={<Printer size={16} />} label="Imprimir" class="hidden md:inline-flex" />
          </Show>
        </div>

        <div class="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void toggleDarkMode()}
            class="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-app"
            aria-label="Tema"
          >
            {appState.darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            type="button"
            class="relative flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-app"
            aria-label="Notificaciones"
          >
            <Bell size={18} />
            <span class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {dashboardSummary().notifications}
            </span>
          </button>
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-app"
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

      <Show when={operatorMode() && (routeSnapshot()?.stops.length ?? 0) > 0}>
        <div class="absolute inset-x-0 top-14 z-20 mx-3 rounded-lg border border-fero-blue/30 bg-elevated/95 px-3 py-2 text-sm shadow-sm backdrop-blur-sm">
          <p class="font-semibold text-fero-blue">Mi ruta hoy</p>
          <p class="text-xs text-text-secondary">
            {routeSnapshot()?.vehicleId} · {routeSnapshot()?.stopsDone}/{routeSnapshot()?.stopsTotal}{' '}
            paradas
            <Show when={routeSnapshot()?.nextStop}>
              {(stop) => (
                <span>
                  {' '}
                  · Próxima: <strong class="text-text-primary">{stop().code}</strong>
                </span>
              )}
            </Show>
          </p>
        </div>
      </Show>

      <Show when={residentMode()}>
        <div class="absolute inset-x-0 top-14 z-20 mx-3">
          <ResidentBreadcrumbs
            items={[
              { label: 'Mi Recolección', href: residentHubHref() },
              { label: 'Mapa mi sector' },
            ]}
          />
        </div>
      </Show>

      <Show when={residentMode() && residentOverview()}>
        {(overview) => (
          <div
            role="status"
            class="absolute inset-x-0 top-[4.25rem] z-20 mx-3 rounded-lg border border-fero-green/30 bg-elevated/95 px-3 py-2 text-sm shadow-sm backdrop-blur-sm"
          >
            <p class="font-semibold text-fero-green-dark dark:text-fero-green">
              Mi sector — {overview().sectorName}
            </p>
            <p class="text-xs text-text-secondary">
              {overview().stats.totalPoints} contenedores
              <Show when={overview().proximity.vehicleCode}>
                {(code) => (
                  <span>
                    {' '}
                    · Camión <strong class="text-text-primary">{code()}</strong>
                  </span>
                )}
              </Show>
              <Show when={overview().proximity.nextStopInSector}>
                {(stop) => (
                  <span>
                    {' '}
                    · Próxima parada: <strong class="text-text-primary">{stop()}</strong>
                  </span>
                )}
              </Show>
            </p>
            <A
              href={residentPointsHref()}
              class="mt-1 inline-flex items-center gap-1 text-xs font-medium text-fero-blue hover:underline"
            >
              Ver puntos de recolección
            </A>
          </div>
        )}
      </Show>

      <Show when={layersOpen()}>
        <aside
          class="absolute top-16 left-3 z-20 w-64 rounded-lg border border-default bg-elevated/95 p-3 shadow-lg backdrop-blur-md"
          data-testid="map-layers-panel"
        >
          <div class="mb-2 flex items-center justify-between">
            <h3 class="font-heading text-sm font-semibold text-text-primary">Capas</h3>
            <button type="button" class="text-text-muted hover:text-text-secondary" onClick={() => setLayersOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <ul class="space-y-1">
            <For each={displayMapLayers()}>
              {(layer) => (
                <li>
                  <label class="flex cursor-pointer items-center gap-2 py-0.5 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      class="size-4 rounded border-default accent-fero-green-dark"
                      checked={layerState()[layer.id]}
                      data-testid={layer.id === 'routes' ? 'map-layer-routes' : undefined}
                      onChange={() => toggleLayerItem(layer.id)}
                    />
                    {layer.label}
                  </label>
                  <Show when={layer.children && layerState()[layer.id]}>
                    <ul class="mt-1 mb-1.5 ml-6 space-y-1 border-l border-default pl-2.5">
                      <For each={layer.children}>
                        {(child) => (
                          <li>
                            <label class="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
                              <input
                                type="checkbox"
                                class="size-3.5 rounded border-default accent-fero-green-dark"
                                checked={layerState()[child.id] ?? true}
                                onChange={() => toggleLayerItem(child.id)}
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
          <Show when={!residentMode()}>
            <button type="button" class="mt-3 inline-flex items-center gap-1 text-sm font-medium text-fero-blue hover:underline">
              <Plus size={14} />
              Agregar capa
            </button>
          </Show>
        </aside>
      </Show>

      <Show when={legendOpen()}>
        <aside class="absolute top-16 right-3 z-20 w-52 rounded-lg border border-default bg-elevated/95 p-3 shadow-lg backdrop-blur-md">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="font-heading text-sm font-semibold text-text-primary">Leyenda</h3>
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
        <div class="flex flex-col overflow-hidden rounded-lg border border-default bg-elevated/95 shadow-md backdrop-blur-md">
          <button type="button" class="flex h-9 w-9 items-center justify-center text-text-secondary transition-colors hover:bg-app disabled:opacity-40" onClick={zoomIn} disabled={!mapReady()} aria-label="Acercar">
            <Plus size={16} />
          </button>
          <button type="button" class="flex h-9 w-9 items-center justify-center border-t border-default text-text-secondary transition-colors hover:bg-app disabled:opacity-40" onClick={zoomOut} disabled={!mapReady()} aria-label="Alejar">
            <Minus size={16} />
          </button>
        </div>
        <button type="button" class="flex h-9 w-9 items-center justify-center rounded-lg border border-default bg-elevated/95 text-text-secondary shadow-md backdrop-blur-md transition-colors hover:bg-app disabled:opacity-40" onClick={locateUser} disabled={!mapReady()} aria-label="Mi ubicación" title="Centrar en mi ubicación">
          <Crosshair size={16} />
        </button>
      </div>

      <div class="absolute bottom-44 left-3 z-20 rounded-md border border-default bg-elevated/95 px-2.5 py-1 text-[11px] font-bold text-text-secondary shadow-sm backdrop-blur-md sm:bottom-40">
        {coords().lat}, {coords().lng} · z{coords().zoom}
      </div>

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
                  <button type="button" class="group flex w-18 flex-col items-center gap-1" onClick={() => changeBaseStyle(style.id)}>
                    <span class={`h-14 w-18 overflow-hidden rounded-md border-2 ${baseStyle() === style.id ? 'border-red-500' : 'border-default'}`}>
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
                      <p class="font-heading text-lg font-bold leading-tight text-text-primary">{metric.value}</p>
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
          : 'border-default text-text-secondary hover:bg-app'
      } ${props.class ?? ''}`}
    >
      {props.icon}
      <span class="hidden lg:inline">{props.label}</span>
    </button>
  );
}
