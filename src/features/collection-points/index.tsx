import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount } from 'solid-js';
import { A } from '@solidjs/router';
import {
  Chart,
  ArcElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut, Line } from 'solid-chartjs';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Download,
  Eye,
  Minus,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-solid';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Drawer,
  KpiCard,
  ProgressBar,
  StatusBadge,
  ToastContainer,
  createToastStore,
} from '../../design-system/components';
import { bindMapTheme, mapStyleForTheme } from '../../core/utils/mapStyle';
import { UNARE_CENTER, UNARE_ZOOM } from '../../data/types/geo';
import {
  collectionPointStatusOptions,
  fillStatusBarColor,
  fillStatusColor,
  mapFillLegend,
  type CollectionPoint,
} from '../../data/mock/collectionPoints';
import {
  apiDistributionToFillDistribution,
  buildAnalyticsHref,
  buildSectorFilterOptions,
  computeCollectionPointsKpis,
  computeFillDistribution,
  createCollectionPoint,
  deleteCollectionPoint,
  detailToCollectionPoint,
  downloadCollectionPointsCsv,
  downloadCollectionPointsExport,
  enrichCollectionPointsWithOptimization,
  fetchCollectionPointDetail,
  fetchCollectionPointFillHistory,
  fetchCollectionPointsList,
  fetchCollectionPointsOptimizationContext,
  fetchCollectionPointsSummary,
  fetchSectorOptions,
  summaryKpisToCards,
  updateCollectionPoint,
} from '../../core/api/collectionPoints';
import { toggleLocalPriorityBoost } from '../../core/utils/collectionPointsOptimization';
import { ApiError, useMocks } from '../../core/api/client';
import { fetchSectors } from '../../core/api/sectors';
import { canManageCollectionPoints } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { appState } from '../../core/stores/appStore';
import { CollectionPointActionsMenu } from './CollectionPointActionsMenu';
import { CollectionPointOptimizationBadges } from './CollectionPointOptimizationBadges';
import {
  CollectionPointFormModal,
  type CollectionPointFormValues,
} from './CollectionPointFormModal';

function trashSvg(color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
}

function createPinEl(bg: string) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'collection-point-marker';
  el.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:${bg};box-shadow:0 2px 8px rgba(0,0,0,.25);border:2px solid #fff">${trashSvg('#fff')}</span>`;
  return el;
}

function buildPopupHtml(point: CollectionPoint) {
  const color = fillStatusColor(point.status);
  const statusLabel =
    point.status === 'critico'
      ? 'Crítico'
      : point.status === 'lleno'
        ? 'Lleno'
        : point.status === 'normal'
          ? 'Normal'
          : point.status === 'parcial'
            ? 'Parcial'
            : 'Fuera de servicio';

  return `
    <div style="min-width:210px;font-family:system-ui,sans-serif;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
        <strong style="font-size:14px;">${point.label}</strong>
        <span style="font-size:11px;font-weight:600;color:${color};background:${color}18;border:1px solid ${color}44;padding:2px 8px;border-radius:999px;">${statusLabel}</span>
      </div>
      <p style="margin:0 0 8px;font-size:12px;color:#64748b;">${point.address}, Sector ${point.sector}</p>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:4px;">
        <span>Nivel de llenado</span>
        <span style="color:${color};font-weight:700;">${point.fillLevel}%</span>
      </div>
      <div style="height:6px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-bottom:10px;">
        <div style="height:100%;width:${point.fillLevel}%;background:${color};border-radius:999px;"></div>
      </div>
      <button type="button" data-point-id="${point.id}" class="popup-ver-detalles" style="background:none;border:none;padding:0;color:#1143F3;font-size:12px;font-weight:600;cursor:pointer;">Ver detalles</button>
    </div>
  `;
}

function LevelBar(props: { point: CollectionPoint }) {
  return (
    <div class="flex min-w-24 max-w-28 flex-col gap-1">
      <span class="text-xs font-semibold text-text-primary dark:text-white">{props.point.fillLevel}%</span>
      <ProgressBar
        value={props.point.fillLevel}
        color={fillStatusBarColor(props.point.status)}
        size="sm"
      />
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div class="animate-pulse rounded-xl border border-border bg-surface p-4 dark:border-dark-border dark:bg-dark-surface">
      <div class="mb-3 h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" />
      <div class="mb-2 h-8 w-16 rounded bg-slate-200 dark:bg-slate-700" />
      <div class="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}

function TableRowSkeleton() {
  return (
    <tr class="animate-pulse">
      <td class="px-3 py-3"><div class="h-3 w-14 rounded bg-slate-200 dark:bg-slate-700" /></td>
      <td class="px-3 py-3"><div class="h-3 w-28 rounded bg-slate-200 dark:bg-slate-700" /></td>
      <td class="px-3 py-3"><div class="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700" /></td>
      <td class="px-3 py-3"><div class="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700" /></td>
      <td class="px-3 py-3"><div class="h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-700" /></td>
      <td class="px-3 py-3"><div class="h-7 w-20 rounded bg-slate-200 dark:bg-slate-700" /></td>
    </tr>
  );
}

export default function CollectionPointsPage() {
  let mapContainer!: HTMLDivElement;
  const mapRef: { current?: MapLibreMap } = {};
  const markersById = new Map<string, Marker>();

  const [search, setSearch] = createSignal('');
  const [statusFilter, setStatusFilter] = createSignal('');
  const [sectorFilter, setSectorFilter] = createSignal('');
  const [page, setPage] = createSignal(1);
  const [pageSize] = createSignal(8);
  const [selectedId, setSelectedId] = createSignal('');
  const [mapReady, setMapReady] = createSignal(false);
  const [mapFiltersOpen, setMapFiltersOpen] = createSignal(false);
  const [historyDrawerOpen, setHistoryDrawerOpen] = createSignal(false);
  const [formOpen, setFormOpen] = createSignal(false);
  const [formMode, setFormMode] = createSignal<'create' | 'edit'>('create');
  const [draftCoords, setDraftCoords] = createSignal<{ lat: number; lng: number } | null>(null);
  const [placeMode, setPlaceMode] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);
  const [exporting, setExporting] = createSignal(false);
  const { toasts, addToast, removeToast } = createToastStore();
  const [apiPoints, { refetch: refetchPoints }] = createResource(fetchCollectionPointsList);
  const [pointsSummary, { refetch: refetchSummary }] = createResource(fetchCollectionPointsSummary);
  const [pointDetail, { refetch: refetchDetail }] = createResource(selectedId, (id) =>
    id ? fetchCollectionPointDetail(id) : Promise.resolve(null),
  );
  const [fillHistory] = createResource(selectedId, (id) =>
    id ? fetchCollectionPointFillHistory(id, 7) : Promise.resolve(null),
  );
  const [sectorsGeo] = createResource(fetchSectors);
  const [sectorOptionsResource] = createResource(
    () => (canManageCollectionPoints(authUser()?.role) ? true : null),
    () => fetchSectorOptions(),
  );
  const [optimizationContext, { refetch: refetchOptimizationContext }] = createResource(
    apiPoints,
    (points) => fetchCollectionPointsOptimizationContext(points ?? []),
  );
  const allPoints = createMemo(() => {
    const points = apiPoints() ?? [];
    const context = optimizationContext();
    if (!context) return points;
    return enrichCollectionPointsWithOptimization(points, context);
  });
  const canManage = () => canManageCollectionPoints(authUser()?.role);
  const pointsLoading = () => apiPoints.loading;
  const pointsError = () => apiPoints.error;
  const summaryLoading = () => pointsSummary.loading;

  const analyticsHref = createMemo(() =>
    buildAnalyticsHref({
      sector: sectorFilter() || undefined,
    }),
  );

  const criticalCount = createMemo(() => {
    const context = optimizationContext();
    if (context) return context.criticalCount;
    return allPoints().filter((point) => point.status === 'critico').length;
  });

  const simulationHref = createMemo(() => {
    const count = criticalCount();
    return count > 0 ? `/simulation?critical=${count}` : '/simulation';
  });

  const hasActiveFilters = createMemo(
    () => Boolean(search().trim() || statusFilter() || sectorFilter()),
  );

  const sectorOptions = createMemo(() => {
    const summary = pointsSummary();
    if (summary?.sectors.length) {
      return buildSectorFilterOptions(summary.sectors);
    }
    const fromApi = (sectorsGeo()?.features ?? []).map((f) => f.properties.name);
    const fromPoints = allPoints().map((p) => p.sector);
    const names = fromApi.length > 0 ? fromApi : fromPoints;
    return buildSectorFilterOptions(names);
  });

  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase();
    const status = statusFilter();
    const sector = sectorFilter();
    return allPoints().filter((p) => {
      if (status && p.status !== status) return false;
      if (sector && p.sector !== sector) return false;
      if (!q) return true;
      return (
        p.id.toLowerCase().includes(q) ||
        p.label.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.sector.toLowerCase().includes(q)
      );
    });
  });

  const kpisData = createMemo(() => {
    const summary = pointsSummary();
    if (summary) return summaryKpisToCards(summary.kpis);
    return computeCollectionPointsKpis(allPoints());
  });

  const fillDistributionData = createMemo(() => {
    if (hasActiveFilters()) return computeFillDistribution(filtered());
    const summary = pointsSummary();
    if (summary) return apiDistributionToFillDistribution(summary);
    return computeFillDistribution(allPoints());
  });

  const syncMapMarkers = () => {
    const map = mapRef.current;
    const points = filtered();
    if (!map || !map.isStyleLoaded()) return;
    markersById.forEach((m) => m.remove());
    markersById.clear();
    if (points.length === 0) return;
    for (const point of points) {
      const el = createPinEl(fillStatusColor(point.status));
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setSelectedId(point.id);
      });
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([point.lng, point.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 18, maxWidth: '280px', closeButton: true }).setHTML(
            buildPopupHtml(point),
          ),
        )
        .addTo(map);
      markersById.set(point.id, marker);
    }
    openSelectedPopup();
  };

  bindMapTheme(
    () => mapRef.current,
    mapReady,
    () => syncMapMarkers(),
  );

  onMount(() => {
    Chart.register(ArcElement, CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend);

    const map = new maplibregl.Map({
      container: mapContainer,
      style: mapStyleForTheme(appState.darkMode),
      center: UNARE_CENTER,
      zoom: UNARE_ZOOM,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      map.resize();
      setMapReady(true);
      syncMapMarkers();
    });

    const onPopupClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest?.('.popup-ver-detalles') as HTMLElement | null;
      if (!btn) return;
      const id = btn.dataset.pointId;
      if (id) {
        setSelectedId(id);
        scrollToDetailPanel();
      }
    };
    document.addEventListener('click', onPopupClick);

    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(mapContainer);

    onCleanup(() => {
      document.removeEventListener('click', onPopupClick);
      ro.disconnect();
      markersById.forEach((m) => m.remove());
      markersById.clear();
      mapRef.current?.remove();
      mapRef.current = undefined;
    });
  });

  createEffect(() => {
    filtered();
    if (mapReady()) syncMapMarkers();
  });

  createEffect(() => {
    const points = allPoints();
    if (points.length === 0) return;
    const current = selectedId();
    if (!current || !points.some((p) => p.id === current)) {
      setSelectedId(points[0].id);
    }
  });

  const openSelectedPopup = () => {
    const id = selectedId();
    const marker = markersById.get(id);
    const map = mapRef.current;
    if (!marker || !map) return;
    const point = filtered().find((p) => p.id === id) ?? allPoints().find((p) => p.id === id);
    if (!point) return;
    map.flyTo({ center: [point.lng, point.lat], zoom: Math.max(map.getZoom(), 14), essential: true });
    markersById.forEach((m, mid) => {
      if (mid !== id) m.getPopup()?.remove();
    });
    const popup = marker.getPopup();
    if (popup && !popup.isOpen()) marker.togglePopup();
  };

  createEffect(() => {
    selectedId();
    if (mapReady()) openSelectedPopup();
  });

  const total = () => filtered().length;
  const totalPages = () => Math.max(1, Math.ceil(total() / pageSize()));
  const pageItems = createMemo(() => {
    const p = Math.min(page(), totalPages());
    const start = (p - 1) * pageSize();
    return filtered().slice(start, start + pageSize());
  });

  const rangeLabel = () => {
    if (total() === 0) return 'Mostrando 0 de 0 puntos';
    const p = Math.min(page(), totalPages());
    const from = (p - 1) * pageSize() + 1;
    const to = Math.min(p * pageSize(), total());
    return `Mostrando ${from} a ${to} de ${total()} puntos`;
  };

  const selected = createMemo(() => allPoints().find((p) => p.id === selectedId()));

  const displayPoint = createMemo(() => {
    const detail = pointDetail();
    if (detail) return detailToCollectionPoint(detail);
    return selected();
  });

  const scrollToDetailPanel = () => {
    requestAnimationFrame(() => {
      document.getElementById('collection-point-detail')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const selectPoint = (p: CollectionPoint) => {
    setSelectedId(p.id);
    scrollToDetailPanel();
  };

  const sectorOptionsForForm = createMemo(() => sectorOptionsResource() ?? []);

  const refreshData = async (keepSelection?: string) => {
    await Promise.all([refetchPoints(), refetchSummary(), refetchOptimizationContext()]);
    if (keepSelection) {
      await refetchDetail();
    }
  };

  const openCreateForm = (coords?: { lat: number; lng: number } | null) => {
    setFormMode('create');
    setDraftCoords(coords ?? null);
    setFormOpen(true);
    setPlaceMode(false);
  };

  const openEditForm = (point?: CollectionPoint) => {
    const target = point ?? displayPoint();
    if (!target) return;
    setSelectedId(target.id);
    setFormMode('edit');
    setDraftCoords(null);
    setFormOpen(true);
  };

  const formValuesToPayload = (values: CollectionPointFormValues) => {
    const currentFillLevelKg = (values.fillLevelPct / 100) * values.maxCapacityKg;
    return {
      sectorId: values.sectorId,
      latitude: values.latitude,
      longitude: values.longitude,
      maxCapacityKg: values.maxCapacityKg,
      currentFillLevelKg: Math.round(currentFillLevelKg * 100) / 100,
      status: values.status,
    };
  };

  const handleFormSubmit = async (values: CollectionPointFormValues) => {
    setSubmitting(true);
    try {
      const payload = formValuesToPayload(values);
      if (formMode() === 'create') {
        const created = await createCollectionPoint({ ...payload, code: values.code.trim().toUpperCase() });
        addToast(`Punto ${created.code} creado correctamente`, 'success');
        setFormOpen(false);
        setDraftCoords(null);
        await refreshData(created.code);
        setSelectedId(created.code);
      } else {
        const code = values.code || selectedId();
        const updated = await updateCollectionPoint(code, payload);
        addToast(`Punto ${updated.code} actualizado`, 'success');
        setFormOpen(false);
        await refreshData(updated.code);
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'No se pudo guardar el punto';
      addToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOutOfService = async (point: CollectionPoint) => {
    setSubmitting(true);
    try {
      await updateCollectionPoint(point.id, { status: 'inactive' });
      addToast(`Punto ${point.id} marcado fuera de servicio`, 'success');
      await refreshData(point.id);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'No se pudo actualizar el punto';
      addToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePoint = async (point: CollectionPoint) => {
    if (!window.confirm(`¿Eliminar el punto ${point.id}? Esta acción no se puede deshacer.`)) return;
    setSubmitting(true);
    try {
      await deleteCollectionPoint(point.id);
      addToast(`Punto ${point.id} eliminado`, 'success');
      const remaining = allPoints().filter((p) => p.id !== point.id);
      setSelectedId(remaining[0]?.id ?? '');
      await refreshData();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'No se pudo eliminar el punto';
      addToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleOptimization = async (point: CollectionPoint, enabled: boolean) => {
    setSubmitting(true);
    try {
      if (canManage()) {
        await updateCollectionPoint(point.id, { priorityBoost: enabled });
      } else {
        toggleLocalPriorityBoost(point.id, enabled);
      }
      addToast(
        enabled
          ? `Punto ${point.id} marcado para la próxima optimización`
          : `Punto ${point.id} quitado de la próxima optimización`,
        'success',
      );
      await refreshData(point.id);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'No se pudo actualizar la prioridad';
      addToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  createEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady()) return;

    const handler = (event: maplibregl.MapMouseEvent) => {
      if (!placeMode()) return;
      const { lng, lat } = event.lngLat;
      openCreateForm({ lat, lng });
    };

    if (placeMode()) {
      map.getCanvas().style.cursor = 'crosshair';
      map.on('click', handler);
    } else {
      map.getCanvas().style.cursor = '';
    }

    onCleanup(() => {
      map.off('click', handler);
      if (!placeMode()) map.getCanvas().style.cursor = '';
    });
  });

  const fillHistoryChart = createMemo(() => {
    const history = fillHistory();
    if (!history) return null;
    return {
      labels: history.labels,
      datasets: [
        {
          data: history.values,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.12)',
          pointBackgroundColor: '#ef4444',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          tension: 0.35,
          fill: true,
        },
      ],
    };
  });

  const fillHistorySourceLabel = () => {
    const history = fillHistory();
    if (!history) return 'Cargando...';
    return history.source === 'waypoints' ? 'Basado en recolecciones' : 'Estimación simulada';
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        min: 0,
        max: 100,
        ticks: { callback: (v: string | number) => `${v}%`, font: { size: 10 } },
        grid: { color: 'rgba(148,163,184,0.2)' },
      },
      x: {
        ticks: { font: { size: 10 } },
        grid: { display: false },
      },
    },
  } as const;

  const zoomIn = () => mapRef.current?.zoomIn();
  const zoomOut = () => mapRef.current?.zoomOut();
  const recenter = () => {
    const point = displayPoint();
    if (point) {
      mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 14 });
    } else {
      mapRef.current?.flyTo({ center: UNARE_CENTER, zoom: UNARE_ZOOM });
    }
  };

  const donutData = createMemo(() => {
    const distribution = fillDistributionData();
    return {
      labels: distribution.items.map((i) => i.label),
      datasets: [
        {
          data: distribution.items.map((i) => i.count),
          backgroundColor: distribution.items.map((i) => i.color),
          borderWidth: 0,
          cutout: '72%',
        },
      ],
    };
  });

  const applyFilters = (patch: { search?: string; status?: string; sector?: string }) => {
    if (patch.search !== undefined) setSearch(patch.search);
    if (patch.status !== undefined) setStatusFilter(patch.status);
    if (patch.sector !== undefined) setSectorFilter(patch.sector);
    setPage(1);
  };

  const handleExport = async () => {
    const points = filtered();
    if (points.length === 0) {
      addToast('No hay puntos para exportar con los filtros actuales', 'warning');
      return;
    }

    const suffix = [sectorFilter() || 'todos-sectores', statusFilter() || 'todos-estados'].join('-');
    const filename = `feromap-puntos-${suffix}.csv`;

    setExporting(true);
    try {
      if (useMocks) {
        downloadCollectionPointsCsv(points, filename);
      } else {
        await downloadCollectionPointsExport(
          {
            sector: sectorFilter() || undefined,
            status: statusFilter() || undefined,
          },
          filename,
        );
      }
      addToast(`Exportados ${points.length} puntos a CSV`, 'success');
    } catch {
      addToast('No se pudo descargar el archivo CSV del servidor', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div class="space-y-5">
      <Show when={authUser()?.role === 'residente' && authUser()?.sectorName}>
        <div class="rounded-xl border border-fero-blue/30 bg-fero-blue/10 px-4 py-3">
          <p class="text-sm font-semibold text-fero-blue">Horario de recolección — {authUser()!.sectorName}</p>
          <p class="mt-1 text-sm text-text-secondary">
            Lunes, miércoles y viernes · Ventana estimada 07:00–12:00 · Solo ves contenedores de tu sector.
          </p>
        </div>
      </Show>
      <Show when={pointsError()}>
        <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/30">
          <p class="text-sm font-semibold text-red-700 dark:text-red-300">
            No se pudieron cargar los puntos de recolección
          </p>
          <p class="mt-1 text-sm text-red-600 dark:text-red-400">
            {pointsError() instanceof Error ? pointsError()!.message : 'Error de conexión con la API'}
          </p>
          <button
            type="button"
            class="mt-2 text-sm font-medium text-red-700 underline dark:text-red-300"
            onClick={() => void refetchPoints()}
          >
            Reintentar
          </button>
        </div>
      </Show>
      <div class="flex flex-col gap-4">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Show
            when={!pointsLoading() && !summaryLoading()}
            fallback={
              <For each={Array.from({ length: 5 })}>{() => <KpiSkeleton />}</For>
            }
          >
            <For each={kpisData()}>
            {(kpi) => (
              <KpiCard
                title={kpi.title}
                value={kpi.value}
                unit={kpi.unit}
                iconTone={kpi.iconTone}
                icon={<Trash2 size={24} />}
              />
            )}
          </For>
          </Show>
        </div>
        <Show when={canManage()}>
          <div class="flex flex-wrap gap-2">
            <A href={simulationHref()}>
              <Button
                variant="outline"
                class="gap-2 px-5 py-2.5"
                icon={<ArrowRight size={17} />}
              >
                {criticalCount() > 0
                  ? `Ir a optimizar (${criticalCount()} críticos)`
                  : 'Ir a Simulación'}
              </Button>
            </A>
            <Button
              variant="primary"
              class="gap-2 px-5 py-2.5"
              icon={<Plus size={17} />}
              onClick={() => openCreateForm()}
            >
              Nuevo punto
            </Button>
            <Button
              variant="outline"
              class={`gap-2 px-5 py-2.5 ${placeMode() ? 'border-fero-blue text-fero-blue' : ''}`}
              icon={<Crosshair size={17} />}
              onClick={() => setPlaceMode((active) => !active)}
            >
              {placeMode() ? 'Clic en el mapa…' : 'Colocar en mapa'}
            </Button>
          </div>
        </Show>
      </div>

      <div class="grid gap-4 xl:grid-cols-5">
        <Card padding={false} class="overflow-hidden xl:col-span-3">
          <div class="flex flex-wrap items-center gap-2 border-b border-border px-3 py-3 dark:border-dark-border sm:px-4">
            <h3 class="mr-auto font-heading text-sm font-semibold text-text-primary dark:text-white sm:text-base">
              Mapa de puntos de recolección
            </h3>
            <div class="relative min-w-40 flex-1 sm:max-w-56">
              <Search size={14} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                placeholder="Buscar punto..."
                value={search()}
                onInput={(e) => applyFilters({ search: e.currentTarget.value })}
                class="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-2 text-xs text-text-primary placeholder:text-text-muted focus:border-fero-blue focus:outline-none dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
              />
            </div>
            <button
              type="button"
              class={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                mapFiltersOpen()
                  ? 'border-fero-blue bg-fero-blue/10 text-fero-blue'
                  : 'border-border text-text-secondary hover:bg-surface-hover'
              }`}
              onClick={() => setMapFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal size={14} />
              Filtros
            </button>
          </div>

          <Show when={mapFiltersOpen()}>
            <div class="flex flex-wrap items-center gap-2 border-b border-border bg-slate-50/80 px-3 py-2.5 dark:border-dark-border dark:bg-dark-surface-hover/40 sm:px-4">
              <select
                value={statusFilter()}
                onChange={(e) => applyFilters({ status: e.currentTarget.value })}
                class="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text-secondary dark:bg-dark-surface-hover dark:border-dark-border"
              >
                <For each={collectionPointStatusOptions}>
                  {(o) => <option value={o.value}>{o.label}</option>}
                </For>
              </select>
              <select
                value={sectorFilter()}
                onChange={(e) => applyFilters({ sector: e.currentTarget.value })}
                class="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text-secondary dark:bg-dark-surface-hover dark:border-dark-border"
              >
                <For each={sectorOptions()}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </select>
              <p class="text-xs text-text-muted">{filtered().length} puntos visibles en el mapa</p>
            </div>
          </Show>

          <div class="relative h-80 bg-slate-100 dark:bg-slate-900 lg:h-105">
            <div ref={mapContainer} class="absolute inset-0 h-full w-full" />

            <Show when={placeMode()}>
              <div class="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-fero-blue/40 bg-fero-blue/10 px-3 py-1.5 text-xs font-medium text-fero-blue shadow-sm backdrop-blur-sm">
                Haz clic en el mapa para ubicar el nuevo punto
              </div>
            </Show>

            <div class="absolute right-3 top-3 z-10 flex flex-col overflow-hidden rounded-md border border-border bg-surface/95 shadow-sm backdrop-blur-sm dark:bg-dark-surface/95">
              <button type="button" class="flex h-8 w-8 items-center justify-center text-text-secondary hover:bg-surface-hover disabled:opacity-40" onClick={zoomIn} disabled={!mapReady()} aria-label="Acercar">
                <Plus size={14} />
              </button>
              <button type="button" class="flex h-8 w-8 items-center justify-center border-t border-border text-text-secondary hover:bg-surface-hover disabled:opacity-40" onClick={zoomOut} disabled={!mapReady()} aria-label="Alejar">
                <Minus size={14} />
              </button>
              <button type="button" class="flex h-8 w-8 items-center justify-center border-t border-border text-text-secondary hover:bg-surface-hover disabled:opacity-40" onClick={recenter} disabled={!mapReady()} aria-label="Centrar">
                <Crosshair size={14} />
              </button>
            </div>

            <div class="absolute bottom-3 left-3 z-10 max-w-56 rounded-md border border-border bg-surface/95 p-2.5 text-xs shadow-md backdrop-blur-sm dark:bg-dark-surface/95 dark:border-dark-border">
              <p class="mb-1.5 font-semibold text-text-primary dark:text-white">Leyenda</p>
              <ul class="space-y-1 text-text-secondary">
                <For each={mapFillLegend}>
                  {(item) => (
                    <li class="flex items-center gap-2">
                      <Trash2 size={12} style={{ color: fillStatusColor(item.status) }} />
                      {item.label}
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </div>
        </Card>

        <section class="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xs dark:bg-dark-surface dark:border-dark-border xl:col-span-2">
          <div class="flex flex-wrap items-center gap-2 border-b border-border p-3 dark:border-dark-border">
            <h3 class="w-full font-heading text-sm font-semibold text-text-primary dark:text-white sm:text-base">
              Listado de puntos
            </h3>
            <div class="relative min-w-0 flex-1 basis-36">
              <Search size={14} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                placeholder="Buscar punto..."
                value={search()}
                onInput={(e) => applyFilters({ search: e.currentTarget.value })}
                class="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-2 text-xs text-text-primary placeholder:text-text-muted focus:border-fero-blue focus:outline-none dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
              />
            </div>
            <select
              value={statusFilter()}
              onChange={(e) => applyFilters({ status: e.currentTarget.value })}
              class="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text-secondary dark:bg-dark-surface-hover dark:border-dark-border"
            >
              <For each={collectionPointStatusOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
            </select>
            <select
              value={sectorFilter()}
              onChange={(e) => applyFilters({ sector: e.currentTarget.value })}
              class="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text-secondary dark:bg-dark-surface-hover dark:border-dark-border"
            >
              <For each={sectorOptions()}>{(o) => <option value={o.value}>{o.label}</option>}</For>
            </select>
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary hover:bg-surface-hover disabled:opacity-40"
              aria-label="Exportar"
              title="Exportar CSV"
              disabled={exporting() || pointsLoading()}
              onClick={handleExport}
            >
              <Download size={14} />
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-auto">
            <table class="w-full min-w-140">
              <thead>
                <tr class="border-b border-border bg-slate-50/80 text-left dark:border-dark-border dark:bg-dark-surface-hover">
                  <th class="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">ID</th>
                  <th class="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Ubicación</th>
                  <th class="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Sector</th>
                  <th class="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Nivel</th>
                  <th class="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Estado</th>
                  <th class="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border dark:divide-dark-border">
                <Show
                  when={!pointsLoading()}
                  fallback={
                    <For each={Array.from({ length: 6 })}>{() => <TableRowSkeleton />}</For>
                  }
                >
                <For
                  each={pageItems()}
                  fallback={
                    <tr>
                      <td colSpan={6} class="px-3 py-8 text-center text-sm text-text-muted">
                        {pointsError()
                          ? 'No se pudo cargar el listado de puntos.'
                          : hasActiveFilters()
                            ? 'No hay puntos que coincidan con los filtros activos.'
                            : 'No se encontraron puntos de recolección.'}
                      </td>
                    </tr>
                  }
                >
                  {(p) => (
                    <tr
                      class={`cursor-pointer transition-colors hover:bg-surface-hover ${
                        selectedId() === p.id ? 'bg-fero-green/5' : ''
                      }`}
                      onClick={() => selectPoint(p)}
                    >
                      <td class="px-3 py-2.5 text-xs font-semibold text-text-primary dark:text-white">#{p.id}</td>
                      <td class="max-w-36 truncate px-3 py-2.5 text-xs text-text-secondary" title={p.address}>
                        {p.address}
                      </td>
                      <td class="px-3 py-2.5 text-xs text-text-secondary">{p.sector}</td>
                      <td class="px-3 py-2.5">
                        <LevelBar point={p} />
                      </td>
                      <td class="px-3 py-2.5">
                        <div class="space-y-1">
                          <StatusBadge status={p.status} />
                          <CollectionPointOptimizationBadges
                            usedInLastOptimization={p.usedInLastOptimization}
                            priorityBoost={p.priorityBoost}
                            compact
                          />
                        </div>
                      </td>
                      <td class="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div class="flex items-center gap-0.5">
                          <button type="button" class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-fero-blue" aria-label="Ver" onClick={() => selectPoint(p)}>
                            <Eye size={14} />
                          </button>
                          <Show when={canManage()}>
                            <button
                              type="button"
                              class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover"
                              aria-label="Editar"
                              onClick={() => openEditForm(p)}
                            >
                              <Pencil size={14} />
                            </button>
                            <CollectionPointActionsMenu
                              point={p}
                              disabled={submitting()}
                              onOutOfService={handleOutOfService}
                              onDelete={handleDeletePoint}
                              onToggleOptimization={canManage() ? handleToggleOptimization : undefined}
                            />
                          </Show>
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
                </Show>
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
      </div>

      <Show when={displayPoint()}>
        {(p) => (
          <div id="collection-point-detail" class="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title="Detalle del punto seleccionado" />
              <div class="mb-4 flex items-start gap-3">
                <span
                  class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    'background-color': `${fillStatusColor(p().status)}22`,
                    color: fillStatusColor(p().status),
                  }}
                >
                  <Trash2 size={24} />
                </span>
                <div>
                  <div class="mb-1 flex flex-wrap items-center gap-2">
                    <h4 class="font-heading text-lg font-bold text-text-primary dark:text-white">{p().label}</h4>
                    <StatusBadge status={p().status} />
                  </div>
                  <CollectionPointOptimizationBadges
                    usedInLastOptimization={p().usedInLastOptimization}
                    priorityBoost={p().priorityBoost}
                  />
                  <p class="text-sm text-text-secondary">{p().address}</p>
                  <p class="text-xs text-text-muted">Sector {p().sector}</p>
                </div>
              </div>

              <dl class="mb-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt class="text-xs text-text-muted">Tipo de contenedor</dt>
                  <dd class="font-semibold text-text-primary dark:text-white">{p().containerType}</dd>
                </div>
                <div>
                  <dt class="text-xs text-text-muted">Capacidad</dt>
                  <dd class="font-semibold text-text-primary dark:text-white">
                    {p().capacityL.toLocaleString('es-VE')} Litros
                  </dd>
                </div>
                <div>
                  <dt class="text-xs text-text-muted">Nivel de llenado</dt>
                  <dd class="font-bold" style={{ color: fillStatusColor(p().status) }}>
                    {p().fillLevel}%
                  </dd>
                </div>
                <div>
                  <dt class="text-xs text-text-muted">Última recolección</dt>
                  <dd class="font-semibold text-text-primary dark:text-white">{p().lastCollection}</dd>
                </div>
                <div>
                  <dt class="text-xs text-text-muted">Frecuencia</dt>
                  <dd class="font-semibold text-text-primary dark:text-white">{p().frequency}</dd>
                </div>
                <div>
                  <dt class="text-xs text-text-muted">Estado</dt>
                  <dd class="mt-0.5">
                    <Badge variant={p().active ? 'success' : 'default'} dot>
                      {p().active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </dd>
                </div>
              </dl>

              <div class="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={() => setHistoryDrawerOpen(true)}>
                  Ver historial
                </Button>
                <Show when={canManage()}>
                  <Button variant="outline" size="sm" icon={<Pencil size={14} />} onClick={() => openEditForm()}>
                    Editar
                  </Button>
                  <CollectionPointActionsMenu
                    point={p()}
                    variant="button"
                    disabled={submitting()}
                    onOutOfService={handleOutOfService}
                    onDelete={handleDeletePoint}
                    onToggleOptimization={canManage() ? handleToggleOptimization : undefined}
                  />
                </Show>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Historial de llenado"
                action={<span class="text-xs text-text-muted">{fillHistorySourceLabel()}</span>}
              />
              <Show
                when={fillHistoryChart()}
                fallback={
                  <div class="flex h-52 items-center justify-center text-sm text-text-muted">
                    Cargando historial...
                  </div>
                }
              >
                {(chart) => (
                  <div class="mx-auto h-52 w-full max-w-md">
                    <Line data={chart()} options={lineChartOptions} />
                  </div>
                )}
              </Show>
            </Card>

            <Card>
              <CardHeader
                title="Distribución por nivel de llenado"
                action={
                  <span class="text-xs text-text-muted">
                    {hasActiveFilters() ? 'Según filtros activos' : 'Resumen del servidor'}
                  </span>
                }
              />
              <Show
                when={fillDistributionData().items.length > 0}
                fallback={
                  <p class="py-10 text-center text-sm text-text-muted">
                    No hay puntos que coincidan con los filtros actuales.
                  </p>
                }
              >
                <div class="mx-auto flex w-full max-w-sm flex-col items-center justify-center gap-4 sm:flex-row">
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
                        {fillDistributionData().total}
                      </span>
                      <span class="text-xs text-text-muted">Total</span>
                    </div>
                  </div>
                  <ul class="w-full max-w-44 space-y-2">
                    <For each={fillDistributionData().items}>
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
              </Show>
              <div class="mt-4 flex justify-center">
                <A
                  href={analyticsHref()}
                  class="inline-flex items-center gap-1 text-sm font-medium text-fero-blue hover:underline"
                >
                  Ver análisis detallado
                  <ArrowRight size={14} />
                </A>
              </div>
            </Card>
          </div>
        )}
      </Show>

      <Drawer
        open={historyDrawerOpen()}
        onClose={() => setHistoryDrawerOpen(false)}
        title={displayPoint() ? `Historial — ${displayPoint()!.label}` : 'Historial de llenado'}
      >
        <Show
          when={fillHistoryChart()}
          fallback={<p class="text-sm text-text-muted">Cargando historial del punto seleccionado...</p>}
        >
          {(chart) => (
            <div class="space-y-4">
              <p class="text-sm text-text-secondary">{fillHistorySourceLabel()} · últimos 7 días</p>
              <div class="h-64 w-full">
                <Line data={chart()} options={lineChartOptions} />
              </div>
              <Show when={pointDetail()}>
                {(detail) => (
                  <dl class="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt class="text-xs text-text-muted">Nivel actual</dt>
                      <dd class="font-semibold text-text-primary dark:text-white">{detail().fillLevel}%</dd>
                    </div>
                    <div>
                      <dt class="text-xs text-text-muted">Última recolección</dt>
                      <dd class="font-semibold text-text-primary dark:text-white">{detail().lastCollection}</dd>
                    </div>
                  </dl>
                )}
              </Show>
            </div>
          )}
        </Show>
      </Drawer>

      <CollectionPointFormModal
        open={formOpen()}
        mode={formMode()}
        initial={pointDetail()}
        sectorOptions={sectorOptionsForForm()}
        draftCoords={draftCoords()}
        submitting={submitting()}
        onClose={() => {
          setFormOpen(false);
          setDraftCoords(null);
          setPlaceMode(false);
        }}
        onSubmit={handleFormSubmit}
      />

      <ToastContainer toasts={toasts()} onDismiss={removeToast} />
    </div>
  );
}
