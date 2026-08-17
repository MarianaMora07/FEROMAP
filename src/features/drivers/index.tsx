import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { Pencil, Plus, Search, UserCheck, UserX } from 'lucide-solid';
import { A } from '@solidjs/router';
import { Badge, Button, Card } from '../../design-system/components';
import {
  createDriver,
  driverDisplayName,
  fetchDrivers,
  updateDriver,
  type Driver,
  type DriverCreate,
} from '../../core/api/drivers';
import { canManageVehicles } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { DriverFormModal } from './DriverFormModal';

export default function DriversPage() {
  const [drivers, setDrivers] = createSignal<Driver[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [query, setQuery] = createSignal('');
  const [modalOpen, setModalOpen] = createSignal(false);
  const [modalMode, setModalMode] = createSignal<'create' | 'edit'>('create');
  const [editingDriver, setEditingDriver] = createSignal<Driver | null>(null);
  const [submitting, setSubmitting] = createSignal(false);
  const [alertMsg, setAlertMsg] = createSignal('');
  const [alertType, setAlertType] = createSignal<'error' | 'success'>('error');

  const canManage = () => canManageVehicles(authUser()?.role);

  const filtered = createMemo(() => {
    const q = query().toLowerCase().trim();
    if (!q) return drivers();
    return drivers().filter(
      (d) =>
        d.firstName.toLowerCase().includes(q) ||
        d.lastName.toLowerCase().includes(q) ||
        d.document.toLowerCase().includes(q) ||
        (d.email ?? '').toLowerCase().includes(q) ||
        (d.phone ?? '').toLowerCase().includes(q),
    );
  });

  const load = () =>
    fetchDrivers()
      .then(setDrivers)
      .finally(() => setLoading(false));

  onMount(() => void load());

  const openCreate = () => {
    setModalMode('create');
    setEditingDriver(null);
    setModalOpen(true);
  };

  const openEdit = (d: Driver) => {
    setModalMode('edit');
    setEditingDriver(d);
    setModalOpen(true);
  };

  const showAlert = (type: 'error' | 'success', msg: string) => {
    setAlertType(type);
    setAlertMsg(msg);
    setTimeout(() => setAlertMsg(''), 5000);
  };

  const handleSubmit = async (values: DriverCreate) => {
    setSubmitting(true);
    try {
      if (modalMode() === 'create') {
        await createDriver(values);
        showAlert('success', 'Conductor creado correctamente');
      } else if (editingDriver()) {
        await updateDriver(editingDriver()!.id, {
          document: values.document,
          firstName: values.firstName,
          lastName: values.lastName,
          phone: values.phone || null,
        });
        showAlert('success', 'Conductor actualizado correctamente');
      }
      setModalOpen(false);
      await load();
    } catch (err: any) {
      const msg = err?.message ?? 'Error al guardar el conductor';
      showAlert('error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div class="space-y-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="font-heading text-2xl font-bold text-text-primary dark:text-white">Conductores</h1>
          <p class="mt-1 text-sm text-text-muted">
            Gestión de conductores independiente de la flota. Asigna conductores desde aquí o en cada vehículo.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <A href="/vehicles">
            <Button type="button" size="sm" variant="outline">
              Ver vehículos
            </Button>
          </A>
          <Show when={canManage()}>
            <Button type="button" size="sm" variant="primary" icon={<Plus size={14} />} onClick={openCreate}>
              Nuevo conductor
            </Button>
          </Show>
        </div>
      </div>

      <Show when={alertMsg()}>
        <div
          class={`rounded-lg border px-4 py-3 text-sm ${
            alertType() === 'error'
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'
              : 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300'
          }`}
        >
          {alertMsg()}
        </div>
      </Show>

      <div class="relative">
        <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          placeholder="Buscar por nombre, documento, correo o teléfono..."
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          class="w-full rounded-lg border border-border bg-white py-2.5 pl-9 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-fero-blue focus:outline-none focus:ring-1 focus:ring-fero-blue dark:border-dark-border dark:bg-dark-surface dark:text-white"
        />
      </div>

      <Show when={loading()}>
        <p class="text-sm text-text-muted">Cargando conductores...</p>
      </Show>

      <div class="overflow-x-auto rounded-xl border border-border dark:border-dark-border">
        <table class="w-full min-w-160 text-sm">
          <thead>
            <tr class="border-b border-border bg-slate-50/80 text-left text-[10px] uppercase tracking-wide text-text-muted dark:border-dark-border dark:bg-dark-surface-hover">
              <th class="px-3 py-2.5">Conductor</th>
              <th class="px-3 py-2.5">Documento</th>
              <th class="px-3 py-2.5">Teléfono</th>
              <th class="px-3 py-2.5">Vehículos</th>
              <th class="px-3 py-2.5">Estado</th>
              <th class="px-3 py-2.5">Acciones</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border dark:divide-dark-border">
            <For each={filtered()}>
              {(driver) => (
                <tr>
                  <td class="px-3 py-2.5">
                    <p class="font-medium text-text-primary dark:text-white">{driverDisplayName(driver)}</p>
                    <p class="text-xs text-text-muted">{driver.email ?? '—'}</p>
                  </td>
                  <td class="px-3 py-2.5 text-text-secondary">{driver.document}</td>
                  <td class="px-3 py-2.5 text-text-secondary">{driver.phone ?? '—'}</td>
                  <td class="px-3 py-2.5 text-text-secondary">{driver.assignedVehicles}</td>
                  <td class="px-3 py-2.5">
                    <Badge variant={driver.active ? 'success' : 'default'} dot>
                      {driver.active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td class="px-3 py-2.5">
                    <Show when={canManage()}>
                      <div class="flex gap-1">
                        <button
                          type="button"
                          class="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-fero-blue"
                          aria-label="Editar"
                          onClick={() => openEdit(driver)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          class="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover"
                          aria-label={driver.active ? 'Desactivar' : 'Activar'}
                          onClick={async () => {
                            try {
                              await updateDriver(driver.id, { active: !driver.active });
                              await load();
                            } catch (err: any) {
                              showAlert('error', err?.message ?? 'Error al actualizar estado');
                            }
                          }}
                        >
                          {driver.active ? <UserX size={14} /> : <UserCheck size={14} />}
                        </button>
                      </div>
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      <Show when={!loading() && filtered().length === 0}>
        <p class="text-sm text-text-muted text-center py-8">
          {query() ? 'No se encontraron conductores con ese criterio de búsqueda.' : 'No hay conductores registrados.'}
        </p>
      </Show>

      <DriverFormModal
        open={modalOpen()}
        mode={modalMode()}
        initial={editingDriver()}
        submitting={submitting()}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
