import { For, Show, createMemo, createResource, createSignal, type JSX } from 'solid-js';
import { A } from '@solidjs/router';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Flag,
  Fuel,
  Gauge,
  MapPin,
  MoreVertical,
  Pencil,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
  Truck,
  Wrench,
  X,
  Calendar,
  Building2,
  Route,
  Clock,
} from 'lucide-solid';
import {
  Button,
  KpiCard,
  ProgressBar,
  StatusBadge,
} from '../../design-system/components';
import {
  vehicleDetailTabs,
  vehicleStatusOptions,
  vehicleTypeOptions,
  vehiclesKpis,
  vehiclesList,
  type Vehicle,
  type VehicleDetailTabId,
  type VehicleStatus,
} from '../../data/mock/vehicles';
import { fetchVehicles } from '../../core/api/vehicles';

const kpiIcon: Record<(typeof vehiclesKpis)[number]['icon'], () => JSX.Element> = {
  truck: () => <Truck size={24} />,
  wrench: () => <Wrench size={24} />,
  flag: () => <Flag size={24} />,
};

function fuelBarColor(pct: number): 'green' | 'amber' | 'red' {
  if (pct >= 50) return 'green';
  if (pct >= 25) return 'amber';
  return 'red';
}

function capacityBarColor(pct: number): 'green' | 'amber' | 'red' {
  if (pct >= 85) return 'red';
  if (pct >= 65) return 'amber';
  return 'green';
}

function VehicleThumb(props: { vehicle: Vehicle; size?: 'sm' | 'lg' }) {
  const size = () => (props.size === 'lg' ? 'h-20 w-28' : 'h-10 w-14');
  return (
    <span class={`block shrink-0 overflow-hidden rounded-md bg-slate-100 ${size()}`}>
      <img
        src={props.vehicle.image}
        alt={props.vehicle.id}
        class="h-full w-full object-cover"
        loading="lazy"
        referrerpolicy="no-referrer"
      />
    </span>
  );
}

function MetricBar(props: { value: number; color: 'green' | 'amber' | 'red' }) {
  return (
    <div class="flex min-w-24 max-w-32 flex-col gap-1">
      <span class="text-xs font-semibold text-text-primary dark:text-white">{props.value}%</span>
      <ProgressBar value={props.value} color={props.color} size="sm" />
    </div>
  );
}

export default function VehiclesPage() {
  const [search, setSearch] = createSignal('');
  const [statusFilter, setStatusFilter] = createSignal('');
  const [typeFilter, setTypeFilter] = createSignal('');
  const [page, setPage] = createSignal(1);
  const [pageSize, setPageSize] = createSignal(8);
  const [selectedId, setSelectedId] = createSignal<string | null>('TR-08');
  const [detailTab, setDetailTab] = createSignal<VehicleDetailTabId>('info');
  const [apiVehicles] = createResource(fetchVehicles);
  const allVehicles = createMemo(() => apiVehicles() ?? vehiclesList);

  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase();
    const status = statusFilter();
    const type = typeFilter();
    return allVehicles().filter((v) => {
      if (status && v.status !== status) return false;
      if (type && v.type !== type) return false;
      if (!q) return true;
      return (
        v.id.toLowerCase().includes(q) ||
        v.plate.toLowerCase().includes(q) ||
        v.driver.toLowerCase().includes(q) ||
        v.type.toLowerCase().includes(q)
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
    if (total() === 0) return 'Mostrando 0 de 0 vehículos';
    const p = Math.min(page(), totalPages());
    const from = (p - 1) * pageSize() + 1;
    const to = Math.min(p * pageSize(), total());
    return `Mostrando ${from} a ${to} de ${total()} vehículos`;
  };

  const selected = createMemo(() => {
    const id = selectedId();
    if (!id) return undefined;
    return allVehicles().find((v) => v.id === id);
  });

  const selectVehicle = (v: Vehicle) => {
    setSelectedId(v.id);
    setDetailTab('info');
  };

  const closeDetail = () => setSelectedId(null);

  return (
    <div class="space-y-5">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-center">
        <div class="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <For each={vehiclesKpis}>
            {(kpi) => (
              <KpiCard
                title={kpi.title}
                value={kpi.value}
                unit={kpi.unit}
                iconTone={kpi.iconTone}
                icon={kpiIcon[kpi.icon]()}
              />
            )}
          </For>
        </div>
        <div class="flex shrink-0">
          <Button variant="primary" class="w-full gap-2 px-5 py-2.5 xl:w-auto" icon={<Plus size={17} />}>
            Nuevo vehículo
            <ChevronDown size={15} class="opacity-80" />
          </Button>
        </div>
      </div>

      <div class="flex flex-col gap-4 lg:flex-row lg:items-start">
        <section class="min-w-0 flex-1 rounded-xl border border-border bg-surface shadow-xs dark:bg-dark-surface dark:border-dark-border">
          <div class="flex flex-wrap items-center gap-2 border-b border-border p-3 dark:border-dark-border sm:gap-3 sm:p-4">
            <div class="relative min-w-0 flex-1 basis-48">
              <Search size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                placeholder="Buscar vehículo..."
                value={search()}
                onInput={(e) => {
                  setSearch(e.currentTarget.value);
                  setPage(1);
                }}
                class="w-full rounded-md border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-fero-blue focus:outline-none focus:ring-2 focus:ring-fero-blue/20 dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
              />
            </div>

            <select
              value={statusFilter()}
              onChange={(e) => {
                setStatusFilter(e.currentTarget.value);
                setPage(1);
              }}
              class="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-secondary focus:border-fero-blue focus:outline-none dark:bg-dark-surface-hover dark:border-dark-border"
            >
              <For each={vehicleStatusOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
            </select>

            <select
              value={typeFilter()}
              onChange={(e) => {
                setTypeFilter(e.currentTarget.value);
                setPage(1);
              }}
              class="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-secondary focus:border-fero-blue focus:outline-none dark:bg-dark-surface-hover dark:border-dark-border"
            >
              <For each={vehicleTypeOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
            </select>

            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover"
            >
              <SlidersHorizontal size={16} />
              Filtros
            </button>

            <button
              type="button"
              class="ml-auto flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-secondary hover:bg-surface-hover"
              aria-label="Exportar"
            >
              <Download size={16} />
            </button>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full min-w-180">
              <thead>
                <tr class="border-b border-border bg-slate-50/80 text-left dark:border-dark-border dark:bg-dark-surface-hover">
                  <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Vehículo</th>
                  <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Placa</th>
                  <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Estado</th>
                  <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Conductor</th>
                  <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Combustible</th>
                  <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Capacidad</th>
                  <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border dark:divide-dark-border">
                <For
                  each={pageItems()}
                  fallback={
                    <tr>
                      <td colSpan={7} class="px-4 py-10 text-center text-sm text-text-muted">
                        No se encontraron vehículos
                      </td>
                    </tr>
                  }
                >
                  {(v) => (
                    <tr
                      class={`cursor-pointer transition-colors hover:bg-surface-hover dark:hover:bg-dark-surface-hover ${
                        selectedId() === v.id ? 'bg-fero-green/5' : 'bg-surface dark:bg-dark-surface'
                      }`}
                      onClick={() => selectVehicle(v)}
                    >
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-3">
                          <VehicleThumb vehicle={v} />
                          <div>
                            <p class="text-sm font-semibold text-text-primary dark:text-white">{v.id}</p>
                            <p class="text-xs text-text-muted">{v.type}</p>
                          </div>
                        </div>
                      </td>
                      <td class="px-4 py-3 text-sm font-medium text-text-primary dark:text-white">{v.plate}</td>
                      <td class="px-4 py-3">
                        <StatusBadge status={v.status as VehicleStatus} />
                      </td>
                      <td class="px-4 py-3 text-sm text-text-secondary">{v.driver}</td>
                      <td class="px-4 py-3">
                        <MetricBar value={v.fuelPct} color={fuelBarColor(v.fuelPct)} />
                      </td>
                      <td class="px-4 py-3">
                        <MetricBar value={v.capacityPct} color={capacityBarColor(v.capacityPct)} />
                      </td>
                      <td class="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div class="flex items-center gap-0.5">
                          <button
                            type="button"
                            class="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-fero-blue"
                            aria-label="Ver"
                            onClick={() => selectVehicle(v)}
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            type="button"
                            class="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text-secondary"
                            aria-label="Editar"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            class="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text-secondary"
                            aria-label="Más"
                          >
                            <MoreVertical size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 dark:border-dark-border">
            <p class="text-xs text-text-muted sm:text-sm">{rangeLabel()}</p>

            <div class="flex items-center gap-1">
              <button
                type="button"
                class="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary disabled:opacity-40"
                disabled={page() <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <For each={Array.from({ length: totalPages() }, (_, i) => i + 1)}>
                {(n) => (
                  <button
                    type="button"
                    class={`flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-medium ${
                      page() === n
                        ? 'bg-fero-green-dark text-white'
                        : 'border border-border text-text-secondary hover:bg-surface-hover'
                    }`}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                )}
              </For>
              <button
                type="button"
                class="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary disabled:opacity-40"
                disabled={page() >= totalPages()}
                onClick={() => setPage((p) => Math.min(totalPages(), p + 1))}
                aria-label="Siguiente"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <select
              value={pageSize()}
              onChange={(e) => {
                setPageSize(Number(e.currentTarget.value));
                setPage(1);
              }}
              class="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-secondary dark:bg-dark-surface-hover dark:border-dark-border"
            >
              <option value={8}>8 por página</option>
              <option value={10}>10 por página</option>
              <option value={20}>20 por página</option>
            </select>
          </div>
        </section>

        <Show when={selected()}>
          {(v) => (
            <>
              <div class="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={closeDetail} />
              <aside class="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-surface shadow-xl dark:bg-dark-surface dark:border-dark-border lg:static lg:z-auto lg:max-w-none lg:w-80 xl:w-96 lg:shrink-0 lg:rounded-xl lg:border lg:shadow-xs">
                <div class="flex items-center justify-between border-b border-border px-4 py-3 dark:border-dark-border">
                  <h2 class="font-heading text-base font-semibold text-text-primary dark:text-white">
                    Detalles del vehículo
                  </h2>
                  <button
                    type="button"
                    class="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text-secondary"
                    onClick={closeDetail}
                    aria-label="Cerrar"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div class="flex-1 overflow-y-auto p-4">
                  <div class="mb-4 flex gap-3">
                    <VehicleThumb vehicle={v()} size="lg" />
                    <div class="min-w-0">
                      <div class="mb-1 flex flex-wrap items-center gap-2">
                        <p class="font-heading text-lg font-bold text-text-primary dark:text-white">{v().id}</p>
                        <StatusBadge status={v().status} />
                      </div>
                      <p class="text-sm text-text-secondary">{v().type}</p>
                      <p class="mt-0.5 text-xs font-medium text-text-muted">Placa {v().plate}</p>
                    </div>
                  </div>

                  <div class="mb-4 grid grid-cols-4 border-b border-border dark:border-dark-border">
                    <For each={[...vehicleDetailTabs]}>
                      {(tab) => (
                        <button
                          type="button"
                          class={`border-b-2 px-1 pb-2 text-center text-[11px] font-medium leading-tight transition-colors ${
                            detailTab() === tab.id
                              ? 'border-fero-green-dark text-fero-green-dark'
                              : 'border-transparent text-text-muted hover:text-text-secondary'
                          }`}
                          onClick={() => setDetailTab(tab.id)}
                        >
                          {tab.label}
                        </button>
                      )}
                    </For>
                  </div>

                  <Show when={detailTab() === 'info'}>
                    <ul class="space-y-3.5">
                      <DetailRow icon={<Truck size={16} />} label="Modelo" value={v().model} />
                      <DetailRow icon={<Calendar size={16} />} label="Año" value={String(v().year)} />
                      <DetailRow icon={<Gauge size={16} />} label="Capacidad" value={`${v().capacityM3} m³`} />
                      <li class="flex gap-3">
                        <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-text-muted dark:bg-dark-surface-hover">
                          <Fuel size={16} />
                        </span>
                        <div class="min-w-0 flex-1">
                          <p class="text-xs text-text-muted">Combustible</p>
                          <p class="text-sm font-semibold text-text-primary dark:text-white">
                            {v().fuelPct}%
                            <Show when={v().fuelLiters}>
                              <span class="font-medium text-text-muted"> ({v().fuelLiters} L)</span>
                            </Show>
                          </p>
                          <ProgressBar
                            value={v().fuelPct}
                            color={fuelBarColor(v().fuelPct)}
                            size="sm"
                            class="mt-1.5"
                          />
                        </div>
                      </li>
                      <DetailRow
                        icon={<Gauge size={16} />}
                        label="Kilometraje"
                        value={`${v().mileageKm.toLocaleString('es-VE')} km`}
                      />
                      <li class="flex gap-3">
                        <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-text-muted dark:bg-dark-surface-hover">
                          <Phone size={16} />
                        </span>
                        <div class="min-w-0">
                          <p class="text-xs text-text-muted">Conductor asignado</p>
                          <p class="text-sm font-semibold text-text-primary dark:text-white">{v().driver}</p>
                          <Show when={v().driverPhone}>
                            <p class="text-xs text-text-muted">{v().driverPhone}</p>
                          </Show>
                        </div>
                      </li>
                      <DetailRow icon={<Building2 size={16} />} label="Base asignada" value={v().base} />
                      <DetailRow
                        icon={<Route size={16} />}
                        label="Estado actual"
                        value={
                          v().currentRoute
                            ? `En ruta — ${v().currentRoute}`
                            : statusLabel(v().status)
                        }
                      />
                      <DetailRow icon={<Clock size={16} />} label="Última actualización" value={v().updatedAt} />
                    </ul>
                  </Show>

                  <Show when={detailTab() !== 'info'}>
                    <p class="py-8 text-center text-sm text-text-muted">
                      Contenido de {vehicleDetailTabs.find((t) => t.id === detailTab())?.label.toLowerCase()} próximamente.
                    </p>
                  </Show>
                </div>

                <div class="border-t border-border p-4 dark:border-dark-border">
                  <A href="/map" class="block">
                    <Button variant="primary" class="w-full" icon={<MapPin size={16} />}>
                      Ver en mapa
                    </Button>
                  </A>
                </div>
              </aside>
            </>
          )}
        </Show>
      </div>
    </div>
  );
}

function statusLabel(status: VehicleStatus) {
  const map: Record<VehicleStatus, string> = {
    'en-ruta': 'En ruta',
    disponible: 'Disponible',
    mantenimiento: 'En mantenimiento',
    'fuera-de-servicio': 'Fuera de servicio',
  };
  return map[status];
}

function DetailRow(props: { icon: JSX.Element; label: string; value: string }) {
  return (
    <li class="flex gap-3">
      <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-text-muted dark:bg-dark-surface-hover">
        {props.icon}
      </span>
      <div class="min-w-0">
        <p class="text-xs text-text-muted">{props.label}</p>
        <p class="text-sm font-semibold text-text-primary dark:text-white">{props.value}</p>
      </div>
    </li>
  );
}
