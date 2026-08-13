import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount } from 'solid-js';
import { A, useSearchParams } from '@solidjs/router';
import {
  Chart,
  ArcElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut } from 'solid-chartjs';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Eye,
  Info,
  Minus,
  MoreVertical,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  Truck,
} from 'lucide-solid';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  KpiCard,
  StatusBadge,
} from '../../design-system/components';
import { bindMapTheme, mapStyleForTheme } from '../../core/utils/mapStyle';
import { appState } from '../../core/stores/appStore';
import {
  createOperationalMapOptions,
  fitMapToOperationalData,
} from '../../core/map/operationalMapConfig';
import {
  alertCategoryOptions,
  alertStatusOptions,
  alertsKpis,
  alertsList,
  mapAlertLegend,
  priorityColor,
  type AlertPriority,
} from '../../data/mock/alerts';
import {
  computeAlertsByCategory,
  computeAlertsDistribution,
  computeAlertsKpis,
  fetchAlertActivity,
  fetchAlerts,
  statsToKpis,
  updateAlertStatus,
} from '../../core/api/alerts';
import { fetchOperatorRouteSnapshot } from '../../core/api/operator';
import { fetchResidentOverview } from '../../core/api/resident';
import { fetchRecentIncidents } from '../../core/api/contingencies';
import { isConductor, isResident } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import {
  buildOperatorAlertContext,
  filterOperatorAlerts,
} from '../../core/operator/operatorAlertsUx';
import { operatorMapHref, parseVehicleIdParam } from '../../core/operator/operatorDeepLinks';
import { OPERATOR_EMPTY_PRESETS } from '../../core/operator/operatorEmptyStates';
import {
  buildResidentSectorAlerts,
  parseResidentAlertScope,
  residentAlertsAsSystemAlerts,
} from '../../core/resident/residentAlertsUx';
import { residentMapHref } from '../../core/resident/residentDeepLinks';
import { RESIDENT_EMPTY_PRESETS } from '../../core/resident/residentEmptyStates';
import { PlanningEmptyState } from '../planning/PlanningEmptyState';

function KpiIcon(props: { name: (typeof alertsKpis)[number]['icon'] }) {
  switch (props.name) {
    case 'alert':
      return <AlertTriangle size={22} />;
    case 'info':
      return <Info size={22} />;
    case 'check':
      return <CheckCircle2 size={22} />;
    case 'chart':
      return <TrendingUp size={22} />;
  }
}

function Sparkline(props: { values: number[] }) {
  const w = 100;
  const h = 24;
  const min = Math.min(...props.values);
  const max = Math.max(...props.values);
  const range = max - min || 1;
  const points = props.values
    .map((v, i) => {
      const x = (i / (props.values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} class="mt-2 h-6 w-full max-w-28" aria-hidden="true">
      <polyline
        fill="none"
        stroke="#1143F3"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        points={points}
      />
    </svg>
  );
}

function PriorityBadge(props: { priority: AlertPriority }) {
  const map: Record<AlertPriority, { variant: 'danger' | 'warning' | 'info'; label: string }> = {
    critica: { variant: 'danger', label: 'Crítica' },
    advertencia: { variant: 'warning', label: 'Advertencia' },
    informativa: { variant: 'info', label: 'Informativa' },
  };
  const c = map[props.priority];
  return (
    <Badge variant={c.variant} dot>
      {c.label}
    </Badge>
  );
}

function createAlertPin(color: string) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'alert-marker';
  el.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:${color};box-shadow:0 2px 8px rgba(0,0,0,.25);border:2px solid #fff"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></span>`;
  return el;
}

export default function AlertsPage() {
  const [searchParams] = useSearchParams();
  const highlightAlertId = () => {
    const raw = searchParams.id;
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const operatorScope = () => {
    const scope = Array.isArray(searchParams.scope) ? searchParams.scope[0] : searchParams.scope;
    return isConductor(authUser()?.role) || scope === 'mine';
  };
  const residentScope = () => {
    const scope = Array.isArray(searchParams.scope) ? searchParams.scope[0] : searchParams.scope;
    return isResident(authUser()?.role) || parseResidentAlertScope(scope);
  };
  const operationDate = () => new Date().toISOString().slice(0, 10);

  let mapContainer!: HTMLDivElement;
  const mapRef: { current?: MapLibreMap } = {};
  const markers: Marker[] = [];

  const [refreshToken, setRefreshToken] = createSignal(0);
  const [alertsData] = createResource(refreshToken, () => fetchAlerts());
  const [activityData] = createResource(refreshToken, () => fetchAlertActivity());
  const [routeSnapshot] = createResource(
    () => (operatorScope() ? operationDate() : null),
    (date) => (date ? fetchOperatorRouteSnapshot(date) : Promise.resolve(undefined)),
  );
  const vehicleId = () =>
    parseVehicleIdParam(searchParams.vehicleId) ?? routeSnapshot()?.vehicleId ?? undefined;
  const [incidents] = createResource(
    () => (operatorScope() ? vehicleId() : null),
    (id) => (id ? fetchRecentIncidents({ vehicleId: id, hours: 48 }) : Promise.resolve([])),
  );
  const [residentOverview] = createResource(
    () => (residentScope() ? 'resident-alerts' : null),
    () => fetchResidentOverview(),
  );
  const operatorAlertContext = createMemo(() =>
    buildOperatorAlertContext({
      vehicleId: vehicleId(),
      stops: routeSnapshot()?.stops,
      incidentAlertIds: (incidents() ?? [])
        .map((incident) => incident.relatedAlertId)
        .filter((id): id is string => Boolean(id)),
    }),
  );
  const [actionLoading, setActionLoading] = createSignal<string | null>(null);
  const [openMenuId, setOpenMenuId] = createSignal<string | null>(null);

  const alertsListData = () => alertsData()?.alerts ?? alertsList.filter((a) => a.status !== 'resuelta');
  const operatorAlertsList = createMemo(() => {
    if (!operatorScope()) return alertsListData();
    return filterOperatorAlerts(alertsListData(), operatorAlertContext());
  });
  const residentAlertsList = createMemo(() => {
    const overview = residentOverview();
    if (!residentScope() || !overview) return [];
    return residentAlertsAsSystemAlerts(
      buildResidentSectorAlerts({
        overview,
        systemAlerts: alertsListData(),
      }),
    );
  });
  const activeAlertsList = () => {
    if (residentScope()) return residentAlertsList();
    if (operatorScope()) return operatorAlertsList();
    return alertsListData();
  };
  const showOperatorRouteEmpty = () =>
    operatorScope() && !residentScope() && !alertsData.loading && operatorAlertsList().length === 0;
  const showResidentSectorEmpty = () =>
    residentScope() && !alertsData.loading && !residentOverview.loading && residentAlertsList().length === 0;
  const operatorMapLink = () =>
    operatorMapHref({
      date: operationDate(),
      vehicleId: vehicleId(),
      focus: 'route',
    });
  const residentMapLink = () =>
    residentMapHref({
      focus: 'sector',
      sectorId: authUser()?.sectorId ?? undefined,
    });
  const alertsKpisData = () => {
    if ((operatorScope() || residentScope()) && activeAlertsList().length > 0) {
      return computeAlertsKpis(activeAlertsList());
    }
    return alertsData()?.stats ? statsToKpis(alertsData()!.stats) : alertsKpis;
  };
  const recentActivity = () => activityData() ?? [];
  const alertsDistribution = () =>
    activeAlertsList().length ? computeAlertsDistribution(activeAlertsList()) : { total: 0, items: [] };
  const alertsByCategory = () =>
    activeAlertsList().length ? computeAlertsByCategory(activeAlertsList()) : [];

  const refetchAlerts = () => setRefreshToken((value) => value + 1);

  const runAlertAction = async (alertId: string, status: 'acknowledged' | 'resolved') => {
    setActionLoading(alertId);
    setOpenMenuId(null);
    try {
      await updateAlertStatus(alertId, status);
      refetchAlerts();
    } finally {
      setActionLoading(null);
    }
  };

  const [search, setSearch] = createSignal('');
  const [categoryFilter, setCategoryFilter] = createSignal('');
  const [statusFilter, setStatusFilter] = createSignal('');
  const [priorityFilter, setPriorityFilter] = createSignal('');
  const [page, setPage] = createSignal(1);
  const [mapReady, setMapReady] = createSignal(false);
  const pageSize = 5;

  const syncAlertMarkers = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    markers.forEach((m) => m.remove());
    markers.length = 0;
    for (const a of activeAlertsList()) {
      const marker = new maplibregl.Marker({ element: createAlertPin(priorityColor[a.priority]) })
        .setLngLat([a.lng, a.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 16, maxWidth: '240px' }).setHTML(
            `<strong style="font-size:13px;">${a.title}</strong><br/><span style="font-size:12px;color:#64748b">${a.source} · ${a.location}</span>`,
          ),
        )
        .addTo(map);
      markers.push(marker);
    }
    fitMapToOperationalData(map, {
      points: activeAlertsList().map((alert) => ({ lng: alert.lng, lat: alert.lat })),
    });
  };

  bindMapTheme(
    () => mapRef.current,
    mapReady,
    () => syncAlertMarkers(),
  );

  createEffect(() => {
    activeAlertsList();
    syncAlertMarkers();
  });

  onMount(() => {
    Chart.register(ArcElement, CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend);

    const closeMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-alert-menu]')) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('click', closeMenu);

    const map = new maplibregl.Map(
      createOperationalMapOptions({
        container: mapContainer,
        style: mapStyleForTheme(appState.darkMode),
      }),
    );
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      map.resize();
      syncAlertMarkers();
      setMapReady(true);
    });

    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(mapContainer);
    onCleanup(() => {
      document.removeEventListener('click', closeMenu);
      ro.disconnect();
      markers.forEach((m) => m.remove());
      mapRef.current?.remove();
      mapRef.current = undefined;
    });
  });

  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase();
    const cat = categoryFilter();
    const st = statusFilter();
    const pr = priorityFilter();
    return activeAlertsList().filter((a) => {
      if (pr && a.priority !== pr) return false;
      if (cat && a.category !== cat) return false;
      if (st && a.status !== st) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.source.toLowerCase().includes(q) ||
        a.location.toLowerCase().includes(q) ||
        a.detail.toLowerCase().includes(q)
      );
    });
  });

  const total = () => filtered().length;
  const totalPages = () => Math.max(1, Math.ceil(total() / pageSize));
  const pageItems = createMemo(() => {
    const p = Math.min(page(), totalPages());
    const start = (p - 1) * pageSize;
    return filtered().slice(start, start + pageSize);
  });

  const rangeLabel = () => {
    if (total() === 0) return 'Mostrando 0 de 0 alertas';
    const p = Math.min(page(), totalPages());
    const from = (p - 1) * pageSize + 1;
    const to = Math.min(p * pageSize, total());
    return `Mostrando ${from} a ${to} de ${total()} alertas`;
  };

  createEffect(() => {
    const targetId = highlightAlertId();
    if (!targetId || alertsData.loading) return;
    const index = activeAlertsList().findIndex((alert) => alert.id === targetId);
    if (index < 0) return;
    setPage(Math.floor(index / pageSize) + 1);
    queueMicrotask(() => {
      document.getElementById(`alert-row-${targetId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  });

  const focusCritical = () => {
    setPriorityFilter('critica');
    setStatusFilter('');
    setCategoryFilter('');
    setSearch('');
    setPage(1);
  };

  const donutData = () => ({
    labels: alertsDistribution().items.map((i) => i.label),
    datasets: [
      {
        data: alertsDistribution().items.map((i) => i.count),
        backgroundColor: alertsDistribution().items.map((i) => i.color),
        borderWidth: 0,
        cutout: '72%',
      },
    ],
  });

  const maxCategory = () => Math.max(...alertsByCategory().map((c) => c.count), 1);
  const criticalCount = () =>
    activeAlertsList().filter((a) => a.priority === 'critica').length;

  return (
    <div class="space-y-5">
      <Show when={operatorScope() && !residentScope()}>
        <div class="rounded-xl border border-fero-blue/30 bg-fero-blue/5 px-4 py-3">
          <p class="text-sm font-semibold text-fero-blue">Alertas que te afectan hoy</p>
          <p class="mt-0.5 text-xs text-text-secondary">
            Prioridad: tu ruta
            <Show when={vehicleId()}>
              {' '}
              ({vehicleId()})
            </Show>
            , sector y averías reportadas por ti.
          </p>
        </div>
      </Show>
      <Show when={residentScope()}>
        <div
          role="status"
          class="rounded-xl border border-fero-green/30 bg-fero-green/5 px-4 py-3"
        >
          <p class="text-sm font-semibold text-fero-green-dark dark:text-fero-green">
            Avisos de tu sector
            <Show when={residentOverview()?.sectorName}>
              {(sector) => <> — {sector()}</>}
            </Show>
          </p>
          <p class="mt-0.5 text-xs text-text-secondary">
            Prioridad: retraso de ruta, contenedores críticos en tu barrio y cambios de horario. Solo
            consulta — sin alertas de flota interna.
          </p>
        </div>
      </Show>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <For each={alertsKpisData()}>
          {(kpi) => (
            <KpiCard
              title={kpi.title}
              value={kpi.value}
              iconTone={kpi.iconTone}
              icon={<KpiIcon name={kpi.icon} />}
              footer={
                'sparkline' in kpi && kpi.sparkline ? (
                  <div>
                    <p class="text-xs text-text-muted">{kpi.subtitle}</p>
                    <Sparkline values={kpi.sparkline} />
                  </div>
                ) : (
                  <p class="text-xs text-text-muted">{kpi.subtitle}</p>
                )
              }
            />
          )}
        </For>
      </div>

      <div class="grid items-stretch gap-4 xl:grid-cols-5">
        <section class="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xs dark:bg-dark-surface dark:border-dark-border xl:col-span-3">
          <div class="flex flex-wrap items-center gap-2 border-b border-border p-3 dark:border-dark-border sm:gap-3 sm:p-4">
            <h3 class="w-full font-heading font-semibold text-text-primary dark:text-white sm:w-auto sm:mr-auto">
              Lista de alertas
            </h3>
            <div class="relative min-w-0 flex-1 basis-40">
              <Search size={14} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                placeholder="Buscar alertas..."
                value={search()}
                onInput={(e) => {
                  setSearch(e.currentTarget.value);
                  setPage(1);
                }}
                class="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-2 text-xs text-text-primary placeholder:text-text-muted focus:border-fero-blue focus:outline-none dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
              />
            </div>
            <select
              value={categoryFilter()}
              onChange={(e) => {
                setCategoryFilter(e.currentTarget.value);
                setPage(1);
              }}
              class="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text-secondary dark:bg-dark-surface-hover dark:border-dark-border"
            >
              <For each={alertCategoryOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
            </select>
            <select
              value={statusFilter()}
              onChange={(e) => {
                setStatusFilter(e.currentTarget.value);
                setPage(1);
              }}
              class="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text-secondary dark:bg-dark-surface-hover dark:border-dark-border"
            >
              <For each={alertStatusOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
            </select>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-hover"
            >
              <SlidersHorizontal size={14} />
              Filtros
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-auto">
            <table class="w-full min-w-200">
              <thead>
                <tr class="border-b border-border bg-slate-50/80 text-left dark:border-dark-border dark:bg-dark-surface-hover">
                  <th class="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Prioridad</th>
                  <th class="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Alerta</th>
                  <th class="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Fuente</th>
                  <th class="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Ubicación</th>
                  <th class="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Fecha/Hora</th>
                  <th class="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Estado</th>
                  <Show when={!residentScope()}>
                    <th class="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Acciones</th>
                  </Show>
                </tr>
              </thead>
              <tbody class="divide-y divide-border dark:divide-dark-border">
                <For
                  each={pageItems()}
                  fallback={
                    <tr>
                      <td colSpan={residentScope() ? 6 : 7} class="px-3 py-2">
                        <Show
                          when={showResidentSectorEmpty()}
                          fallback={
                            <Show
                              when={showOperatorRouteEmpty()}
                              fallback={
                                <p class="py-6 text-center text-sm text-text-muted">No se encontraron alertas</p>
                              }
                            >
                              <PlanningEmptyState
                                {...OPERATOR_EMPTY_PRESETS.noAlertsOnRoute}
                                actionHref={operatorMapLink()}
                                compact
                              />
                            </Show>
                          }
                        >
                          <PlanningEmptyState
                            {...RESIDENT_EMPTY_PRESETS.noSectorAlerts}
                            actionHref={residentMapLink()}
                            compact
                          />
                        </Show>
                      </td>
                    </tr>
                  }
                >
                  {(a) => (
                    <tr
                      id={`alert-row-${a.id}`}
                      class={`hover:bg-surface-hover ${
                        highlightAlertId() === a.id ? 'bg-fero-blue/10 ring-1 ring-inset ring-fero-blue/30' : ''
                      }`}
                    >
                      <td class="px-3 py-2.5">
                        <PriorityBadge priority={a.priority} />
                      </td>
                      <td class="px-3 py-2.5">
                        <p class="text-sm font-semibold text-text-primary dark:text-white">{a.title}</p>
                        <p class="text-xs text-text-muted">{a.detail}</p>
                      </td>
                      <td class="px-3 py-2.5 text-xs text-text-secondary">{a.source}</td>
                      <td class="max-w-36 truncate px-3 py-2.5 text-xs text-text-secondary" title={a.location}>
                        {a.location}
                      </td>
                      <td class="px-3 py-2.5 text-xs text-text-muted">{a.datetime}</td>
                      <td class="px-3 py-2.5">
                        <StatusBadge status={a.status} />
                      </td>
                      <Show when={!residentScope()}>
                        <td class="px-3 py-2.5">
                          <div class="relative flex items-center gap-0.5" data-alert-menu>
                          <button
                            type="button"
                            class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-fero-blue disabled:opacity-40"
                            aria-label="Marcar como vista"
                            disabled={actionLoading() === a.id || a.status === 'resuelta'}
                            onClick={() => void runAlertAction(a.id, 'acknowledged')}
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            type="button"
                            class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover disabled:opacity-40"
                            aria-label="Más acciones"
                            disabled={actionLoading() === a.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenMenuId((current) => (current === a.id ? null : a.id));
                            }}
                          >
                            <MoreVertical size={14} />
                          </button>
                          <Show when={openMenuId() === a.id}>
                            <div class="absolute right-0 top-8 z-20 min-w-40 rounded-md border border-border bg-surface py-1 shadow-lg dark:border-dark-border dark:bg-dark-surface">
                              <button
                                type="button"
                                class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-40"
                                disabled={a.status === 'resuelta'}
                                onClick={() => void runAlertAction(a.id, 'acknowledged')}
                              >
                                <Eye size={13} />
                                Marcar como vista
                              </button>
                              <button
                                type="button"
                                class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-fero-green-dark hover:bg-surface-hover disabled:opacity-40"
                                disabled={a.status === 'resuelta'}
                                onClick={() => void runAlertAction(a.id, 'resolved')}
                              >
                                <CheckCircle2 size={13} />
                                Resolver alerta
                              </button>
                            </div>
                          </Show>
                        </div>
                      </td>
                      </Show>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2.5 dark:border-dark-border">
            <p class="text-[11px] text-text-muted">{rangeLabel()}</p>
            <div class="flex items-center gap-1">
              <button type="button" class="flex h-7 w-7 items-center justify-center rounded-md border border-border text-text-secondary disabled:opacity-40" disabled={page() <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Anterior">
                <ChevronLeft size={14} />
              </button>
              <For each={Array.from({ length: totalPages() }, (_, i) => i + 1)}>
                {(n) => (
                  <button
                    type="button"
                    class={`flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-xs font-medium ${
                      page() === n ? 'bg-fero-green-dark text-white' : 'border border-border text-text-secondary hover:bg-surface-hover'
                    }`}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                )}
              </For>
              <button type="button" class="flex h-7 w-7 items-center justify-center rounded-md border border-border text-text-secondary disabled:opacity-40" disabled={page() >= totalPages()} onClick={() => setPage((p) => Math.min(totalPages(), p + 1))} aria-label="Siguiente">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </section>

        <Card padding={false} class="flex min-h-0 flex-col overflow-hidden xl:col-span-2 xl:h-full">
          <div class="flex items-center justify-between border-b border-border px-4 py-3 dark:border-dark-border">
            <h3 class="font-heading font-semibold text-text-primary dark:text-white">Mapa de alertas</h3>
            <A
              href={residentScope() ? residentMapLink() : '/map'}
              class="text-xs font-medium text-fero-blue hover:underline"
            >
              {residentScope() ? 'Ver mapa de mi sector' : 'Ver todas en el mapa'}
            </A>
          </div>
          <div class="relative min-h-72 flex-1 bg-slate-100 dark:bg-slate-900">
            <div ref={mapContainer} class="absolute inset-0 h-full w-full" />
            <div class="absolute right-3 bottom-3 z-10 flex flex-col overflow-hidden rounded-md border border-border bg-surface/95 shadow-sm backdrop-blur-sm dark:bg-dark-surface/95">
              <button type="button" class="flex h-8 w-8 items-center justify-center text-text-secondary hover:bg-surface-hover disabled:opacity-40" disabled={!mapReady()} onClick={() => mapRef.current?.zoomIn()} aria-label="Acercar">
                <Plus size={14} />
              </button>
              <button type="button" class="flex h-8 w-8 items-center justify-center border-t border-border text-text-secondary hover:bg-surface-hover disabled:opacity-40" disabled={!mapReady()} onClick={() => mapRef.current?.zoomOut()} aria-label="Alejar">
                <Minus size={14} />
              </button>
              <button type="button" class="flex h-8 w-8 items-center justify-center border-t border-border text-text-secondary hover:bg-surface-hover disabled:opacity-40" disabled={!mapReady()} onClick={() => fitMapToOperationalData(mapRef.current!, {
                points: activeAlertsList().map((alert) => ({ lng: alert.lng, lat: alert.lat })),
              })} aria-label="Centrar">
                <Crosshair size={14} />
              </button>
            </div>
          </div>
          <div class="flex flex-wrap gap-x-3 gap-y-1.5 border-t border-border px-4 py-2.5 text-xs text-text-secondary dark:border-dark-border">
            <For each={mapAlertLegend}>
              {(item) => (
                <span class="inline-flex items-center gap-1.5">
                  <Show when={item.icon === 'trash'} fallback={
                    <Show when={item.icon === 'truck'} fallback={
                      <span class="h-2.5 w-2.5 rounded-full" style={{ 'background-color': item.color }} />
                    }>
                      <Truck size={12} style={{ color: item.color }} />
                    </Show>
                  }>
                    <Trash2 size={12} style={{ color: item.color }} />
                  </Show>
                  {item.label}
                </span>
              )}
            </For>
          </div>
        </Card>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Resumen de alertas" />
          <div class="flex flex-col items-center gap-4 sm:flex-row">
            <div class="relative h-36 w-36 shrink-0">
              <Doughnut
                data={donutData()}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false }, tooltip: { enabled: true } },
                }}
              />
              <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span class="font-heading text-2xl font-bold text-text-primary dark:text-white">
                  {alertsDistribution().total}
                </span>
                <span class="text-xs text-text-muted">Total</span>
              </div>
            </div>
            <ul class="w-full space-y-2">
              <For each={alertsDistribution().items}>
                {(item) => (
                  <li class="flex items-center justify-between gap-2 text-sm">
                    <span class="flex items-center gap-2 text-text-secondary">
                      <span class="h-2.5 w-2.5 rounded-full" style={{ 'background-color': item.color }} />
                      {item.label}
                    </span>
                    <span class="font-medium text-text-primary dark:text-white">
                      {item.count} <span class="text-xs text-text-muted">({item.pct}%)</span>
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Card>

        <Card>
          <CardHeader title="Alertas por categoría" />
          <ul class="space-y-3.5">
            <For each={alertsByCategory()}>
              {(c) => (
                <li>
                  <div class="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span class="text-text-secondary">{c.label}</span>
                    <span class="font-semibold text-text-primary dark:text-white">{c.count}</span>
                  </div>
                  <div class="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      class="h-full rounded-full"
                      style={{
                        width: `${(c.count / maxCategory()) * 100}%`,
                        'background-color': c.color,
                      }}
                    />
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Card>

        <Card>
          <CardHeader title="Actividad reciente" />
          <ul class="space-y-3">
            <For each={recentActivity()}>
              {(a) => (
                <li class="flex gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-[11px] text-text-muted">{a.time}</p>
                    <p class="text-sm font-semibold text-text-primary dark:text-white">{a.title}</p>
                    <p class="text-xs text-text-secondary">{a.detail}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              )}
            </For>
          </ul>
        </Card>
      </div>

      <Show when={!residentScope()}>
        <div class="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/40 dark:bg-red-950/30">
          <div class="flex items-start gap-3">
            <span class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/50">
              <AlertTriangle size={18} />
            </span>
            <p class="text-sm text-red-800 dark:text-red-200">
              <span class="font-semibold"> {criticalCount()} alertas críticas</span> requieren tu atención inmediata. Revisa las
              alertas para evitar interrupciones en el servicio.
            </p>
          </div>
          <Button variant="danger" class="shrink-0" onClick={focusCritical}>
            Ver alertas críticas
          </Button>
        </div>
      </Show>
    </div>
  );
}
