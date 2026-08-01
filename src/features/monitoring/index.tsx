import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { A } from '@solidjs/router';
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
  fetchMonitoringStatus,
  type MonitoringKpi,
} from '../../core/api/monitoring';
import { MAP_CONTEXT_POLL_MS } from '../../core/api/map';
import {
  ensureOperationalRouteLayer,
  syncContainerMarkers,
  syncFleetMarkers,
} from '../../core/map/operationalMapLayers';
import { appState } from '../../core/stores/appStore';
import { canAdvanceFleet } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { BreakdownReporter, ContingencyResultBanner } from '../contingency/BreakdownReporter';
import { RecentIncidentsPanel } from '../contingency/RecentIncidentsPanel';
import { bindMapTheme, mapStyleForTheme } from '../../core/utils/mapStyle';
import { UNARE_CENTER, UNARE_ZOOM } from '../../data/types/geo';
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
  default: 'bg-slate-100 text-slate-500',
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
  let mapContainer!: HTMLDivElement;
  const mapRef: { current?: MapLibreMap } = {};
  const markersById = new Map<string, Marker>();
  const binMarkers: Marker[] = [];

  const [monitoringData, { refetch }] = createResource(fetchMonitoringStatus);
  const [advancing, setAdvancing] = createSignal(false);
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

    ensureOperationalRouteLayer(map, operationalRoutes(), 'live-routes', 'live-routes-line');

    syncContainerMarkers(map, operationalContainers(), binMarkers, {
      createMarkerElement: (color) => createPin(color, trashSvg('#fff'), 24),
    });

    syncFleetMarkers(map, liveFleet(), markersById, {
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

    const first = liveFleet()[0];
    if (first && !selectedId()) setSelectedId(first.id);
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
      await advanceActiveRoutes();
      await refetch();
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
    const map = new maplibregl.Map({
      container: mapContainer,
      style: mapStyleForTheme(appState.darkMode),
      center: UNARE_CENTER,
      zoom: UNARE_ZOOM - 0.2,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      map.resize();
      setupMonitoringMap(map);
      setMapReady(true);
      const first = liveFleet()[0];
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
    });
  });

  const selectVehicle = (v: LiveVehicle) => {
    setSelectedId(v.id);
    if (mapReady()) openVehiclePopup(v.id);
  };

  createEffect(() => {
    monitoringData();
    if (mapReady()) syncOperationalMap();
  });

  return (
    <div class="space-y-5">
      <ContingencyResultBanner />

      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-text-secondary">
          Datos en vivo desde la API · {monitoringData()?.fleetCounts.inRoute ?? 0} vehículos en ruta
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <BreakdownReporter
            compact
            vehicles={liveFleet().map((v) => ({ id: v.id, routeId: v.routeId, status: v.status }))}
            onComplete={() => {
              void refetch();
              setIncidentsRefreshKey((value) => value + 1);
            }}
          />
          <Button
          variant="primary"
          size="sm"
          class="gap-2"
          icon={<FastForward size={16} />}
          disabled={advancing() || !monitoringData()?.fleetCounts.inRoute || !canAdvanceFleet(authUser()?.role)}
          onClick={() => void handleAdvance()}
        >
          {advancing() ? 'Avanzando…' : 'Simular avance de flota'}
        </Button>
        </div>
      </div>

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

      <div class="grid items-stretch gap-4 xl:grid-cols-5">
        <Card padding={false} class="flex min-h-0 flex-col overflow-hidden xl:col-span-3 xl:h-full">
          <div class="flex flex-wrap items-center gap-2 border-b border-border p-3 dark:border-dark-border sm:gap-3 sm:px-4">
            <div class="relative min-w-0 flex-1 basis-48">
              <Search size={14} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                placeholder="Buscar vehículo o conductor..."
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
                class="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-2 text-xs text-text-primary placeholder:text-text-muted focus:border-fero-blue focus:outline-none dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
              />
            </div>
            <select
              value={statusFilter()}
              onChange={(e) => setStatusFilter(e.currentTarget.value)}
              class="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-secondary dark:bg-dark-surface-hover dark:border-dark-border"
            >
              <For each={vehicleFilterOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
            </select>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-hover"
            >
              <SlidersHorizontal size={14} />
              Filtros
            </button>
            <button
              type="button"
              class={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${
                legendOpen()
                  ? 'border-fero-green-dark/40 bg-fero-green/15 text-fero-green-dark'
                  : 'border-border text-text-secondary hover:bg-surface-hover'
              }`}
              onClick={() => setLegendOpen((v) => !v)}
            >
              <BookOpen size={14} />
              Leyenda
            </button>
          </div>

          <div class="relative min-h-80 flex-1 bg-slate-100 dark:bg-slate-900 lg:min-h-105">
            <div ref={mapContainer} class="absolute inset-0 h-full w-full" />

            <Show when={legendOpen()}>
              <div class="absolute top-3 left-3 z-10 rounded-md border border-border bg-surface/95 p-2.5 text-xs shadow-md backdrop-blur-sm dark:bg-dark-surface/95">
                <p class="mb-1.5 font-semibold text-text-primary dark:text-white">Leyenda</p>
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

            <div class="absolute right-3 bottom-3 z-10 flex flex-col overflow-hidden rounded-md border border-border bg-surface/95 shadow-sm backdrop-blur-sm dark:bg-dark-surface/95">
              <button type="button" class="flex h-8 w-8 items-center justify-center text-text-secondary hover:bg-surface-hover disabled:opacity-40" disabled={!mapReady()} onClick={() => mapRef.current?.zoomIn()} aria-label="Acercar">
                <Plus size={14} />
              </button>
              <button type="button" class="flex h-8 w-8 items-center justify-center border-t border-border text-text-secondary hover:bg-surface-hover disabled:opacity-40" disabled={!mapReady()} onClick={() => mapRef.current?.zoomOut()} aria-label="Alejar">
                <Minus size={14} />
              </button>
              <button type="button" class="flex h-8 w-8 items-center justify-center border-t border-border text-text-secondary hover:bg-surface-hover disabled:opacity-40" disabled={!mapReady()} onClick={() => mapRef.current?.flyTo({ center: UNARE_CENTER, zoom: UNARE_ZOOM - 0.2 })} aria-label="Centrar">
                <Crosshair size={14} />
              </button>
              <button type="button" class="flex h-8 w-8 items-center justify-center border-t border-border text-text-secondary hover:bg-surface-hover" aria-label="Pantalla completa" onClick={() => document.documentElement.requestFullscreen?.()}>
                <Maximize2 size={14} />
              </button>
            </div>
          </div>
        </Card>

        <Card padding={false} class="flex max-h-125 flex-col overflow-hidden xl:col-span-2 xl:max-h-none xl:h-full">
          <div class="flex items-center justify-between border-b border-border px-4 py-3 dark:border-dark-border">
            <h3 class="font-heading font-semibold text-text-primary dark:text-white">Estado de la flota</h3>
            <A href="/vehicles" class="text-xs font-medium text-fero-blue hover:underline">
              Ver todas
            </A>
          </div>
          <ul class="min-h-0 flex-1 divide-y divide-border overflow-y-auto dark:divide-dark-border">
            <For each={filteredFleet()}>
              {(v) => (
                <li>
                  <button
                    type="button"
                    class={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover ${
                      selectedId() === v.id ? 'bg-fero-green/5' : ''
                    }`}
                    onClick={() => selectVehicle(v)}
                  >
                    <img
                      src={v.image}
                      alt={v.id}
                      class="h-11 w-14 shrink-0 rounded-md object-cover bg-slate-100"
                      loading="lazy"
                      referrerpolicy="no-referrer"
                    />
                    <div class="min-w-0 flex-1">
                      <div class="mb-0.5 flex flex-wrap items-center gap-2">
                        <span class="text-sm font-semibold text-text-primary dark:text-white">{v.id}</span>
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
          </ul>
          <div class="border-t border-border px-4 py-2.5 dark:border-dark-border">
            <A href="/vehicles" class="text-sm font-medium text-fero-blue hover:underline">
              Ver todos los vehículos
            </A>
          </div>
        </Card>
      </div>

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
            <For each={routeProgress()}>
              {(r) => (
                <li>
                  <div class="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span class="font-medium text-text-primary dark:text-white">{r.label}</span>
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
                    <p class="text-sm font-semibold text-text-primary dark:text-white">{al.title}</p>
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
                <p class="text-sm font-semibold text-text-primary dark:text-white">
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
                <p class="text-sm font-semibold text-text-primary dark:text-white">{currentConditions.traffic}</p>
              </div>
            </li>
            <li class="flex items-center gap-3">
              <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-500">
                <AlertTriangle size={18} />
              </span>
              <div>
                <p class="text-xs text-text-muted">Vías afectadas</p>
                <p class="text-sm font-semibold text-text-primary dark:text-white">
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

      <RecentIncidentsPanel refreshKey={incidentsRefreshKey()} />
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
