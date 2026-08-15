import { For, Show, createMemo, createResource, createSignal, type JSX } from 'solid-js';
import { A } from '@solidjs/router';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Fuel,
  Gauge,
  MapPin,
  Pencil,
  Phone,
  Search,
  Truck,
  Wrench,
  X,
  Calendar,
  Building2,
  Route,
  Clock,
  Users,
} from 'lucide-solid';
import {
  Button,
  ProgressBar,
  StatusBadge,
  ToastContainer,
  createToastStore,
} from '../../design-system/components';
import {
  vehicleDetailTabs,
  vehicleStatusOptions,
  vehicleTypeOptions,
  type Vehicle,
  type VehicleDetailTabId,
  type VehicleStatus,
} from '../../data/mock/vehicles';
import {
  computeVehiclesKpisFromSummary,
  countAssignableVehicles,
  downloadVehiclesExport,
  enrichVehiclesWithOptimization,
  fetchVehicles,
  fetchVehiclesOptimizationContext,
  fetchVehiclesSummary,
  fetchVehicleIncidents,
  formatCapacityKg,
  formatCrewAssignmentLabel,
  isAssignableVehicle,
  updateVehicleStatus,
} from '../../core/api/vehicles';
import { ApiError, useMocks } from '../../core/api/client';
import { canManageVehicles, canOptimize } from '../../core/auth/permissions';
import { buildVehicleMapHref } from '../../core/utils/vehiclesOptimization';
import { buildVehiclesExportFilename, downloadVehiclesCsv } from '../../core/utils/vehiclesUtils';
import { authUser } from '../../core/stores/authStore';
import { VehicleActionsMenu } from './VehicleActionsMenu';
import { VehicleEditModal } from './VehicleEditModal';
import { VehicleMaintenancePanel } from './VehicleMaintenancePanel';
import { VehicleOptimizationBadges } from './VehicleOptimizationBadges';
import { FleetStatsStrip, VehiclesFleetIntro } from './VehiclesFleetIntro';

const implementedDetailTabs = vehicleDetailTabs.filter(
  (tab) => tab.id === 'info' || tab.id === 'maintenance',
);

function fuelBarColor(pct: number): 'green' | 'amber' | 'red' {
  if (pct >= 50) return 'green';
  if (pct >= 25) return 'amber';
  return 'red';
}

function TableRowSkeleton() {
  return (
    <tr class="animate-pulse">
      <td class="px-4 py-3"><div class="h-10 w-36 rounded bg-slate-200 dark:bg-slate-700" /></td>
      <td class="px-4 py-3"><div class="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700" /></td>
      <td class="px-4 py-3"><div class="h-5 w-20 rounded-full bg-slate-200 dark:bg-slate-700" /></td>
      <td class="px-4 py-3"><div class="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" /></td>
      <td class="px-4 py-3"><div class="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700" /></td>
      <td class="px-4 py-3"><div class="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700" /></td>
      <td class="px-4 py-3"><div class="h-8 w-20 rounded bg-slate-200 dark:bg-slate-700" /></td>
    </tr>
  );
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

function MetricBar(props: { value: number | null; color: 'green' | 'amber' | 'red' }) {
  if (props.value === null) {
    return <span class="text-xs text-text-muted">Sin dato</span>;
  }
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
  const [assignableOnly, setAssignableOnly] = createSignal(false);
  const [page, setPage] = createSignal(1);
  const [pageSize, setPageSize] = createSignal(8);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [detailTab, setDetailTab] = createSignal<VehicleDetailTabId>('info');
  const [statusUpdating, setStatusUpdating] = createSignal(false);
  const [exporting, setExporting] = createSignal(false);
  const [editingVehicle, setEditingVehicle] = createSignal<(Vehicle & { maxCapacityKg: number }) | null>(null);
  const { toasts, addToast, removeToast } = createToastStore();
  const [apiVehicles, { refetch: refetchVehicles }] = createResource(fetchVehicles);
  const [apiSummary, { refetch: refetchSummary }] = createResource(fetchVehiclesSummary);
  const [optimizationContext, { refetch: refetchOptimizationContext }] = createResource(
    apiVehicles,
    (vehicles) => fetchVehiclesOptimizationContext(vehicles ?? []),
  );
  const allVehicles = createMemo(() => {
    const vehicles = apiVehicles() ?? [];
    const context = optimizationContext();
    if (!context) return vehicles;
    return enrichVehiclesWithOptimization(vehicles, context);
  });
  const vehiclesLoading = () => apiVehicles.loading || apiSummary.loading;
  const vehiclesError = () => apiVehicles.error;
  const vehiclesKpisData = createMemo(() => {
    const summary = apiSummary();
    if (summary) return computeVehiclesKpisFromSummary(summary);
    return [];
  });
  const assignableCount = createMemo(() => apiSummary()?.assignableCount ?? countAssignableVehicles(allVehicles()));
  const canGoToSimulation = () => canOptimize(authUser()?.role);
  const canManage = () => canManageVehicles(authUser()?.role);

  const simulationHref = createMemo(() => {
    const count = assignableCount();
    return count > 0 ? `/simulation?vehicles=${count}` : '/simulation';
  });

  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase();
    const status = statusFilter();
    const type = typeFilter();
    const onlyAssignable = assignableOnly();
    return allVehicles().filter((v) => {
      if (onlyAssignable && !isAssignableVehicle(v.status)) return false;
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

  const [vehicleIncidents] = createResource(
    () => {
      const id = selectedId();
      if (!id || detailTab() !== 'maintenance') return null;
      return id;
    },
    (id) => (id ? fetchVehicleIncidents(id) : Promise.resolve([])),
  );

  const selectVehicle = (v: Vehicle) => {
    setSelectedId(v.id);
    setDetailTab('info');
  };

  const closeDetail = () => setSelectedId(null);

  const refreshFleet = async () => {
    await Promise.all([refetchVehicles(), refetchSummary(), refetchOptimizationContext()]);
  };

  const handleSetMaintenance = async (vehicle: Vehicle) => {
    setStatusUpdating(true);
    try {
      await updateVehicleStatus(vehicle.id, 'maintenance');
      addToast(`${vehicle.id} marcado en mantenimiento`, 'success');
      await refreshFleet();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'No se pudo actualizar el vehículo';
      addToast(message, 'error');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleSetAvailable = async (vehicle: Vehicle) => {
    setStatusUpdating(true);
    try {
      await updateVehicleStatus(vehicle.id, 'available');
      addToast(`${vehicle.id} marcado como disponible`, 'success');
      await refreshFleet();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'No se pudo actualizar el vehículo';
      addToast(message, 'error');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleExport = async () => {
    const vehicles = filtered();
    if (vehicles.length === 0) {
      addToast('No hay vehículos para exportar con los filtros actuales', 'warning');
      return;
    }

    const filename = buildVehiclesExportFilename({
      status: statusFilter(),
      assignableOnly: assignableOnly(),
      search: search(),
    });

    setExporting(true);
    try {
      if (useMocks) {
        downloadVehiclesCsv(vehicles, filename);
      } else {
        await downloadVehiclesExport(
          {
            status: statusFilter() || undefined,
            assignableOnly: assignableOnly(),
            q: search().trim() || undefined,
          },
          filename,
        );
      }
      addToast(`Exportados ${vehicles.length} vehículos a CSV`, 'success');
    } catch {
      addToast('No se pudo descargar el archivo CSV del servidor', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div class="space-y-5">
      <ToastContainer toasts={toasts()} onDismiss={removeToast} />
      <VehicleEditModal
        vehicle={editingVehicle()}
        open={editingVehicle() !== null}
        onClose={() => setEditingVehicle(null)}
        onSaved={() => {
          void refetchVehicles();
          void refetchSummary();
          addToast('Vehículo actualizado.', 'success');
        }}
        onError={(message) => addToast(message, 'error')}
      />
      <Show when={vehiclesError()}>
        <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/30">
          <p class="text-sm font-semibold text-red-700 dark:text-red-300">
            No se pudieron cargar los vehículos
          </p>
          <p class="mt-1 text-sm text-red-600 dark:text-red-400">
            {vehiclesError() instanceof Error ? vehiclesError()!.message : 'Error de conexión con la API'}
          </p>
          <button
            type="button"
            class="mt-2 text-sm font-medium text-red-700 underline dark:text-red-300"
            onClick={() => void refetchVehicles()}
          >
            Reintentar
          </button>
        </div>
      </Show>

      <VehiclesFleetIntro
        assignableCount={assignableCount()}
        simulationHref={simulationHref()}
        showSimulationLink={canGoToSimulation()}
        showDriversLink={canManage()}
      />

      <FleetStatsStrip kpis={vehiclesKpisData()} loading={vehiclesLoading()} />

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
              class={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors ${
                assignableOnly()
                  ? 'border-fero-green bg-fero-green/10 text-fero-green-dark'
                  : 'border-border text-text-secondary hover:bg-surface-hover'
              }`}
              onClick={() => {
                setAssignableOnly((value) => !value);
                setStatusFilter('');
                setPage(1);
              }}
            >
              <Truck size={16} />
              Asignables
            </button>

            <button
              type="button"
              class="ml-auto flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-secondary hover:bg-surface-hover disabled:opacity-50"
              aria-label="Exportar"
              disabled={exporting()}
              onClick={handleExport}
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
                  <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Capacidad máx.</th>
                  <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border dark:divide-dark-border">
                <Show
                  when={!vehiclesLoading()}
                  fallback={
                    <For each={Array.from({ length: 6 })}>{() => <TableRowSkeleton />}</For>
                  }
                >
                <For
                  each={pageItems()}
                  fallback={
                    <tr>
                      <td colSpan={7} class="px-4 py-10 text-center text-sm text-text-muted">
                        {vehiclesError()
                          ? 'No se pudo cargar el listado de vehículos.'
                          : assignableOnly()
                            ? 'No hay vehículos asignables con los filtros actuales.'
                            : 'No se encontraron vehículos'}
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
                            <VehicleOptimizationBadges
                              usedInLastOptimization={v.usedInLastOptimization}
                              compact
                            />
                          </div>
                        </div>
                      </td>
                      <td class="px-4 py-3 text-sm font-medium text-text-primary dark:text-white">{v.plate}</td>
                      <td class="px-4 py-3">
                        <StatusBadge status={v.status as VehicleStatus} />
                      </td>
                      <td class="px-4 py-3 text-sm text-text-secondary">{v.driver}</td>
                      <td class="px-4 py-3">
                        <MetricBar
                          value={v.fuelPct}
                          color={v.fuelPct === null ? 'amber' : fuelBarColor(v.fuelPct)}
                        />
                      </td>
                      <td class="px-4 py-3 text-sm font-semibold text-text-primary dark:text-white">
                        {formatCapacityKg(v.maxCapacityKg ?? Math.round(v.capacityM3 * 1000))}
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
                          <Show when={canManage()}>
                            <button
                              type="button"
                              class="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text-secondary"
                              aria-label="Editar"
                              onClick={() => setEditingVehicle(v)}
                            >
                              <Pencil size={16} />
                            </button>
                          </Show>
                          <Show when={canManage()}>
                            <VehicleActionsMenu
                              vehicle={v}
                              disabled={statusUpdating()}
                              onSetMaintenance={handleSetMaintenance}
                              onSetAvailable={handleSetAvailable}
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
                      <VehicleOptimizationBadges usedInLastOptimization={v().usedInLastOptimization} />
                    </div>
                  </div>

                  <div class="mb-4 grid grid-cols-2 border-b border-border dark:border-dark-border">
                    <For each={[...implementedDetailTabs]}>
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
                      <DetailRow icon={<Gauge size={16} />} label="Capacidad máxima" value={formatCapacityKg(v().maxCapacityKg ?? Math.round(v().capacityM3 * 1000))} />
                      <DetailRow icon={<Gauge size={16} />} label="Volumen útil" value={`${v().capacityM3} m³`} />
                      <li class="flex gap-3">
                        <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-text-muted dark:bg-dark-surface-hover">
                          <Fuel size={16} />
                        </span>
                        <div class="min-w-0 flex-1">
                          <p class="text-xs text-text-muted">Combustible</p>
                          <Show
                            when={v().fuelPct !== null}
                            fallback={<p class="text-sm font-medium text-text-muted">Sin dato de telemetría</p>}
                          >
                            <p class="text-sm font-semibold text-text-primary dark:text-white">
                              {v().fuelPct}%
                              <Show when={v().fuelLiters}>
                                <span class="font-medium text-text-muted"> ({v().fuelLiters} L)</span>
                              </Show>
                            </p>
                            <ProgressBar
                              value={v().fuelPct!}
                              color={fuelBarColor(v().fuelPct!)}
                              size="sm"
                              class="mt-1.5"
                            />
                          </Show>
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
                      <DetailRow
                        icon={<Users size={16} />}
                        label="Dotación ideal"
                        value={`${v().idealOperatorsCount ?? 6} (1 conductor + ${(v().idealOperatorsCount ?? 6) - 1} operarios)`}
                      />
                      <DetailRow
                        icon={<Users size={16} />}
                        label="Operarios asignados hoy"
                        value={formatCrewAssignmentLabel(v())}
                      />
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

                  <Show when={detailTab() === 'maintenance'}>
                    <VehicleMaintenancePanel
                      incidents={vehicleIncidents() ?? []}
                      loading={vehicleIncidents.loading}
                      error={vehicleIncidents.error}
                    />
                  </Show>
                </div>

                <div class="space-y-2 border-t border-border p-4 dark:border-dark-border">
                  <Show when={canManage()}>
                    <div class="flex flex-wrap gap-2">
                      <Show when={v().status === 'disponible' || v().status === 'en-ruta'}>
                        <Button
                          variant="outline"
                          class="flex-1"
                          icon={<Wrench size={16} />}
                          disabled={statusUpdating()}
                          onClick={() => void handleSetMaintenance(v())}
                        >
                          Mantenimiento
                        </Button>
                      </Show>
                      <Show when={v().status === 'mantenimiento'}>
                        <Button
                          variant="outline"
                          class="flex-1"
                          icon={<Truck size={16} />}
                          disabled={statusUpdating()}
                          onClick={() => void handleSetAvailable(v())}
                        >
                          Disponible
                        </Button>
                      </Show>
                    </div>
                  </Show>
                  <A href={buildVehicleMapHref(v().id)} class="block">
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
