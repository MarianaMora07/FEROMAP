import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { A, useSearchParams } from '@solidjs/router';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  AlertTriangle,
  BookOpen,
  Car,
  CloudRain,
  Crosshair,
  FastForward,
  Maximize2,
  Minus,
  Plus,
  Scale,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  Truck,
  User,
} from 'lucide-solid';
import {
  Button,
  Card,
  CardHeader,
  KpiCard,
  ProgressBar,
  StatusBadge,
} from '../../design-system/components';
import {
  advanceActiveRoutes,
  advanceRouteById,
  fetchMonitoringStatus,
  type MonitoringKpi,
} from '../../core/api/monitoring';
import { fetchDailyPlan } from '../../core/api/planning';
import { fetchOperatorRouteSnapshot } from '../../core/api/operator';
import { MAP_CONTEXT_POLL_MS } from '../../core/api/map';
import {
  ensureOperationalRouteLayer,
  syncContainerMarkers,
  syncFleetMarkers,
} from '../../core/map/operationalMapLayers';
import { appState } from '../../core/stores/appStore';
import { canSimulateFleetAdvance, isConductor, isOperationalSupervisor } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { optimizationHref } from '../../core/planning/operationalLinks';
import { parsePlaybackQueryParam } from '../../core/planning/operationalFlowUx';
import { BreakdownReporter, ContingencyResultBanner } from '../contingency/BreakdownReporter';
import { OperatorContingencyBanner } from '../contingency/OperatorContingencyBanner';
import { OperatorMyIncidents } from '../contingency/OperatorMyIncidents';
import { CriticalContainerRecalc } from './CriticalContainerRecalc';
import { RecentIncidentsPanel } from '../contingency/RecentIncidentsPanel';
import { PlanningLevelBanner } from '../planning/PlanningLevelBanner';
import { PlanningStatusBadge } from '../planning/PlanningStatusBadge';
import { PlanningEmptyState } from '../planning/PlanningEmptyState';
import { PLANNING_EMPTY_PRESETS } from '../../core/planning/planningEmptyStates';
import { OPERATOR_EMPTY_PRESETS } from '../../core/operator/operatorEmptyStates';
import { fleetForOperatorField } from '../../core/operator/operatorMonitoringUx';
import { parseVehicleIdParam } from '../../core/operator/operatorDeepLinks';
import {
  OperatorFieldBottomPanel,
  OperatorNextStopCard,
} from './OperatorFieldPanel';
import {
  MonitoringPlaybackPanel,
  MonitoringPlaybackToggle,
} from './MonitoringPlaybackPanel';
import { fetchDailyRoutePlayback } from '../../core/api/routePlayback';
import { useRoutePlayback } from '../../core/route-playback/useRoutePlayback';
import { RoutePlaybackLayer } from '../route-playback/RoutePlaybackLayer';
import { RoutePlaybackLegend } from '../route-playback/RoutePlaybackLegend';
import {
  canShowMonitoringRoutePlayback,
  filterPlaybackRoutesForMonitoring,
  initialCompletedStopsByRoute,
  mergeRouteProgressWithPlayback,
  monitoringPlaybackInitialProgress,
  type MonitoringPlaybackMode,
} from '../../core/monitoring/monitoringPlaybackUx';
import { mockDailyRoutePlayback } from '../../data/mock/routePlayback';
import { bindMapTheme, mapStyleForTheme } from '../../core/utils/mapStyle';
import {
  createOperationalMapOptions,
  fitMapToOperationalData,
} from '../../core/map/operationalMapConfig';
import {
  currentConditions,
  vehicleFilterOptions,
  type FleetLiveStatus,
  type LiveVehicle,
} from '../../data/mock/monitoring';

const activityTone = {
  success: 'bg-fero-green/15 text-fero-green-dark',
  info: 'bg-fero-blue/10 text-fero-blue',
  warning: 'bg-amber-100 text-amber-600',
  danger: 'bg-red-50 text-red-500',
  default: 'bg-app text-slate-500',
};

const routeBarColor = {
  green: 'green' as const,
  blue: 'blue' as const,
  purple: 'green' as const,
  amber: 'amber' as const,
};

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

function KpiIcon(props: { name: MonitoringKpi['icon'] }) {
  switch (props.name) {
    case 'truck':
      return <Truck size={22} />;
    case 'trash':
      return <Trash2 size={22} />;
    case 'scale':
      return <Scale size={22} />;
    case 'shield':
      return <ShieldAlert size={22} />;
    case 'user':
      return <User size={22} />;
  }
}

function statusForBadge(status: FleetLiveStatus) {
  return status;
}

export default function MonitoringPage() {
  const [searchParams] = useSearchParams();
  let mapContainer!: HTMLDivElement;
  const mapRef: { current?: MapLibreMap } = {};
  const markersById = new Map<string, Marker>();
  const binMarkers: Marker[] = [];

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
    () => (playbackOpen() ? playbackPlanId() : null),
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
  const playback = useRoutePlayback(() => playbackRoutes(), { pauseAtStops: true });
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

    ensureOperationalRouteLayer(map, operationalRoutes(), 'live-routes', { splitByStatus: true });

    if (playbackOpen() && map.getLayer('live-routes-active')) {
      map.setPaintProperty('live-routes-active', 'line-opacity', 0.2);
      map.setPaintProperty('live-routes-pending', 'line-opacity', 0.15);
    } else if (map.getLayer('live-routes-active')) {
      map.setPaintProperty('live-routes-active', 'line-opacity', 0.95);
      map.setPaintProperty('live-routes-pending', 'line-opacity', 0.75);
    }

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
    if (!playbackOpen()) {
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

  bindMapTheme(
    () => mapRef.current,
    mapReady,
    () => setupMonitoringMap(mapRef.current!),
  );

  onMount(() => {
    const map = new maplibregl.Map(
      createOperationalMapOptions({
        container: mapContainer,
        style: mapStyleForTheme(appState.darkMode),
      }),
    );
    mapRef.current = map;
    setMapInstance(map);
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      map.resize();
      setupMonitoringMap(map);
      setMapReady(true);
      const first = mapFleet()[0];
      if (first) openVehiclePopup(first.id);
    });

    const onPopupClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement | null)?.closest?.('.popup-ver-vehiculo') as HTMLElement | null;
      if (!btn?.dataset.vehicleId) return;
      setSelectedId(btn.dataset.vehicleId);
    };
    document.addEventListener('click', onPopupClick);

    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(mapContainer);

    const pollTimer = window.setInterval(() => {
      void refetch();
    }, MAP_CONTEXT_POLL_MS);

    onCleanup(() => {
      window.clearInterval(pollTimer);
      document.removeEventListener('click', onPopupClick);
      ro.disconnect();
      markersById.forEach((m) => m.remove());
      markersById.clear();
      binMarkers.forEach((m) => m.remove());
      mapRef.current?.remove();
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
    return 'Monitoreo en tiempo real';
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
      <PlanningLevelBanner level="operativo" title={monitoringBannerTitle()}>
        <Show when={isConductor(authUser()?.role)}>
          <p class="text-sm text-text-secondary">
            Ejecuta tu ruta, reporta incidencias y consulta el avance.{' '}
            <A href="/operator" class="font-semibold text-fero-blue hover:underline">
              Volver a Mi operación
            </A>
          </p>
        </Show>
        <Show when={isOperationalSupervisor(authUser()?.role)}>
          <p class="text-sm text-text-secondary">
            Modo supervisión — revisa flota e incidencias sin operar como conductor.{' '}
            <A
              href={optimizationHref({
                date: operationDate(),
                dailyPlanId: dailyPlan()?.id ?? dailyPlanIdParam(),
              })}
              class="font-semibold text-fero-blue hover:underline"
            >
              Volver al plan del día
            </A>
          </p>
        </Show>
      </PlanningLevelBanner>
      <Show when={fieldMode()}>
        <OperatorContingencyBanner />
      </Show>
      <Show when={!fieldMode()}>
        <ContingencyResultBanner />
      </Show>

      <Show when={dailyPlan()}>
        {(plan) => (
          <div class="rounded-xl border border-fero-blue/30 bg-fero-blue/5 px-4 py-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-semibold text-fero-blue">Plan del día {plan().operationDate}</p>
                <PlanningStatusBadge status={plan().status} />
              </div>
              <Show when={!isConductor(authUser()?.role)}>
                <A
                  href={optimizationHref({
                    date: plan().operationDate,
                    dailyPlanId: plan().id ?? dailyPlanIdParam(),
                  })}
                  class="text-xs font-semibold text-fero-blue hover:underline"
                >
                  Abrir en optimización
                </A>
              </Show>
            </div>
            <p class="mt-1 text-sm text-text-secondary">
              {plan().finalPointIds.length} puntos en plan · {plan().pendingPoints.length} pendientes incorporados
            </p>
          </div>
        )}
      </Show>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-text-secondary">
          <Show
            when={fieldMode()}
            fallback={
              <>
                Datos en vivo desde la API · {monitoringData()?.fleetCounts.inRoute ?? 0} vehículos en ruta
              </>
            }
          >
            Tu vehículo en campo
            <Show when={operatorVehicle()}>
              {(vehicle) => <span class="font-semibold text-text-primary"> · {vehicle().id}</span>}
            </Show>
          </Show>
          <Show when={operationDate() !== new Date().toISOString().slice(0, 10)}>
            <span class="ml-1 text-text-muted">· Contexto: {operationDate()}</span>
          </Show>
        </p>
        <div id="reportar-averia" class="flex flex-wrap items-center gap-2">
          <BreakdownReporter
            variant={fieldMode() ? 'operator' : 'planner'}
            compact={!fieldMode()}
            vehicles={(fieldMode() ? operatorFleet() : liveFleet()).map((v) => ({
              id: v.id,
              routeId: v.routeId,
              status: v.status,
            }))}
            onComplete={() => {
              void refetch();
              void refetchRouteSnapshot();
              setIncidentsRefreshKey((value) => value + 1);
            }}
          />
          <Show when={fieldMode() && (routeSnapshot()?.stops.length ?? 0) > 0}>
            <CriticalContainerRecalc
              compact
              containers={monitoringData()?.containers}
              dailyPlanId={dailyPlan()?.id ?? dailyPlanIdParam()}
              routePointCodes={routeSnapshot()?.stops.map((stop) => stop.code) ?? []}
              onComplete={() => void refetch()}
            />
          </Show>
          <Show when={!fieldMode()}>
            <CriticalContainerRecalc
              compact
              containers={monitoringData()?.containers}
              dailyPlanId={dailyPlan()?.id ?? dailyPlanIdParam()}
              onComplete={() => void refetch()}
            />
          </Show>
          <MonitoringPlaybackToggle
            visible={canOpenPlayback()}
            open={playbackOpen()}
            fieldMode={fieldMode()}
            onOpen={handleOpenPlayback}
          />
          <Show
            when={canSimulateFleetAdvance(authUser()?.role)}
            fallback={
              <Show when={isOperationalSupervisor(authUser()?.role)}>
                <p class="max-w-xs text-xs text-text-muted">
                  El avance operativo discreto de flota es solo para conductores en campo.
                </p>
              </Show>
            }
          >
            <Button
              variant="outline"
              size={fieldMode() ? 'lg' : 'sm'}
              class={`gap-2 ${fieldMode() ? 'min-h-12' : ''}`}
              icon={<FastForward size={fieldMode() ? 18 : 16} />}
              disabled={
                advancing() ||
                playbackOpen() ||
                (fieldMode()
                  ? operatorVehicle()?.routeId == null && routeSnapshot()?.routeId == null
                  : !monitoringData()?.fleetCounts.inRoute)
              }
              onClick={() => void handleAdvance()}
              title="Avance operativo simulado (salta parada a parada en BD)"
            >
              {advancing()
                ? 'Avanzando…'
                : fieldMode()
                  ? 'Avance operativo (demo)'
                  : 'Avance operativo flota'}
            </Button>
          </Show>
        </div>
      </div>

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

      <Show when={fieldMode()}>
        <OperatorNextStopCard
          snapshot={routeSnapshot()}
          vehicle={operatorVehicle()}
          onNavigate={navigateToNextStop}
        />
      </Show>

      <Show when={!fieldMode()}>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <For each={monitoringKpis()}>
          {(kpi) => (
            <KpiCard
              title={kpi.title}
              value={kpi.value}
              iconTone={kpi.iconTone}
              icon={<KpiIcon name={kpi.icon} />}
              footer={
                'progress' in kpi && kpi.progress != null ? (
                  <ProgressBar value={kpi.progress} color={kpi.iconTone === 'blue' ? 'blue' : 'green'} size="sm" />
                ) : 'linkLabel' in kpi && kpi.linkLabel ? (
                  <A href="/alerts" class="text-xs font-medium text-fero-blue hover:underline">
                    {kpi.linkLabel}
                  </A>
                ) : undefined
              }
            />
          )}
        </For>
      </div>
      </Show>

      <div class={`grid items-stretch gap-4 ${fieldMode() ? '' : 'xl:grid-cols-5'}`}>
        <Card
          padding={false}
          class={`flex min-h-0 flex-col overflow-hidden xl:h-full ${
            fieldMode() ? 'min-h-[50vh]' : 'xl:col-span-3'
          }`}
        >
          <Show when={!fieldMode()}>
          <div class="flex flex-wrap items-center gap-2 border-b border-default p-3 sm:gap-3 sm:px-4">
            <div class="relative min-w-0 flex-1 basis-48">
              <Search size={14} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                placeholder="Buscar vehículo o conductor..."
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
                class="w-full rounded-md border border-default bg-elevated py-1.5 pl-8 pr-2 text-xs text-text-primary placeholder:text-text-muted focus:border-fero-blue focus:outline-none"
              />
            </div>
            <select
              value={statusFilter()}
              onChange={(e) => setStatusFilter(e.currentTarget.value)}
              class="rounded-md border border-default bg-elevated px-2.5 py-1.5 text-xs text-text-secondary"
            >
              <For each={vehicleFilterOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
            </select>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md border border-default px-2.5 py-1.5 text-xs text-text-secondary hover:bg-app"
            >
              <SlidersHorizontal size={14} />
              Filtros
            </button>
            <button
              type="button"
              class={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${
                legendOpen()
                  ? 'border-fero-green-dark/40 bg-fero-green/15 text-fero-green-dark'
                  : 'border-default text-text-secondary hover:bg-app'
              }`}
              onClick={() => setLegendOpen((v) => !v)}
            >
              <BookOpen size={14} />
              Leyenda
            </button>
          </div>
          </Show>

          <div
            class={`relative min-h-80 flex-1 bg-app ${
              fieldMode() ? 'min-h-[50vh]' : 'lg:min-h-105'
            }`}
          >
            <div ref={mapContainer} class="absolute inset-0 h-full w-full" />

            <Show when={playbackOpen()}>
              <RoutePlaybackLegend class="absolute bottom-16 left-3 z-10 max-w-[220px]" />
              <RoutePlaybackLayer
                map={mapInstance}
                routes={() => playbackRoutes()}
                playback={playback}
                showControls={false}
              />
            </Show>

            <Show when={playbackOpen()}>
              <div class="absolute top-3 left-3 z-10 rounded-md border border-fero-blue/40 bg-elevated/95 px-2.5 py-1.5 text-xs font-semibold text-fero-blue shadow-sm backdrop-blur-sm">
                Reproducción {playbackMode() === 'visual' ? 'solo visual' : 'híbrida'}
              </div>
            </Show>

            <Show when={legendOpen()}>
              <div class="absolute top-3 left-3 z-10 rounded-md border border-default bg-elevated/95 p-2.5 text-xs shadow-md backdrop-blur-sm">
                <p class="mb-1.5 font-semibold text-text-primary">Leyenda</p>
                <ul class="space-y-1 text-text-secondary">
                  <li class="flex items-center gap-2"><Truck size={12} class="text-fero-green-dark" /> En ruta</li>
                  <li class="flex items-center gap-2"><Truck size={12} class="text-amber-500" /> Mantenimiento</li>
                  <li class="flex items-center gap-2"><Truck size={12} class="text-red-500" /> Detenido</li>
                  <li class="flex items-center gap-2"><Trash2 size={12} class="text-fero-green-dark" /> Contenedor normal</li>
                  <li class="flex items-center gap-2"><Trash2 size={12} class="text-amber-500" /> Contenedor lleno</li>
                  <li class="flex items-center gap-2"><Trash2 size={12} class="text-red-500" /> Contenedor crítico</li>
                </ul>
              </div>
            </Show>

            <div class="absolute right-3 bottom-3 z-10 flex flex-col overflow-hidden rounded-md border border-default bg-elevated/95 shadow-sm backdrop-blur-sm">
              <button type="button" class="flex h-8 w-8 items-center justify-center text-text-secondary hover:bg-app disabled:opacity-40" disabled={!mapReady()} onClick={() => mapRef.current?.zoomIn()} aria-label="Acercar">
                <Plus size={14} />
              </button>
              <button type="button" class="flex h-8 w-8 items-center justify-center border-t border-default text-text-secondary hover:bg-app disabled:opacity-40" disabled={!mapReady()} onClick={() => mapRef.current?.zoomOut()} aria-label="Alejar">
                <Minus size={14} />
              </button>
              <button type="button" class="flex h-8 w-8 items-center justify-center border-t border-default text-text-secondary hover:bg-app disabled:opacity-40" disabled={!mapReady()} onClick={() => {
                const vehicle = operatorVehicle();
                if (vehicle) centerOnVehicle(vehicle.id);
                else fitMapToOperationalData(mapRef.current!, {
                  vehicles: mapFleet(),
                  routes: operationalRoutes(),
                });
              }} aria-label="Centrar">
                <Crosshair size={14} />
              </button>
              <button type="button" class="flex h-8 w-8 items-center justify-center border-t border-default text-text-secondary hover:bg-app" aria-label="Pantalla completa" onClick={() => document.documentElement.requestFullscreen?.()}>
                <Maximize2 size={14} />
              </button>
            </div>
          </div>
        </Card>

        <Show when={!fieldMode()}>
        <Card padding={false} class="flex max-h-125 flex-col overflow-hidden xl:col-span-2 xl:max-h-none xl:h-full">
          <div class="flex items-center justify-between border-b border-default px-4 py-3">
            <h3 class="font-heading font-semibold text-text-primary">Estado de la flota</h3>
            <A href="/vehicles" class="text-xs font-medium text-fero-blue hover:underline">
              Ver todas
            </A>
          </div>
          <ul class="min-h-0 flex-1 divide-y divide-default overflow-y-auto">
            <Show
              when={filteredFleet().length > 0}
              fallback={
                <li>
                  <PlanningEmptyState {...fleetEmptyPreset()} compact />
                </li>
              }
            >
            <For each={filteredFleet()}>
              {(v) => (
                <li>
                  <button
                    type="button"
                    class={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-app ${
                      selectedId() === v.id ? 'bg-fero-green/5' : ''
                    }`}
                    onClick={() => selectVehicle(v)}
                  >
                    <img
                      src={v.image}
                      alt={v.id}
                      class="h-11 w-14 shrink-0 rounded-md object-cover bg-app"
                      loading="lazy"
                      referrerpolicy="no-referrer"
                    />
                    <div class="min-w-0 flex-1">
                      <div class="mb-0.5 flex flex-wrap items-center gap-2">
                        <span class="text-sm font-semibold text-text-primary">{v.id}</span>
                        <StatusBadge status={statusForBadge(v.status)} />
                      </div>
                      <p class="truncate text-xs text-text-muted">{v.route}</p>
                      <p class="truncate text-xs text-text-secondary">{v.driver}</p>
                      <div class="mt-1.5 flex items-center gap-2">
                        <ProgressBar value={v.progress} color="green" size="sm" class="min-w-0 flex-1" />
                        <span class="shrink-0 text-[11px] font-medium text-text-secondary">
                          {v.speedKmh == null ? '—' : `${v.speedKmh} km/h`}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              )}
            </For>
            </Show>
          </ul>
          <div class="border-t border-default px-4 py-2.5">
            <A href="/vehicles" class="text-sm font-medium text-fero-blue hover:underline">
              Ver todos los vehículos
            </A>
          </div>
        </Card>
        </Show>
      </div>

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

      <Show when={!fieldMode()}>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader title="Actividades en tiempo real" />
          <ul class="space-y-3">
            <For each={liveActivities()}>
              {(a) => (
                <li class="flex gap-2.5">
                  <span class={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${activityTone[a.tone]}`}>
                    <ActivityDot tone={a.tone} />
                  </span>
                  <div class="min-w-0">
                    <p class="text-[11px] text-text-muted">{a.time}</p>
                    <p class="text-sm text-text-secondary">{a.text}</p>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Card>

        <Card>
          <CardHeader title="Progreso de recolección por ruta" />
          <ul class="space-y-3.5">
            <For each={displayRouteProgress()}>
              {(r) => (
                <li>
                  <div class="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span class="font-medium text-text-primary">{r.label}</span>
                    <span class="text-xs text-text-muted">
                      {r.done} / {r.total} puntos · <span class="font-semibold text-text-secondary">{r.pct}%</span>
                    </span>
                  </div>
                  <ProgressBar value={r.pct} color={routeBarColor[r.color]} size="sm" />
                </li>
              )}
            </For>
          </ul>
        </Card>

        <Card>
          <CardHeader title="Alertas e incidencias" />
          <ul class="space-y-3">
            <For each={monitoringAlerts()}>
              {(al) => (
                <li class="flex gap-2.5">
                  <span
                    class={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      al.tone === 'danger' ? 'bg-red-50 text-red-500' : 'bg-amber-100 text-amber-600'
                    }`}
                  >
                    <AlertTriangle size={14} />
                  </span>
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-text-primary">{al.title}</p>
                    <p class="text-xs text-text-secondary">{al.detail}</p>
                    <p class="mt-0.5 text-[11px] text-text-muted">{al.time}</p>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Card>

        <Card>
          <CardHeader title="Condiciones actuales" />
          <ul class="space-y-3">
            <li class="flex items-center gap-3">
              <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-fero-blue/10 text-fero-blue">
                <CloudRain size={18} />
              </span>
              <div>
                <p class="text-xs text-text-muted">Clima</p>
                <p class="text-sm font-semibold text-text-primary">
                  {currentConditions.weather.label} · {currentConditions.weather.tempC}°C
                </p>
              </div>
            </li>
            <li class="flex items-center gap-3">
              <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                <Car size={18} />
              </span>
              <div>
                <p class="text-xs text-text-muted">Tráfico</p>
                <p class="text-sm font-semibold text-text-primary">{currentConditions.traffic}</p>
              </div>
            </li>
            <li class="flex items-center gap-3">
              <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-500">
                <AlertTriangle size={18} />
              </span>
              <div>
                <p class="text-xs text-text-muted">Vías afectadas</p>
                <p class="text-sm font-semibold text-text-primary">
                  {currentConditions.affectedRoads}
                </p>
              </div>
            </li>
          </ul>
          <A href="/map" class="mt-4 inline-flex text-sm font-medium text-fero-blue hover:underline">
            Ver en mapa
          </A>
        </Card>
      </div>
      </Show>

      <Show when={!fieldMode()}>
      <RecentIncidentsPanel refreshKey={incidentsRefreshKey()} />
      </Show>
    </div>
  );
}

function ActivityDot(props: { tone: keyof typeof activityTone }) {
  const icon: Record<keyof typeof activityTone, () => JSX.Element> = {
    success: () => <Trash2 size={12} />,
    info: () => <Truck size={12} />,
    warning: () => <Car size={12} />,
    danger: () => <AlertTriangle size={12} />,
    default: () => <Truck size={12} />,
  };
  return icon[props.tone]();
}
