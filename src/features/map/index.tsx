import { Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount } from 'solid-js';
import { useNavigate, useSearchParams } from '@solidjs/router';
import { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import {
  appState,
  toggleSidebar,
  toggleDarkMode,
  initAppData,
} from '../../core/stores/appStore';
import { dashboardSummary } from '../../core/stores/dashboardStore';
import { fetchMapContext, MAP_CONTEXT_POLL_MS } from '../../core/api/map';
import { fetchDailyPlan } from '../../core/api/planning';
import { fetchDailyRoutePlayback } from '../../core/api/routePlayback';
import { fetchOperatorRouteSnapshot } from '../../core/api/operator';
import { fetchResidentOverview } from '../../core/api/resident';
import { isConductor, isResident } from '../../core/auth/permissions';
import { authUser, logout } from '../../core/stores/authStore';
import { fleetForOperatorField } from '../../core/operator/operatorMonitoringUx';
import { parseVehicleIdParam } from '../../core/operator/operatorDeepLinks';
import {
  ensureOperatorRouteLayer,
  fitMapToOperatorRoute,
  routeCollectionFromOperatorSnapshot,
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
import { OperationalMap } from '../../core/map/OperationalMap';
import { useOperationalRoutesLayer } from '../../core/map/useOperationalRoutesLayer';
import {
  syncContainerMarkers,
  syncFleetMarkers,
  vehicleStatusKey,
  enabledOperationalRouteIds,
  ensureOperationalRouteLayer,
  operationalRouteLayerIdsToFront,
  routeLayerStateKey,
  syncOperationalRouteLayerFilters,
  OPERATIONAL_ROUTES_SOURCE_ID,
  type OperationalRouteFeatureProps,
} from '../../core/map/operationalMapLayers';
import {
  LANDFILL_LAYER_ID,
  removeLandfillFacilityMarker,
  syncLandfillFacilityMarker,
  syncRouteLandfillStopMarkers,
} from '../../core/map/landfillMapLayers';
import { DEFAULT_MAP_FACILITIES } from '../../core/utils/landfillUx';
import {
  fitMapToOperationalData,
  operationalMapContextFilters,
} from '../../core/map/operationalMapConfig';
import {
  canOpenMapGisPlayback,
  filterPlaybackRoutesForMapGis,
} from '../../core/map/mapPlaybackUx';
import {
  applyPlaybackCamera,
  type PlaybackCameraMode,
} from '../../core/route-playback/playbackCameraUx';
import { parsePlaybackQueryParam } from '../../core/planning/operationalFlowUx';
import { useRoutePlayback } from '../../core/route-playback/useRoutePlayback';
import { RoutePlaybackLayer } from '../route-playback/RoutePlaybackLayer';
import { RoutePlaybackLegend } from '../route-playback/RoutePlaybackLegend';
import { MapPlaybackPanel } from './MapPlaybackPanel';
import { MapToolbar } from './MapToolbar';
import { MapLayersPanel } from './MapLayersPanel';
import { MapLegendPanel } from './MapLegendPanel';
import { MapOperatorBanner } from './MapOperatorBanner';
import { MapResidentOverlays } from './MapResidentOverlays';
import { MapViewControls } from './MapViewControls';
import { MapBottomControls } from './MapBottomControls';
import { UNARE_CENTER, UNARE_ZOOM } from '../../data/types/geo';
import { buildContainerPopupHtml } from '../../core/utils/popupHtml';
import { mapStylesById, mapStyleForTheme, themeBaseStyleId } from '../../core/utils/mapStyle';
import {
  mapLayers,
  initialLayerState,
  type MapBaseStyleId,
} from '../../data/mock/mapGis';

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
  const navigate = useNavigate();
  const mapRef: { current?: MapLibreMap } = {};
  const vehicleMarkersById = new Map<string, Marker>();
  const containerMarkers = new Map<string, Marker>();
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
  const dailyPlanIdParam = () => {
    const raw = Array.isArray(searchParams.dailyPlanId)
      ? searchParams.dailyPlanId[0]
      : searchParams.dailyPlanId;
    if (!raw) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const dailyPlanSource = createMemo(() => (residentMode() ? null : operationDate()));
  const [dailyPlan] = createResource(dailyPlanSource, (date) => fetchDailyPlan(date));
  const [playbackOpen, setPlaybackOpen] = createSignal(false);
  const [cameraMode, setCameraMode] = createSignal<PlaybackCameraMode>('free');
  const [mapInstance, setMapInstance] = createSignal<MapLibreMap | undefined>();
  const [userMovedMap, setUserMovedMap] = createSignal(false);
  const [focusedFlyId, setFocusedFlyId] = createSignal<string | undefined>();
  const playbackPlanId = () => dailyPlan()?.id ?? dailyPlanIdParam() ?? 0;
  const [playbackPayload] = createResource(
    () => (playbackOpen() && !residentMode() ? playbackPlanId() : null),
    async (dailyPlanId) => {
      if (!dailyPlanId) return null;
      return fetchDailyRoutePlayback(dailyPlanId);
    },
  );
  const operatorMode = () => isConductor(authUser()?.role) && !residentScope();
  // Solo conductor/admin/planner pueden llamar /planning/operator-snapshot (403 en residente).
  const [routeSnapshot] = createResource(
    () => (operatorMode() ? operationDate() : null),
    (date) => (date ? fetchOperatorRouteSnapshot(date) : Promise.resolve(undefined)),
  );
  const nextStopHolder: { marker?: maplibregl.Marker } = {};
  const residentNextStopHolder: { marker?: maplibregl.Marker } = {};
  const landfillMarkerHolder: { marker?: maplibregl.Marker } = {};
  const routeLandfillMarkers: Marker[] = [];

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
  const [lastResidentFitKey, setLastResidentFitKey] = createSignal<string | null>(null);

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
  let toolbarRef: HTMLElement | undefined;
  let layersPanelRef: HTMLElement | undefined;
  let legendPanelRef: HTMLElement | undefined;
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

  const enabledRouteIdsForPlayback = createMemo(() =>
    enabledOperationalRouteIds(operationalRoutesForMap(), layerState()),
  );
  const playbackRoutes = createMemo(() =>
    filterPlaybackRoutesForMapGis(playbackPayload()?.routes ?? [], {
      enabledRouteIds: enabledRouteIdsForPlayback(),
      focusVehicleId: focusVehicleId(),
      fieldMode: operatorMode(),
    }),
  );
  const playback = useRoutePlayback(() => playbackRoutes(), { pauseAtStops: true });
  const canOpenPlayback = createMemo(() =>
    canOpenMapGisPlayback({
      residentMode: residentMode(),
      dailyPlan: dailyPlan(),
      playbackRouteCount: operationalRoutesForMap().features.length,
    }),
  );
  const playbackActive = () => playbackOpen() && playbackRoutes().length > 0;

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
      return routeCollectionFromOperatorSnapshot(routeSnapshot()!, {
        label: routeSnapshot()?.routeLabel ?? 'Mi ruta hoy',
        routeId: routeSnapshot()?.routeId,
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

  const supervisorRoutesVisible = createMemo(() => {
    if (residentMode() || operatorMode()) return false;
    return layerState().routes;
  });

  const supervisorOperationalRoutes = createMemo(() => {
    if (residentMode() || operatorMode()) {
      return { type: 'FeatureCollection' as const, features: [] };
    }
    return operationalRoutesForMap();
  });

  useOperationalRoutesLayer({
    map: mapInstance,
    mapReady,
    routes: supervisorOperationalRoutes,
    sourceId: 'operational-routes',
    routesVisible: supervisorRoutesVisible,
    enabledRouteIds: () => {
      if (residentMode() || operatorMode()) return [];
      return enabledOperationalRouteIds(supervisorOperationalRoutes(), layerState());
    },
    playbackActive,
  });

  const handleOpenPlayback = () => setPlaybackOpen(true);
  const handleClosePlayback = () => {
    playback.pause();
    playback.reset();
    setCameraMode('free');
    setPlaybackOpen(false);
    if (getMap()?.isStyleLoaded()) syncOverlayLayers();
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const setMapOperationDate = (date: string) => {
    if (playbackOpen()) handleClosePlayback();
    const params = new URLSearchParams(window.location.search);
    params.set('date', date);
    const query = params.toString();
    navigate(query ? `/map?${query}` : '/map', { replace: true });
  };

  let playbackDeepLinkHandled = false;

  createEffect(() => {
    if (!parsePlaybackQueryParam(searchParams.playback)) return;
    if (playbackDeepLinkHandled || playbackOpen() || residentMode()) return;
    if (!canOpenPlayback()) return;
    playbackDeepLinkHandled = true;
    setPlaybackOpen(true);
  });

  createEffect(() => {
    if (!playbackOpen()) {
      playback.pause();
      playback.reset();
    }
  });

  createEffect(() => {
    if (!playbackActive()) return;
    const map = getMap();
    if (!map?.isStyleLoaded()) return;
    const mode = cameraMode();
    playback.routeStates();
    applyPlaybackCamera(map, mode, playbackRoutes(), playback.routeStates(), focusVehicleId());
  });

  createEffect(() => {
    playbackOpen();
    cameraMode();
    playbackRoutes();
    if (getMap()?.isStyleLoaded()) syncOverlayLayers();
  });

  createEffect(() => {
    if (!playbackOpen() && !layersOpen() && !legendOpen()) return;

    const isInteractiveTarget = (target: Node) =>
      Boolean(
        toolbarRef?.contains(target) ||
          layersPanelRef?.contains(target) ||
          legendPanelRef?.contains(target),
      );

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (playbackOpen()) {
        handleClosePlayback();
      } else if (layersOpen()) {
        setLayersOpen(false);
      } else if (legendOpen()) {
        setLegendOpen(false);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || isInteractiveTarget(target)) return;
      if (layersOpen()) setLayersOpen(false);
      if (legendOpen()) setLegendOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    if (layersOpen() || legendOpen()) {
      document.addEventListener('pointerdown', handlePointerDown, true);
    }
    onCleanup(() => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    });
  });

  const zoomIn = () => getMap()?.zoomIn({ duration: 300 });
  const zoomOut = () => getMap()?.zoomOut({ duration: 300 });
  const recenterOperationalView = () => {
    const map = getMap();
    if (!map) return;
    setUserMovedMap(false);
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
    containerMarkers.clear();
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

    if (!residentMode() && !operatorMode()) {
      try {
        ensureOperationalRouteLayer(map, operationalRoutes(), OPERATIONAL_ROUTES_SOURCE_ID, {
          splitByStatus: true,
        });
        syncOperationalRouteLayerFilters(map, OPERATIONAL_ROUTES_SOURCE_ID, {
          routesVisible,
          enabledRouteIds: enabledOperationalRouteIds(operationalRoutes(), state),
          splitByStatus: true,
        });
        operationalRouteLayerIdsToFront(map, OPERATIONAL_ROUTES_SOURCE_ID);
      } catch (error) {
        console.warn('[FEROMAP] No se pudieron pintar las rutas operativas', error);
      }
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
      containerMarkers.clear();
    }

    if (state.vehicles && !playbackActive()) {
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
        if (focused && marker && focusedFlyId() !== focusedId) {
          setFocusedFlyId(focusedId);
          map.flyTo({
            center: [focused.lng, focused.lat],
            zoom: Math.max(map.getZoom(), 14),
            essential: true,
          });
          const popup = marker.getPopup();
          if (popup && !popup.isOpen()) marker.togglePopup();
        }
      } else if (focusedFlyId()) {
        setFocusedFlyId(undefined);
      }
    } else if (playbackActive()) {
      vehicleMarkersById.forEach((marker) => marker.remove());
      vehicleMarkersById.clear();
    } else {
      vehicleMarkersById.forEach((marker) => marker.remove());
      vehicleMarkersById.clear();
    }

    const facilities = mapContext()?.facilities ?? DEFAULT_MAP_FACILITIES;
    if (state.landfill) {
      syncLandfillFacilityMarker(map, facilities, landfillMarkerHolder);
      if (map.getLayer(LANDFILL_LAYER_ID)) {
        map.setLayoutProperty(LANDFILL_LAYER_ID, 'visibility', 'visible');
      }
      if (routesVisible) {
        syncRouteLandfillStopMarkers(map, operationalRoutes(), routeLandfillMarkers);
      } else {
        routeLandfillMarkers.forEach((marker) => marker.remove());
        routeLandfillMarkers.length = 0;
      }
    } else {
      removeLandfillFacilityMarker(landfillMarkerHolder);
      if (map.getLayer(LANDFILL_LAYER_ID)) {
        map.setLayoutProperty(LANDFILL_LAYER_ID, 'visibility', 'none');
      }
      routeLandfillMarkers.forEach((marker) => marker.remove());
      routeLandfillMarkers.length = 0;
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

    syncOverlayLayers();
  };

  const flagUserCameraGesture = (e?: { originalEvent?: Event }) => {
    if (e?.originalEvent) setUserMovedMap(true);
  };

  const handleGisMapReady = (map: MapLibreMap) => {
    mapRef.current = map;
    setMapInstance(map);
    addDataLayers();
    setMapReady(true);
    map.on('move', () => {
      const c = map.getCenter();
      setCoords({ lng: +c.lng.toFixed(5), lat: +c.lat.toFixed(5), zoom: +map.getZoom().toFixed(1) });
    });
    map.on('dragstart', () => setUserMovedMap(true));
    map.on('zoomstart', flagUserCameraGesture);
    map.on('movestart', flagUserCameraGesture);
    map.on('rotatestart', flagUserCameraGesture);
    map.on('pitchstart', flagUserCameraGesture);
    requestAnimationFrame(() => map.resize());
  };

  onMount(() => {
    void initAppData();

    const pollTimer = window.setInterval(() => {
      void refetch();
      if (residentMode()) void refetchResidentOverview();
    }, MAP_CONTEXT_POLL_MS);

    onCleanup(() => {
      window.clearInterval(pollTimer);
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
    if (userMovedMap()) return;
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
    const intentionalKey = residentFitKey();
    if (userMovedMap() && intentionalKey === lastResidentFitKey()) return;

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
      setLastResidentFitKey(intentionalKey);
      map.flyTo({
        center: [truck.lng, truck.lat],
        zoom: Math.max(map.getZoom(), 14.5),
        essential: true,
      });
      return;
    }
    if (focus === 'routes' && routePoints.length > 0) {
      setLastResidentFitKey(intentionalKey);
      fitMapToSector(map, { points: routePoints, padding: 64 });
      return;
    }
    setLastResidentFitKey(intentionalKey);
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
    if (userMovedMap()) return;
    const snapshot = routeSnapshot();
    if (snapshot && snapshot.stops.length > 0) {
      fitMapToOperatorRoute(map, snapshot);
    }
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
    mapRef.current = undefined;
    setMapInstance(undefined);
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
      <OperationalMap
        class="absolute inset-0 h-full w-full"
        themeSync={false}
        onMapReady={handleGisMapReady}
        onStyleRestored={() => addDataLayers()}
      >
        <Show when={playbackActive()}>
          <RoutePlaybackLayer
            map={mapInstance}
            routes={() => playbackRoutes()}
            playback={playback}
            showControls={false}
          />
        </Show>
      </OperationalMap>

      {/* Toolbar overlay */}
      <MapToolbar
        residentMode={residentMode()}
        isResidentUser={isResident(authUser()?.role)}
        residentSectorName={residentSectorName()}
        canOpenPlayback={canOpenPlayback()}
        playbackOpen={playbackOpen()}
        layersOpen={layersOpen()}
        legendOpen={legendOpen()}
        darkMode={appState.darkMode}
        notificationCount={dashboardSummary().notifications}
        onToggleSidebar={toggleSidebar}
        onToggleDarkMode={toggleDarkMode}
        onLogout={() => void handleLogout()}
        onOpenPlayback={handleOpenPlayback}
        onToggleLayers={() => setLayersOpen((v) => !v)}
        onToggleLegend={() => setLegendOpen((v) => !v)}
        onRef={(el) => (toolbarRef = el)}
      />

      <MapOperatorBanner operatorMode={operatorMode()} snapshot={routeSnapshot()} />

      <MapResidentOverlays residentMode={residentMode()} overview={residentOverview()} />

      <MapLayersPanel
        open={layersOpen()}
        residentMode={residentMode()}
        operationDate={operationDate()}
        dailyPlan={dailyPlan()}
        canOpenPlayback={canOpenPlayback()}
        playbackOpen={playbackOpen()}
        playbackLoading={playbackPayload.loading}
        layers={displayMapLayers()}
        layerState={layerState()}
        onOperationDateChange={setMapOperationDate}
        onOpenPlayback={handleOpenPlayback}
        onToggleLayer={toggleLayerItem}
        onClose={() => setLayersOpen(false)}
        onRef={(el) => (layersPanelRef = el)}
      />

      <MapLegendPanel
        open={legendOpen()}
        onClose={() => setLegendOpen(false)}
        onRef={(el) => (legendPanelRef = el)}
      />

      <Show when={playbackOpen() && !residentMode()}>
        <MapPlaybackPanel
          routes={playbackRoutes()}
          playback={playback}
          operationDate={operationDate()}
          dailyPlan={dailyPlan()}
          previewMode={playbackPayload()?.previewMode ?? true}
          cameraMode={cameraMode()}
          onCameraModeChange={setCameraMode}
          onClose={handleClosePlayback}
          loading={playbackPayload.loading}
          error={
            playbackPayload.error
              ? playbackPayload.error instanceof Error
                ? playbackPayload.error.message
                : 'No se pudo cargar el recorrido'
              : playbackRoutes().length === 0 && !playbackPayload.loading
                ? 'No hay rutas visibles con los filtros actuales.'
                : null
          }
        />
      </Show>

      <Show when={playbackActive()}>
        <div class="absolute bottom-44 left-3 z-20 max-w-xs sm:bottom-40">
          <RoutePlaybackLegend />
        </div>
      </Show>

      <MapViewControls
        mapReady={mapReady()}
        coords={coords()}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onLocate={locateUser}
      />

      <MapBottomControls
        baseStyle={baseStyle()}
        metrics={mapMetrics()}
        onChangeBaseStyle={changeBaseStyle}
      />
    </div>
  );
}
