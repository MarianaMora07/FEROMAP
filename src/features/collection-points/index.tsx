import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Download,
  Eye,
  Minus,
  MoreVertical,
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
  KpiCard,
  ProgressBar,
  StatusBadge,
} from '../../design-system/components';
import { osmMapStyle } from '../../core/utils/mapStyle';
import { UNARE_CENTER, UNARE_ZOOM } from '../../data/types/geo';
import {
  collectionPointSectorOptions,
  collectionPointStatusOptions,
  collectionPointsKpis,
  collectionPointsList,
  fillDistribution,
  fillHistory7d,
  fillStatusBarColor,
  fillStatusColor,
  mapFillLegend,
  type CollectionPoint,
} from '../../data/mock/collectionPoints';

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

export default function CollectionPointsPage() {
  let mapContainer!: HTMLDivElement;
  const mapRef: { current?: MapLibreMap } = {};
  const markersById = new Map<string, Marker>();

  const [search, setSearch] = createSignal('');
  const [statusFilter, setStatusFilter] = createSignal('');
  const [sectorFilter, setSectorFilter] = createSignal('');
  const [page, setPage] = createSignal(1);
  const [pageSize] = createSignal(8);
  const [selectedId, setSelectedId] = createSignal('045');
  const [mapReady, setMapReady] = createSignal(false);

  onMount(() => {
    Chart.register(ArcElement, CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend);

    const map = new maplibregl.Map({
      container: mapContainer,
      style: osmMapStyle,
      center: UNARE_CENTER,
      zoom: UNARE_ZOOM,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      map.resize();
      for (const point of collectionPointsList) {
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
      setMapReady(true);
      openSelectedPopup();
    });

    const onPopupClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest?.('.popup-ver-detalles') as HTMLElement | null;
      if (!btn) return;
      const id = btn.dataset.pointId;
      if (id) setSelectedId(id);
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

  const openSelectedPopup = () => {
    const id = selectedId();
    const marker = markersById.get(id);
    const map = mapRef.current;
    if (!marker || !map) return;
    const point = collectionPointsList.find((p) => p.id === id);
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

  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase();
    const status = statusFilter();
    const sector = sectorFilter();
    return collectionPointsList.filter((p) => {
      if (status && p.status !== status) return false;
      if (sector && p.sector !== sector) return false;
      if (!q) return true;
      return (
        p.id.includes(q) ||
        p.label.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.sector.toLowerCase().includes(q)
      );
    });
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

  const selected = createMemo(() => collectionPointsList.find((p) => p.id === selectedId()));

  const selectPoint = (p: CollectionPoint) => setSelectedId(p.id);

  const zoomIn = () => mapRef.current?.zoomIn();
  const zoomOut = () => mapRef.current?.zoomOut();
  const recenter = () => {
    const point = selected();
    if (point) {
      mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 14 });
    } else {
      mapRef.current?.flyTo({ center: UNARE_CENTER, zoom: UNARE_ZOOM });
    }
  };

  const lineData = {
    labels: fillHistory7d.labels,
    datasets: [
      {
        data: fillHistory7d.values,
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

  const donutData = {
    labels: fillDistribution.items.map((i) => i.label),
    datasets: [
      {
        data: fillDistribution.items.map((i) => i.count),
        backgroundColor: fillDistribution.items.map((i) => i.color),
        borderWidth: 0,
        cutout: '72%',
      },
    ],
  };

  return (
    <div class="space-y-5">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-center">
        <div class="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <For each={collectionPointsKpis}>
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
        </div>
        <div class="flex shrink-0">
          <Button variant="primary" class="w-full gap-2 px-5 py-2.5 xl:w-auto" icon={<Plus size={17} />}>
            Nuevo punto
          </Button>
        </div>
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
                placeholder="Buscar dirección..."
                class="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-2 text-xs text-text-primary placeholder:text-text-muted focus:border-fero-blue focus:outline-none dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
              />
            </div>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-hover"
            >
              <SlidersHorizontal size={14} />
              Filtros
            </button>
          </div>

          <div class="relative h-80 bg-slate-100 dark:bg-slate-900 lg:h-105">
            <div ref={mapContainer} class="absolute inset-0 h-full w-full" />

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
                onInput={(e) => {
                  setSearch(e.currentTarget.value);
                  setPage(1);
                }}
                class="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-2 text-xs text-text-primary placeholder:text-text-muted focus:border-fero-blue focus:outline-none dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
              />
            </div>
            <select
              value={statusFilter()}
              onChange={(e) => {
                setStatusFilter(e.currentTarget.value);
                setPage(1);
              }}
              class="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text-secondary dark:bg-dark-surface-hover dark:border-dark-border"
            >
              <For each={collectionPointStatusOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
            </select>
            <select
              value={sectorFilter()}
              onChange={(e) => {
                setSectorFilter(e.currentTarget.value);
                setPage(1);
              }}
              class="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text-secondary dark:bg-dark-surface-hover dark:border-dark-border"
            >
              <For each={collectionPointSectorOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
            </select>
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary hover:bg-surface-hover"
              aria-label="Exportar"
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
                <For
                  each={pageItems()}
                  fallback={
                    <tr>
                      <td colSpan={6} class="px-3 py-8 text-center text-sm text-text-muted">
                        No se encontraron puntos
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
                        <StatusBadge status={p.status} />
                      </td>
                      <td class="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div class="flex items-center gap-0.5">
                          <button type="button" class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-fero-blue" aria-label="Ver" onClick={() => selectPoint(p)}>
                            <Eye size={14} />
                          </button>
                          <button type="button" class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover" aria-label="Editar">
                            <Pencil size={14} />
                          </button>
                          <button type="button" class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover" aria-label="Más">
                            <MoreVertical size={14} />
                          </button>
                        </div>
                      </td>
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
      </div>

      <Show when={selected()}>
        {(p) => (
          <div class="grid gap-4 lg:grid-cols-3">
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
                <Button variant="primary" size="sm">
                  Ver historial
                </Button>
                <Button variant="outline" size="sm" icon={<Pencil size={14} />}>
                  Editar
                </Button>
                <Button variant="outline" size="sm">
                  Más acciones
                  <ChevronDown size={14} class="opacity-70" />
                </Button>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Historial de llenado"
                action={<span class="text-xs text-text-muted">Últimos 7 días</span>}
              />
              <div class="mx-auto h-52 w-full max-w-md">
                <Line
                  data={lineData}
                  options={{
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
                  }}
                />
              </div>
            </Card>

            <Card>
              <CardHeader title="Distribución por nivel de llenado" />
              <div class="mx-auto flex w-full max-w-sm flex-col items-center justify-center gap-4 sm:flex-row">
                <div class="relative h-36 w-36 shrink-0">
                  <Doughnut
                    data={donutData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false }, tooltip: { enabled: true } },
                    }}
                  />
                  <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span class="font-heading text-2xl font-bold text-text-primary dark:text-white">
                      {fillDistribution.total}
                    </span>
                    <span class="text-xs text-text-muted">Total</span>
                  </div>
                </div>
                <ul class="w-full max-w-44 space-y-2">
                  <For each={fillDistribution.items}>
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
              <div class="mt-4 flex justify-center">
                <A
                  href="/analytics"
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
    </div>
  );
}
