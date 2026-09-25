import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount } from 'solid-js';
import { A, useSearchParams } from '@solidjs/router';
import {
  Chart,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'solid-chartjs';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Download,
  Eye,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-solid';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Drawer,
  ProgressBar,
  StatusBadge,
  ToastContainer,
  createToastStore,
} from '../../design-system/components';
import { bindMapTheme, resolveMapStyle } from '../../core/utils/mapStyle';
import {
  createOperationalMapOptions,
  fitMapToOperationalData,
  fitMapToStudyArea,
  STUDY_AREA_FIT_MAX_ZOOM,
  STUDY_AREA_MIN_ZOOM,
} from '../../core/map/operationalMapConfig';
import {
  bindCollectionPointMapInteractions,
  ensureCollectionPointMapLayers,
  ensureSectorContextLayers,
  syncCollectionPointMapLayer,
} from '../../core/map/collectionPointMapLayers';
import {
  collectionPointStatusOptions,
  fillStatusBarColor,
  fillStatusColor,
  mapFillLegend,
  type CollectionPoint,
} from '../../data/mock/collectionPoints';
import {
  buildSectorFilterOptions,
  computeCatalogKpis,
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
import { canManageCollectionPoints, isResident } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { fetchResidentOverview } from '../../core/api/resident';
import { residentHubHref, residentMapHref } from '../../core/resident/residentDeepLinks';
import { ResidentBreadcrumbs } from '../resident/ResidentBreadcrumbs';
import { appState } from '../../core/stores/appStore';
import { CollectionPointActionsMenu } from './CollectionPointActionsMenu';
import { CollectionPointOptimizationBadges } from './CollectionPointOptimizationBadges';
import { VisitScheduleEditor } from './VisitScheduleEditor';
import {
  CollectionPointFormModal,
  type CollectionPointFormValues,
} from './CollectionPointFormModal';
import { CollectionPointsStatsStrip } from './CollectionPointsStatsStrip';
import { SectorFillRatePanel } from './SectorFillRatePanel';

function TableRowSkeleton() {
  return (
    <tr class="animate-pulse">
      <td class="px-3 py-3"><div class="h-3 w-14 rounded bg-slate-200 dark:bg-slate-700" /></td>
      <td class="px-3 py-3"><div class="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700" /></td>
      <td class="px-3 py-3"><div class="h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-700" /></td>
      <td class="px-3 py-3"><div class="h-7 w-20 rounded bg-slate-200 dark:bg-slate-700" /></td>
    </tr>
  );
}

export default function CollectionPointsPage() {
  let mapContainer!: HTMLDivElement;
  const mapRef: { current?: MapLibreMap } = {};
  const [searchParams] = useSearchParams();
  const firstParam = (value: string | string[] | undefined): string =>
    Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

  const [search, setSearch] = createSignal('');
  // Filtros por deep link: el dashboard enlaza aquí con ?status=critico&sector=…
  const [statusFilter, setStatusFilter] = createSignal(firstParam(searchParams.status));
  const [sectorFilter, setSectorFilter] = createSignal(firstParam(searchParams.sector));
  const [page, setPage] = createSignal(1);
  const [pageSize, setPageSize] = createSignal(10);
  const [selectedId, setSelectedId] = createSignal('');
  const [mapReady, setMapReady] = createSignal(false);
  const [historyDrawerOpen, setHistoryDrawerOpen] = createSignal(false);
  const [formOpen, setFormOpen] = createSignal(false);
  const [formMode, setFormMode] = createSignal<'create' | 'edit'>('create');
  const [draftCoords, setDraftCoords] = createSignal<{ lat: number; lng: number } | null>(null);
  const [placeMode, setPlaceMode] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);
  const [exporting, setExporting] = createSignal(false);
  const [pendingDeletePoint, setPendingDeletePoint] = createSignal<CollectionPoint | null>(null);
  const { toasts, addToast, removeToast } = createToastStore();
  const [pointsApiError, setPointsApiError] = createSignal(false);
  const [apiPoints, { refetch: refetchPoints }] = createResource(async () => {
    try {
      const points = await fetchCollectionPointsList();
      setPointsApiError(false);
      return points;
    } catch {
      setPointsApiError(true);
      return [] as CollectionPoint[];
    }
  });
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
  const isResidentView = () => isResident(authUser()?.role);
  const residentSectorName = () => authUser()?.sectorName ?? 'tu sector';
  const [residentOverview] = createResource(
    () => (isResidentView() ? 'resident-points' : null),
    () => fetchResidentOverview(),
  );
  const pointsLoading = () => apiPoints.loading;
  const pointsError = () =>
    pointsApiError() ? new Error('No se pudo cargar el listado de puntos.') : undefined;
  const summaryLoading = () => pointsSummary.loading;

  const kpisData = createMemo(() => {
    const summary = pointsSummary();
    const points = allPoints();
    if (summary) return summaryKpisToCards(summary.kpis, summary.sectors, points);
    return computeCatalogKpis(points);
  });

  const syncCollectionPointsMap = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    syncCollectionPointMapLayer(map, filtered(), selectedId());
    ensureSectorContextLayers(map, sectorsGeo());
  };

  const fitCollectionPointsMap = () => {
    const map = mapRef.current;
    const points = filtered();
    if (!map || !map.isStyleLoaded() || points.length === 0) return;

    if (hasActiveFilters() || points.length <= 25) {
      fitMapToOperationalData(map, {
        points: points.map((point) => ({ lng: point.lng, lat: point.lat })),
        maxZoom: 14,
        duration: 600,
      });
      return;
    }

    const sectors = sectorsGeo();
    if (sectors) {
      fitMapToStudyArea(map, {
        sectors,
        maxZoom: STUDY_AREA_FIT_MAX_ZOOM,
        duration: 600,
      });
      return;
    }

    fitMapToOperationalData(map, {
      points: points.map((point) => ({ lng: point.lng, lat: point.lat })),
      maxZoom: 12,
      duration: 600,
    });
  };

  const flyToSelectedPoint = () => {
    const map = mapRef.current;
    const id = selectedId();
    if (!map || !id) return;
    const point = allPoints().find((item) => item.id === id);
    if (!point) return;
    map.flyTo({
      center: [point.lng, point.lat],
      zoom: Math.max(map.getZoom(), 14.2),
      essential: true,
      duration: 500,
    });
  };

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

  createEffect(() => {
    const status = firstParam(searchParams.status);
    const sector = firstParam(searchParams.sector);
    if (status) setStatusFilter(status);
    if (sector) setSectorFilter(sector);
    if (status || sector) setPage(1);
  });

  createEffect(() => {
    if (!isResidentView()) return;
    const sector = authUser()?.sectorName;
    if (sector && sectorFilter() !== sector) {
      setSectorFilter(sector);
    }
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

  bindMapTheme(
    () => mapRef.current,
    mapReady,
    () => {
      ensureCollectionPointMapLayers(mapRef.current!);
      syncCollectionPointsMap();
    },
  );

  onMount(() => {
    Chart.register(CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend);

    let cancelled = false;
    let ro: ResizeObserver | undefined;
    let unbindMapInteractions: (() => void) | undefined;

    void resolveMapStyle(appState.darkMode).then((style) => {
      if (cancelled) return;

      const map = new maplibregl.Map(
        createOperationalMapOptions({
          container: mapContainer,
          style,
          minZoom: STUDY_AREA_MIN_ZOOM,
          maxBounds: null,
        }),
      );
      mapRef.current = map;
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

      unbindMapInteractions = bindCollectionPointMapInteractions(map, (pointId) => {
        setSelectedId(pointId);
        scrollToDetailPanel();
      });

      map.on('load', () => {
        map.resize();
        setMapReady(true);
        syncCollectionPointsMap();
        fitCollectionPointsMap();
      });

      map.on('style.load', () => {
        if (!mapReady()) return;
        syncCollectionPointsMap();
      });

      ro = new ResizeObserver(() => mapRef.current?.resize());
      ro.observe(mapContainer);
    });

    onCleanup(() => {
      cancelled = true;
      unbindMapInteractions?.();
      ro?.disconnect();
      mapRef.current?.remove();
      mapRef.current = undefined;
    });
  });

  createEffect(() => {
    filtered();
    selectedId();
    if (mapReady()) syncCollectionPointsMap();
  });

  createEffect(() => {
    sectorsGeo();
    if (mapReady()) syncCollectionPointsMap();
  });

  createEffect(() => {
    selectedId();
    if (mapReady()) flyToSelectedPoint();
  });

  createEffect(() => {
    displayPoint();
    if (mapReady()) {
      requestAnimationFrame(() => mapRef.current?.resize());
    }
  });

  createEffect(() => {
    const points = allPoints();
    if (points.length === 0) return;
    const current = selectedId();
    if (current && !points.some((p) => p.id === current)) {
      setSelectedId('');
    }
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
        block: 'nearest',
      });
    });
  };

  const closeDetail = () => setSelectedId('');

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

  const formValuesToPayload = (values: CollectionPointFormValues, mode: 'create' | 'edit') => {
    const zoneManaged =
      sectorOptionsForForm().find((sector) => sector.id === values.sectorId)
        ?.generationRateKgPerDay != null;
    const base = {
      sectorId: values.sectorId,
      latitude: values.latitude,
      longitude: values.longitude,
      maxCapacityKg: values.maxCapacityKg,
      status: values.status,
      fillRateFactorOverride: values.fillRateFactorOverride,
      estimatedFillHours: values.estimatedFillHours,
      // Con tasa gestionada por zona, se reenvía null para que el backend redistribuya.
      generationRateKgPerDay: zoneManaged ? null : values.generationRateKgPerDay,
      servedPopulation: values.servedPopulation,
    };
    if (mode === 'create') {
      return { ...base, currentFillLevelKg: 0 };
    }
    return base;
  };

  const handleFormSubmit = async (values: CollectionPointFormValues) => {
    setSubmitting(true);
    try {
      const payload = formValuesToPayload(values, formMode());
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

  const handleDeletePoint = (point: CollectionPoint) => {
    setPendingDeletePoint(point);
  };

  const confirmDeletePoint = async () => {
    const point = pendingDeletePoint();
    if (!point) return;
    setSubmitting(true);
    try {
      await deleteCollectionPoint(point.id);
      addToast(`Punto ${point.id} eliminado`, 'success');
      const remaining = allPoints().filter((p) => p.id !== point.id);
      setSelectedId(remaining[0]?.id ?? '');
      setPendingDeletePoint(null);
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
    fitCollectionPointsMap();
  };

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
      <Show when={isResidentView()}>
        <div class="space-y-3">
          <ResidentBreadcrumbs
            items={[
              { label: 'Mi Recolección', href: residentHubHref() },
              { label: 'Puntos de recolección' },
            ]}
          />
          <div
            role="status"
            class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fero-green/30 bg-fero-green/5 px-4 py-3 dark:border-fero-green/40 dark:bg-fero-green/10"
          >
            <div>
              <p class="text-sm font-semibold text-fero-green-dark dark:text-fero-green">
                Viendo puntos de {residentSectorName()}
              </p>
              <Show when={residentOverview()?.schedule.hasSchedule}>
                <p class="mt-0.5 text-xs text-text-secondary">
                  Recolección {residentOverview()!.schedule.collectionDays} ·{' '}
                  {residentOverview()!.schedule.window} · Solo lectura
                </p>
              </Show>
              <Show when={!residentOverview()?.schedule.hasSchedule}>
                <p class="mt-0.5 text-xs text-text-secondary">
                  Contenedores de tu barrio — vista de consulta
                </p>
              </Show>
            </div>
            <div class="flex flex-wrap gap-2 shrink-0">
              <A href={residentMapHref({ focus: 'sector', sectorId: authUser()?.sectorId ?? undefined })}>
                <Button variant="outline" size="sm" class="gap-2">
                  <MapPin size={14} />
                  Mapa mi sector
                </Button>
              </A>
              <A href={residentHubHref()}>
                <Button variant="outline" size="sm" class="gap-2 shrink-0">
                  <ArrowRight size={14} class="rotate-180" />
                  Volver a Mi Recolección
                </Button>
              </A>
            </div>
          </div>
        </div>
      </Show>
      <Show when={canManage() && !isResidentView()}>
        <SectorFillRatePanel />
      </Show>
      <Show when={pointsError()}>
        <div
          data-testid="collection-points-error"
          class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/30"
        >
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
      <CollectionPointsStatsStrip
        kpis={kpisData()}
        loading={pointsLoading() || summaryLoading()}
      />

      <div class="flex flex-col gap-3 rounded-xl border border-border bg-surface/60 px-3 py-3 dark:border-dark-border sm:flex-row sm:flex-wrap sm:items-center">
        <div class="relative min-w-0 flex-1 basis-52">
          <Search size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            placeholder="Buscar por código, sector o ubicación..."
            value={search()}
            onInput={(e) => applyFilters({ search: e.currentTarget.value })}
            class="w-full rounded-md border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-fero-blue focus:outline-none focus:ring-2 focus:ring-fero-blue/20 dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
          />
        </div>
        <select
          value={statusFilter()}
          onChange={(e) => applyFilters({ status: e.currentTarget.value })}
          class="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-secondary focus:border-fero-blue focus:outline-none dark:bg-dark-surface-hover dark:border-dark-border"
        >
          <For each={collectionPointStatusOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
        </select>
        <Show when={!isResidentView()}>
          <select
            value={sectorFilter()}
            onChange={(e) => applyFilters({ sector: e.currentTarget.value })}
            class="min-w-40 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-secondary focus:border-fero-blue focus:outline-none dark:bg-dark-surface-hover dark:border-dark-border"
          >
            <For each={sectorOptions()}>{(o) => <option value={o.value}>{o.label}</option>}</For>
          </select>
        </Show>
        <p class="text-xs text-text-muted sm:ml-auto">{filtered().length} puntos visibles</p>
        <Show when={!isResidentView()}>
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-secondary hover:bg-surface-hover disabled:opacity-40"
            aria-label="Exportar CSV"
            title="Exportar CSV"
            disabled={exporting() || pointsLoading()}
            onClick={handleExport}
          >
            <Download size={16} />
          </button>
        </Show>
        <Show when={canManage()}>
          <A href={simulationHref()}>
            <Button variant="outline" size="sm" class="gap-1.5" icon={<ArrowRight size={15} />}>
              {criticalCount() > 0 ? `Simular (${criticalCount()} críticos)` : 'Simular'}
            </Button>
          </A>
          <Button variant="primary" size="sm" class="gap-1.5" icon={<Plus size={15} />} onClick={() => openCreateForm()}>
            Nuevo punto
          </Button>
          <Button
            variant="outline"
            size="sm"
            class={`gap-1.5 ${placeMode() ? 'border-fero-blue text-fero-blue' : ''}`}
            icon={<Crosshair size={15} />}
            onClick={() => setPlaceMode((active) => !active)}
          >
            {placeMode() ? 'Clic en mapa…' : 'Colocar'}
          </Button>
        </Show>
      </div>

      <Card padding={false} class="overflow-hidden">
          <div class="flex items-center justify-between gap-2 border-b border-border px-4 py-3 dark:border-dark-border">
            <h3 class="font-heading text-sm font-semibold text-text-primary dark:text-white sm:text-base">
              Mapa de contenedores
            </h3>
            <span class="text-xs text-text-muted">{filtered().length} contenedores en mapa</span>
          </div>

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

            <div class="absolute bottom-3 left-3 z-10 rounded-md border border-border bg-surface/95 p-2 text-xs shadow-md backdrop-blur-sm dark:bg-dark-surface/95 dark:border-dark-border">
              <p class="mb-1 font-semibold text-text-primary dark:text-white">Leyenda</p>
              <ul class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-text-secondary">
                <For each={mapFillLegend}>
                  {(item) => (
                    <li class="flex items-center gap-1.5">
                      <Trash2 size={11} style={{ color: fillStatusColor(item.status) }} />
                      {item.label}
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </div>
        </Card>

      <div id="collection-point-detail" class="flex flex-col gap-4 lg:flex-row lg:items-start">
        <section
          class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xs dark:bg-dark-surface dark:border-dark-border"
        >
          <div class="border-b border-border px-4 py-3 dark:border-dark-border">
            <h3 class="font-heading text-sm font-semibold text-text-primary dark:text-white sm:text-base">
              Listado de puntos
            </h3>
          </div>

          <div class="min-h-0 flex-1 overflow-auto">
            <table class="w-full min-w-[36rem]">
              <thead class="sticky top-0 z-10">
                <tr class="border-b border-border bg-slate-50/95 text-left backdrop-blur-sm dark:border-dark-border dark:bg-dark-surface-hover/95">
                  <th class="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">ID</th>
                  <th class="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Sector</th>
                  <th class="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Estado</th>
                  <th class="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    {isResidentView() ? 'Consulta' : 'Acciones'}
                  </th>
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
                        <td colSpan={4} class="px-3 py-10 text-center text-sm text-text-muted">
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
                        <td class="px-3 py-2.5">
                          <p class="text-xs font-semibold text-text-primary dark:text-white">#{p.id}</p>
                          <p class="max-w-32 truncate text-[11px] text-text-muted" title={p.address}>
                            {p.address}
                          </p>
                        </td>
                        <td class="max-w-28 truncate px-3 py-2.5 text-xs text-text-secondary" title={p.sector}>
                          {p.sector}
                        </td>
                        <td class="px-3 py-2.5">
                          <div class="space-y-1">
                            <StatusBadge status={p.status} />
                            <Show when={canManage()}>
                              <CollectionPointOptimizationBadges
                                usedInLastOptimization={p.usedInLastOptimization}
                                priorityBoost={p.priorityBoost}
                                compact
                              />
                            </Show>
                          </div>
                        </td>
                        <td class="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div class="flex items-center gap-0.5">
                            <button type="button" class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-fero-blue" aria-label="Ver" onClick={() => selectPoint(p)}>
                              <Eye size={14} />
                            </button>
                            <Show when={isResidentView()}>
                              <A
                                href={residentMapHref({
                                  focus: 'sector',
                                  sectorId: authUser()?.sectorId ?? undefined,
                                })}
                                class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-fero-blue hover:bg-surface-hover"
                                title="Ver en mapa mi sector"
                              >
                                <MapPin size={13} />
                                Mapa
                              </A>
                            </Show>
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
            <p class="text-xs text-text-muted">{rangeLabel()}</p>
            <div class="flex items-center gap-2">
              <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary disabled:opacity-40" disabled={page() <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Anterior">
                <ChevronLeft size={16} />
              </button>
              <span class="min-w-24 text-center text-xs text-text-muted">
                Página {Math.min(page(), totalPages())} de {totalPages()}
              </span>
              <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary disabled:opacity-40" disabled={page() >= totalPages()} onClick={() => setPage((p) => Math.min(totalPages(), p + 1))} aria-label="Siguiente">
                <ChevronRight size={16} />
              </button>
              <select
                value={pageSize()}
                onChange={(e) => {
                  setPageSize(Number(e.currentTarget.value));
                  setPage(1);
                }}
                class="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text-secondary dark:bg-dark-surface-hover dark:border-dark-border"
              >
                <option value={10}>10 / pág.</option>
                <option value={20}>20 / pág.</option>
                <option value={50}>50 / pág.</option>
              </select>
            </div>
          </div>
        </section>

        <Show when={displayPoint()}>
          {(p) => (
            <>
              <div class="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={closeDetail} />
              <aside class="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-surface shadow-xl dark:bg-dark-surface dark:border-dark-border lg:static lg:z-auto lg:w-80 lg:max-w-none lg:shrink-0 lg:rounded-xl lg:border lg:shadow-xs">
                <div class="flex items-center justify-between border-b border-border px-4 py-3 dark:border-dark-border">
                  <h2 class="font-heading text-base font-semibold text-text-primary dark:text-white">
                    Detalle del punto
                  </h2>
                  <button
                    type="button"
                    class="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover"
                    onClick={closeDetail}
                    aria-label="Cerrar detalle"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div class="flex-1 overflow-y-auto p-4">
                  <div class="mb-4 flex items-start gap-3">
                    <span
                      class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                      style={{
                        'background-color': `${fillStatusColor(p().status)}22`,
                        color: fillStatusColor(p().status),
                      }}
                    >
                      <Trash2 size={22} />
                    </span>
                    <div class="min-w-0">
                      <div class="mb-1 flex flex-wrap items-center gap-2">
                        <h4 class="font-heading text-lg font-bold text-text-primary dark:text-white">{p().label}</h4>
                        <StatusBadge status={p().status} />
                      </div>
                      <Show when={canManage()}>
                        <CollectionPointOptimizationBadges
                          usedInLastOptimization={p().usedInLastOptimization}
                          priorityBoost={p().priorityBoost}
                        />
                      </Show>
                      <p class="text-sm text-text-secondary">{p().address}</p>
                      <p class="text-xs text-text-muted">Sector {p().sector}</p>
                    </div>
                  </div>

                  <div class="mb-4">
                    <div class="mb-1 flex items-center justify-between text-xs text-text-muted">
                      <span>Nivel de llenado</span>
                      <span class="font-bold" style={{ color: fillStatusColor(p().status) }}>
                        {p().fillLevel}%
                      </span>
                    </div>
                    <ProgressBar
                      value={p().fillLevel}
                      color={fillStatusBarColor(p().status)}
                      size="sm"
                    />
                  </div>

                  <dl class="mb-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt class="text-xs text-text-muted">Tipo</dt>
                      <dd class="font-semibold text-text-primary dark:text-white">{p().containerType}</dd>
                    </div>
                    <div>
                      <dt class="text-xs text-text-muted">Capacidad</dt>
                      <dd class="font-semibold text-text-primary dark:text-white">
                        {p().capacityL.toLocaleString('es-VE')} L
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
                    <div class="col-span-2">
                      <dt class="text-xs text-text-muted">Estado operativo</dt>
                      <dd class="mt-0.5">
                        <Badge variant={p().active ? 'success' : 'default'} dot>
                          {p().active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </dd>
                    </div>
                  </dl>

                  <Show when={canManage()}>
                    <VisitScheduleEditor pointCode={p().id} />
                  </Show>

                  <Show
                    when={fillHistoryChart()}
                    fallback={
                      <p class="mb-4 text-sm text-text-muted">Cargando historial de llenado…</p>
                    }
                  >
                    {(chart) => (
                      <div class="mb-4 rounded-lg border border-border p-3 dark:border-dark-border">
                        <div class="mb-2 flex items-center justify-between gap-2">
                          <p class="text-xs font-semibold text-text-primary dark:text-white">Historial (7 días)</p>
                          <span class="text-[10px] text-text-muted">{fillHistorySourceLabel()}</span>
                        </div>
                        <div class="h-36 w-full">
                          <Line data={chart()} options={lineChartOptions} />
                        </div>
                      </div>
                    )}
                  </Show>

                  <div class="flex flex-wrap gap-2">
                    <Button variant="primary" size="sm" onClick={() => setHistoryDrawerOpen(true)}>
                      Ver historial
                    </Button>
                    <Show when={isResidentView()}>
                      <A
                        href={residentMapHref({
                          focus: 'sector',
                          sectorId: authUser()?.sectorId ?? undefined,
                        })}
                      >
                        <Button variant="outline" size="sm" class="gap-2" icon={<MapPin size={14} />}>
                          Ver en mapa
                        </Button>
                      </A>
                    </Show>
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
                </div>
              </aside>
            </>
          )}
        </Show>
      </div>

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

      <ConfirmDialog
        open={pendingDeletePoint() != null}
        title={`¿Eliminar el punto ${pendingDeletePoint()?.id ?? ''}?`}
        message={
          pendingDeletePoint()?.label
            ? `Se eliminará «${pendingDeletePoint()!.label}»${pendingDeletePoint()!.address ? ` (${pendingDeletePoint()!.address})` : ''}. Esta acción no se puede deshacer.`
            : 'Se eliminará el punto de recolección. Esta acción no se puede deshacer.'
        }
        confirmLabel="Eliminar punto"
        tone="danger"
        loading={submitting()}
        onConfirm={() => void confirmDeletePoint()}
        onCancel={() => setPendingDeletePoint(null)}
        testId="collection-point-delete-confirm"
      />

      <ToastContainer toasts={toasts()} onDismiss={removeToast} />
    </div>
  );
}
