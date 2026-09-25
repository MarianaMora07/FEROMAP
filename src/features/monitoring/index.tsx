import { Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount } from 'solid-js';
import { A, Navigate, useSearchParams } from '@solidjs/router';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { TabList, tabButtonId } from '../../design-system/components';
import {
  advanceActiveRoutes,
  advanceRouteById,
  fetchMonitoringStatus,
} from '../../core/api/monitoring';
import { fetchDailyPlan } from '../../core/api/planning';
import { fetchOperatorRouteSnapshot } from '../../core/api/operator';
import { MAP_CONTEXT_POLL_MS } from '../../core/api/map';
import {
  syncContainerMarkers,
  syncFleetMarkers,
} from '../../core/map/operationalMapLayers';
import { useOperationalRoutesLayer } from '../../core/map/useOperationalRoutesLayer';
import { appState } from '../../core/stores/appStore';
import { canSimulateFleetAdvance, isConductor, isOperationalSupervisor } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { parsePlaybackQueryParam } from '../../core/planning/operationalFlowUx';
import { ContingencyResultBanner } from '../contingency/BreakdownReporter';
import { OperatorContingencyBanner } from '../contingency/OperatorContingencyBanner';
import { OperatorMyIncidents } from '../contingency/OperatorMyIncidents';
import { RecentIncidentsPanel } from '../contingency/RecentIncidentsPanel';
import { PlanningLevelBanner } from '../planning/PlanningLevelBanner';
import { PLANNING_EMPTY_PRESETS } from '../../core/planning/planningEmptyStates';
import { OPERATOR_EMPTY_PRESETS } from '../../core/operator/operatorEmptyStates';
import { fleetForOperatorField } from '../../core/operator/operatorMonitoringUx';
import { parseVehicleIdParam } from '../../core/operator/operatorDeepLinks';
import {
  OperatorFieldBottomPanel,
  OperatorNextStopCard,
} from './OperatorFieldPanel';
import { MonitoringPlaybackPanel } from './MonitoringPlaybackPanel';
import { MonitoringContextPanel } from './MonitoringContextPanel';
import { MonitoringDeskIntro, MonitoringStatsStrip } from './MonitoringDeskIntro';
import { MonitoringMapCard } from './MonitoringMapCard';
import { MonitoringFleetList } from './MonitoringFleetList';
import { MonitoringActionBar } from './MonitoringActionBar';
import { fetchDailyRoutePlayback } from '../../core/api/routePlayback';
import { useRoutePlayback } from '../../core/route-playback/useRoutePlayback';
import {
  canShowMonitoringRoutePlayback,
  filterPlaybackRoutesForMonitoring,
  initialCompletedStopsByRoute,
  mergeRouteProgressWithPlayback,
  monitoringPlaybackInitialProgress,
  type MonitoringPlaybackMode,
} from '../../core/monitoring/monitoringPlaybackUx';
import {
  deriveOperatorPlaybackSync,
  OPERATOR_PLAYBACK_AUTO_PLAY,
} from '../../core/operator/operatorPlaybackUx';
import { applyPlaybackCamera } from '../../core/route-playback/playbackCameraUx';
import { mockDailyRoutePlayback } from '../../data/mock/routePlayback';
import { fitMapToOperationalData } from '../../core/map/operationalMapConfig';
import type { LiveVehicle } from '../../data/mock/monitoring';

function truckSvg(color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>`;
}

function trashSvg(color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
}

function createPin(bg: string, svg: string, size = 28) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'monitor-marker';
  el.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:${bg};box-shadow:0 2px 8px rgba(0,0,0,.25);border:2px solid #fff">${svg}</span>`;
  return el;
}

function buildVehiclePopup(v: LiveVehicle) {
  return `
    <div style="min-width:220px;font-family:system-ui,sans-serif;">
      <div style="display:flex;gap:10px;margin-bottom:8px;">
        <img src="${v.image}" alt="${v.id}" style="width:56px;height:40px;object-fit:cover;border-radius:6px;background:#e2e8f0;" referrerpolicy="no-referrer" />
        <div>
          <div style="display:flex;align-items:center;gap:6px;">
            <strong style="font-size:14px;">${v.id}</strong>
            <span style="font-size:10px;font-weight:600;color:#166534;background:#dcfce7;padding:2px 6px;border-radius:999px;">En ruta</span>
          </div>
          <p style="margin:2px 0 0;font-size:12px;color:#64748b;">Conductor: ${v.driver}</p>
        </div>
      </div>
      <p style="margin:0 0 6px;font-size:12px;color:#475569;">Ruta: <strong>${v.route}</strong></p>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:4px;">
        <span>Progreso de ruta</span><span style="font-weight:700;color:#166534;">${v.progress}%</span>
      </div>
      <div style="height:6px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-bottom:8px;">
        <div style="height:100%;width:${v.progress}%;background:#34D634;border-radius:999px;"></div>
      </div>
      <p style="margin:0 0 8px;font-size:11px;color:#64748b;">Siguiente punto: ${v.nextPoint}</p>
      <button type="button" data-vehicle-id="${v.id}" class="popup-ver-vehiculo" style="background:none;border:none;padding:0;color:#1143F3;font-size:12px;font-weight:600;cursor:pointer;">Ver detalles</button>
    </div>
  `;
}

export default function MonitoringPage() {
  // IA: /monitoring es supervisión; el conductor opera desde /operator.
  // Conserva query params al redirigir para no romper deep links.
  if (isConductor(authUser()?.role)) {
    const qs = typeof window !== 'undefined' ? window.location.search : '';
    return <Navigate href={`/operator${qs}`} />;
  }

  const [searchParams] = useSearchParams();
  const mapRef: { current?: MapLibreMap } = {};
  const markersById = new Map<string, Marker>();
  const binMarkers = new Map<string, Marker>();
  const [userMovedMap, setUserMovedMap] = createSignal(false);

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

  const [monitoringData, { refetch }] = createResource(fetchMonitoringStatus);
  const [dailyPlan] = createResource(operationDate, (date) => fetchDailyPlan(date));
  const [routeSnapshot, { refetch: refetchRouteSnapshot }] = createResource(operationDate, (date) =>
    fetchOperatorRouteSnapshot(date),
  );
  const [advancing, setAdvancing] = createSignal(false);
  const [playbackOpen, setPlaybackOpen] = createSignal(false);
  const [playbackMode, setPlaybackMode] = createSignal<MonitoringPlaybackMode>('visual');
  const [playbackSync, setPlaybackSync] = createSignal<ReturnType<typeof deriveOperatorPlaybackSync>>(null);
  const [mapInstance, setMapInstance] = createSignal<MapLibreMap | undefined>();
  const hybridCompletedBaseline = new Map<number, number>();
  const fieldMode = () => isConductor(authUser()?.role);
  const monitoringKpis = () => monitoringData()?.kpis ?? [];
  const liveFleet = () => monitoringData()?.liveFleet ?? [];
  const routeProgress = () => monitoringData()?.routeProgress ?? [];
  const monitoringAlerts = () => monitoringData()?.monitoringAlerts ?? [];
  const operationalRoutes = () => monitoringData()?.routes ?? { type: 'FeatureCollection', features: [] };
  const operationalContainers = () => monitoringData()?.containers ?? { type: 'FeatureCollection', features: [] };
  const liveActivities = () => monitoringData()?.liveActivities ?? [];

  const [search, setSearch] = createSignal('');
  const [statusFilter, setStatusFilter] = createSignal('');
  const [selectedId, setSelectedId] = createSignal('');
  const [mapReady, setMapReady] = createSignal(false);
  const [legendOpen, setLegendOpen] = createSignal(false);
  const [incidentsRefreshKey, setIncidentsRefreshKey] = createSignal(0);
  const [fieldPanelOpen, setFieldPanelOpen] = createSignal(true);
  const [monitorTab, setMonitorTab] = createSignal<'map' | 'incidents'>('map');

  const vehicleIdParam = () => parseVehicleIdParam(searchParams.vehicleId);

  const operatorFleet = createMemo(() => {
    let fleet = fieldMode() ? fleetForOperatorField(liveFleet(), authUser()) : liveFleet();
    const param = vehicleIdParam();
    if (fieldMode() && param) {
      const match =
        liveFleet().find((vehicle) => vehicle.id === param) ??
        fleet.find((vehicle) => vehicle.id === param);
      if (match) fleet = [match];
    }
    return fleet;
  });
  const operatorVehicle = createMemo(() => operatorFleet()[0] ?? null);
  const mapFleet = createMemo(() => (fieldMode() ? operatorFleet() : liveFleet()));

  const playbackPlanId = () => dailyPlan()?.id ?? dailyPlanIdParam() ?? 0;
  const [playbackPayload] = createResource(
    () => (playbackOpen() || fieldMode() ? playbackPlanId() : null),
    async (dailyPlanId) => {
      if (!dailyPlanId) return mockDailyRoutePlayback(0);
      return fetchDailyRoutePlayback(dailyPlanId);
    },
  );
  const playbackRoutes = createMemo(() =>
    filterPlaybackRoutesForMonitoring(
      playbackPayload()?.routes ?? [],
      fieldMode(),
      operatorVehicle(),
    ),
  );
  const playback = useRoutePlayback(() => playbackRoutes(), {
    pauseAtStops: true,
    autoPlay: fieldMode() ? OPERATOR_PLAYBACK_AUTO_PLAY : undefined,
  });
  const displayRouteProgress = createMemo(() =>
    mergeRouteProgressWithPlayback(
      routeProgress(),
      playbackRoutes(),
      playback.routeStates(),
      playbackOpen(),
    ),
  );
  const canOpenPlayback = createMemo(() =>
    canShowMonitoringRoutePlayback({
      fieldMode: fieldMode(),
      inRouteCount: monitoringData()?.fleetCounts.inRoute ?? 0,
      operatorVehicle: operatorVehicle(),
      routeSnapshot: routeSnapshot(),
    }),
  );

  const initialPlaybackProgress = () =>
    monitoringPlaybackInitialProgress({
      fieldMode: fieldMode(),
      routeSnapshot: routeSnapshot(),
      routeProgress: routeProgress(),
      operatorVehicle: operatorVehicle(),
    });

  const handleOpenPlayback = () => {
    setPlaybackOpen(true);
  };

  const handleClosePlayback = () => {
    playback.pause();
    playback.setProgress(initialPlaybackProgress());
    setPlaybackOpen(false);
    if (mapReady()) syncOperationalMap();
  };

  let playbackSeeded = false;
  let playbackDeepLinkHandled = false;

  createEffect(() => {
    if (!fieldMode() || playbackOpen()) return;
    if (!canOpenPlayback()) return;
    setPlaybackOpen(true);
  });

  createEffect(() => {
    if (!playbackOpen() && !fieldMode()) {
      setPlaybackSync(null);
      return;
    }
    const sync = deriveOperatorPlaybackSync(
      playbackRoutes()[0],
      playback.routeStates()[0],
      playback.isPlaying(),
    );
    setPlaybackSync(sync);
  });

  createEffect(() => {
    if (!fieldMode() || !playbackOpen() || !playback.isPlaying()) return;
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    playback.routeStates();
    applyPlaybackCamera(
      map,
      'follow',
      playbackRoutes(),
      playback.routeStates(),
      operatorVehicle()?.id,
    );
  });

  createEffect(() => {
    if (!parsePlaybackQueryParam(searchParams.playback)) return;
    if (playbackDeepLinkHandled || playbackOpen()) return;
    if (!canOpenPlayback()) return;
    playbackDeepLinkHandled = true;
    setPlaybackOpen(true);
  });

  createEffect(() => {
    if (!playbackOpen()) {
      playbackSeeded = false;
      return;
    }
    if (playbackSeeded || playbackRoutes().length === 0) return;
    const initial = initialPlaybackProgress();
    playback.setProgress(initial);
    const baseline = initialCompletedStopsByRoute(playbackRoutes(), initial);
    hybridCompletedBaseline.clear();
    baseline.forEach((value, key) => hybridCompletedBaseline.set(key, value));
    playbackSeeded = true;
  });

  createEffect(() => {
    if (!playbackOpen() || playbackMode() !== 'hybrid') return;
    for (const state of playback.routeStates()) {
      const baseline = hybridCompletedBaseline.get(state.routeId) ?? 0;
      if (state.completedStops <= baseline) continue;
      hybridCompletedBaseline.set(state.routeId, state.completedStops);
      void (async () => {
        try {
          await advanceRouteById(state.routeId);
          await refetch();
          await refetchRouteSnapshot();
        } catch {
          // Mantener animación aunque falle el avance puntual.
        }
      })();
    }
  });

  const filteredFleet = createMemo(() => {
    const q = search().trim().toLowerCase();
    const status = statusFilter();
    return liveFleet().filter((v) => {
      if (status && v.status !== status) return false;
      if (!q) return true;
      return (
        v.id.toLowerCase().includes(q) ||
        v.driver.toLowerCase().includes(q) ||
        v.route.toLowerCase().includes(q)
      );
    });
  });

  const syncOperationalMap = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    syncContainerMarkers(map, operationalContainers(), binMarkers, {
      createMarkerElement: (color) => createPin(color, trashSvg('#fff'), 24),
    });

    if (playbackOpen()) {
      markersById.forEach((marker) => marker.remove());
      markersById.clear();
    } else {
      syncFleetMarkers(map, mapFleet(), markersById, {
        createMarkerElement: (vehicle) => {
          const el = createPin(vehicle.color, truckSvg('#fff'), 30);
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            setSelectedId(vehicle.id);
          });
          return el;
        },
        buildPopupHtml: buildVehiclePopup,
      });
    }

    const first = mapFleet()[0];
    if (first && (!selectedId() || fieldMode()) && !playbackOpen()) setSelectedId(first.id);
    if (!playbackOpen() && !userMovedMap()) {
      fitMapToOperationalData(map, {
        vehicles: mapFleet(),
        routes: operationalRoutes(),
      });
    }
  };

  const centerOnVehicle = (id: string) => {
    const v = mapFleet().find((vehicle) => vehicle.id === id) ?? liveFleet().find((vehicle) => vehicle.id === id);
    const map = mapRef.current;
    if (!v || !map) return;
    map.flyTo({ center: [v.lng, v.lat], zoom: Math.max(map.getZoom(), 14.5), essential: true });
  };

  const navigateToNextStop = () => {
    const next = routeSnapshot()?.nextStop;
    const map = mapRef.current;
    if (next?.lng != null && next?.lat != null && map) {
      map.flyTo({ center: [next.lng, next.lat], zoom: 15, essential: true });
      return;
    }
    const vehicle = operatorVehicle();
    if (vehicle) centerOnVehicle(vehicle.id);
  };

  const openVehiclePopup = (id: string) => {
    const marker = markersById.get(id);
    const map = mapRef.current;
    const v = liveFleet().find((x) => x.id === id);
    if (!marker || !map || !v) return;
    map.flyTo({ center: [v.lng, v.lat], zoom: Math.max(map.getZoom(), 14), essential: true });
    markersById.forEach((m, mid) => {
      if (mid !== id) m.getPopup()?.remove();
    });
    const popup = marker.getPopup();
    if (popup && !popup.isOpen()) marker.togglePopup();
  };

  const handleAdvance = async () => {
    setAdvancing(true);
    try {
      const routeId = operatorVehicle()?.routeId ?? routeSnapshot()?.routeId;
      if (fieldMode() && routeId != null) {
        await advanceRouteById(routeId);
      } else {
        await advanceActiveRoutes();
      }
      await refetch();
      await refetchRouteSnapshot();
      syncOperationalMap();
    } finally {
      setAdvancing(false);
    }
  };

  const setupMonitoringMap = (map: MapLibreMap) => {
    syncOperationalMap();
  };

  useOperationalRoutesLayer({
    map: mapInstance,
    mapReady,
    routes: operationalRoutes,
    sourceId: 'live-routes',
    splitByStatus: true,
    playbackActive: playbackOpen,
    playbackOpacity: { active: 0.2, pending: 0.15 },
  });

  const handleMonitoringMapReady = (map: MapLibreMap) => {
    mapRef.current = map;
    setMapInstance(map);
    const flagUserGesture = (e?: { originalEvent?: Event }) => {
      if (e?.originalEvent) setUserMovedMap(true);
    };
    map.on('dragstart', () => setUserMovedMap(true));
    map.on('zoomstart', flagUserGesture);
    map.on('movestart', flagUserGesture);
    map.on('rotatestart', flagUserGesture);
    map.on('pitchstart', flagUserGesture);
    setupMonitoringMap(map);
    setMapReady(true);
    const first = mapFleet()[0];
    if (first) openVehiclePopup(first.id);
  };

  onMount(() => {
    const onPopupClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement | null)?.closest?.('.popup-ver-vehiculo') as HTMLElement | null;
      if (!btn?.dataset.vehicleId) return;
      setSelectedId(btn.dataset.vehicleId);
    };
    document.addEventListener('click', onPopupClick);

    const pollTimer = window.setInterval(() => {
      void refetch();
    }, MAP_CONTEXT_POLL_MS);

    onCleanup(() => {
      window.clearInterval(pollTimer);
      document.removeEventListener('click', onPopupClick);
      markersById.forEach((m) => m.remove());
      markersById.clear();
      binMarkers.forEach((m) => m.remove());
      binMarkers.clear();
      mapRef.current = undefined;
      setMapInstance(undefined);
    });
  });

  const selectVehicle = (v: LiveVehicle) => {
    setSelectedId(v.id);
    if (mapReady()) openVehiclePopup(v.id);
  };

  createEffect(() => {
    monitoringData();
    routeSnapshot();
    playbackOpen();
    if (mapReady()) syncOperationalMap();
  });

  createEffect(() => {
    if (!fieldMode()) return;
    const param = vehicleIdParam();
    const vehicle = param
      ? operatorFleet().find((row) => row.id === param) ?? operatorVehicle()
      : operatorVehicle();
    if (!vehicle) return;
    if (selectedId() !== vehicle.id) {
      setSelectedId(vehicle.id);
    }
    if (mapReady()) {
      centerOnVehicle(vehicle.id);
    }
  });

  const monitoringBannerTitle = () => {
    if (isConductor(authUser()?.role)) return 'Operación en campo';
    if (isOperationalSupervisor(authUser()?.role)) return 'Supervisión operativa';
    return 'Monitoreo de flota';
  };

  const fleetEmptyPreset = () => {
    if (isConductor(authUser()?.role)) {
      return liveFleet().length === 0
        ? OPERATOR_EMPTY_PRESETS.noFleetInMonitoring
        : OPERATOR_EMPTY_PRESETS.noFleetMatch;
    }
    return liveFleet().length === 0
      ? PLANNING_EMPTY_PRESETS.noVehicles
      : PLANNING_EMPTY_PRESETS.noFleetMatch;
  };

  return (
    <div class={`space-y-5 ${fieldMode() ? 'pb-36 md:pb-5' : ''}`}>
      <Show when={fieldMode()}>
        <PlanningLevelBanner level="operativo" title={monitoringBannerTitle()}>
          <p class="text-sm text-text-secondary">
            Ejecuta tu ruta, reporta incidencias y consulta el avance.{' '}
            <A href="/operator" class="font-semibold text-fero-blue hover:underline">
              Volver a Mi operación
            </A>
          </p>
        </PlanningLevelBanner>
        <OperatorContingencyBanner />
      </Show>

      <Show when={!fieldMode()}>
        <ContingencyResultBanner />
        <MonitoringDeskIntro
          variant={isOperationalSupervisor(authUser()?.role) ? 'supervisor' : 'planner'}
          fleetInRoute={monitoringData()?.fleetCounts.inRoute ?? 0}
          operationDate={operationDate()}
          dailyPlanId={dailyPlanIdParam()}
          dailyPlan={dailyPlan()}
        />
        <MonitoringStatsStrip kpis={monitoringKpis()} loading={monitoringData.loading} />
      </Show>

      <TabList
        idPrefix="monitoring"
        panelId="monitoring-panel"
        tabs={[
          { id: 'map', label: 'Mapa' },
          { id: 'incidents', label: 'Incidencias y alertas' },
        ]}
        active={monitorTab()}
        onChange={(id) => setMonitorTab(id as 'map' | 'incidents')}
        ariaLabel="Vista del monitoreo"
        containerClass="flex gap-1 overflow-x-auto border-b border-default"
        testId="monitoring-tabs"
        testIdFor={(id) => `monitoring-tab-${id}`}
        tabClass={(active) =>
          `shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            active
              ? 'border-fero-green-mid text-fero-green-dark'
              : 'border-transparent text-text-muted hover:text-text-secondary'
          }`
        }
      />

      <div
        role="tabpanel"
        id="monitoring-panel"
        aria-labelledby={tabButtonId('monitoring', monitorTab())}
        class="space-y-5"
      >

      <MonitoringActionBar
        fieldMode={fieldMode()}
        monitorTab={monitorTab()}
        operationDate={operationDate()}
        operatorVehicle={operatorVehicle()}
        vehicles={fieldMode() ? operatorFleet() : liveFleet()}
        routeSnapshot={routeSnapshot()}
        containers={monitoringData()?.containers}
        dailyPlanId={dailyPlan()?.id ?? dailyPlanIdParam()}
        onBreakdownComplete={() => {
          void refetch();
          void refetchRouteSnapshot();
          setIncidentsRefreshKey((value) => value + 1);
        }}
        onRecalcComplete={() => void refetch()}
        canOpenPlayback={canOpenPlayback()}
        playbackOpen={playbackOpen()}
        onOpenPlayback={handleOpenPlayback}
        canSimulateAdvance={canSimulateFleetAdvance(authUser()?.role)}
        isSupervisor={isOperationalSupervisor(authUser()?.role)}
        advancing={advancing()}
        inRouteCount={monitoringData()?.fleetCounts.inRoute ?? 0}
        onAdvance={handleAdvance}
      />

      <Show when={monitorTab() === 'map' && playbackOpen() && !fieldMode()}>
      <MonitoringPlaybackPanel
        open={playbackOpen()}
        mode={playbackMode()}
        onModeChange={setPlaybackMode}
        onClose={handleClosePlayback}
        routes={playbackRoutes()}
        playback={playback}
        fieldMode={fieldMode()}
        loading={playbackPayload.loading}
        error={
          playbackPayload.error
            ? playbackPayload.error instanceof Error
              ? playbackPayload.error.message
              : 'No se pudo cargar la reproducción'
            : null
        }
      />
      </Show>

      <Show when={fieldMode()}>
        <OperatorNextStopCard
          snapshot={routeSnapshot()}
          vehicle={operatorVehicle()}
          onNavigate={navigateToNextStop}
          playbackSync={playbackSync()}
        />
      </Show>

      <Show when={monitorTab() === 'map'}>
      <div class={`grid items-stretch gap-4 ${fieldMode() ? '' : 'xl:grid-cols-5'}`}>
        <MonitoringMapCard
          fieldMode={fieldMode()}
          search={search()}
          onSearchChange={setSearch}
          statusFilter={statusFilter()}
          onStatusFilterChange={setStatusFilter}
          legendOpen={legendOpen()}
          onToggleLegend={() => setLegendOpen((v) => !v)}
          mapRef={mapRef}
          mapReady={mapReady()}
          mapInstance={mapInstance()}
          playbackOpen={playbackOpen()}
          playbackMode={playbackMode()}
          playback={playback}
          playbackRoutes={playbackRoutes()}
          operatorVehicle={operatorVehicle()}
          onCenterVehicle={centerOnVehicle}
          mapFleet={mapFleet()}
          operationalRoutes={operationalRoutes()}
          onMapReady={handleMonitoringMapReady}
          onStyleRestored={() => setupMonitoringMap(mapRef.current!)}
        />

        <Show when={!fieldMode()}>
          <MonitoringFleetList
            fleet={filteredFleet()}
            selectedId={selectedId()}
            onSelect={selectVehicle}
            emptyPreset={fleetEmptyPreset()}
          />
        </Show>
      </div>
      </Show>

      <Show when={fieldMode()}>
        <OperatorFieldBottomPanel
          open={fieldPanelOpen()}
          onToggle={() => setFieldPanelOpen((value) => !value)}
          vehicle={operatorVehicle()}
          snapshot={routeSnapshot()}
          operationDate={operationDate()}
          onCenterVehicle={() => {
            const vehicle = operatorVehicle();
            if (vehicle) centerOnVehicle(vehicle.id);
          }}
        />
      </Show>

      <Show when={fieldMode()}>
        <OperatorMyIncidents
          vehicleId={operatorVehicle()?.id}
          refreshKey={incidentsRefreshKey()}
        />
      </Show>

      <Show when={!fieldMode() && monitorTab() === 'incidents'}>
        <MonitoringContextPanel
          activities={liveActivities()}
          routeProgress={displayRouteProgress()}
          alerts={monitoringAlerts()}
        />
        <RecentIncidentsPanel refreshKey={incidentsRefreshKey()} />
      </Show>
      </div>
    </div>
  );
}
