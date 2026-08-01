import { For, Show, createSignal, onMount } from 'solid-js';
import { Pencil, Plus, UserCheck, UserX } from 'lucide-solid';
import { A } from '@solidjs/router';
import { Badge, Button, Card, SelectField, TextField } from '../../design-system/components';
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

export default function DriversPage() {
  const [drivers, setDrivers] = createSignal<Driver[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [editingId, setEditingId] = createSignal<number | null>(null);
  const [creating, setCreating] = createSignal(false);
  const [form, setForm] = createSignal({
    email: '',
    password: '',
    document: '',
    firstName: '',
    lastName: '',
    phone: '',
    active: true,
  });

  const canManage = () => canManageVehicles(authUser()?.role);

  const load = () =>
    fetchDrivers()
      .then(setDrivers)
      .finally(() => setLoading(false));

  onMount(() => {
    void load();
  });

  const resetForm = () => {
    setForm({
      email: '',
      password: '',
      document: '',
      firstName: '',
      lastName: '',
      phone: '',
      active: true,
    });
    setEditingId(null);
    setCreating(false);
  };

  const startEdit = (driver: Driver) => {
    setCreating(false);
    setEditingId(driver.id);
    setForm({
      email: driver.email ?? '',
      password: '',
      document: driver.document,
      firstName: driver.firstName,
      lastName: driver.lastName,
      phone: driver.phone ?? '',
      active: driver.active,
    });
  };

  const save = async () => {
    const data = form();
    try {
      if (creating()) {
        const payload: DriverCreate = {
          email: data.email,
          password: data.password,
          document: data.document,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone || null,
        };
        await createDriver(payload);
      } else if (editingId() !== null) {
        await updateDriver(editingId()!, {
          document: data.document,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone || null,
          active: data.active,
        });
      }
      resetForm();
      await load();
    } catch {
      // caller could add toast later
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
            <Button
              type="button"
              size="sm"
              variant="primary"
              icon={<Plus size={14} />}
              onClick={() => {
                resetForm();
                setCreating(true);
              }}
            >
              Nuevo conductor
            </Button>
          </Show>
        </div>
      </div>

      <Show when={creating() || editingId() !== null}>
        <Card class="space-y-3 p-4">
          <p class="text-sm font-semibold text-text-primary dark:text-white">
            {creating() ? 'Registrar conductor' : 'Editar conductor'}
          </p>
          <div class="grid gap-3 sm:grid-cols-2">
            <Show when={creating()}>
              <TextField
                label="Correo"
                type="email"
                value={form().email}
                onInput={(e) => setForm((f) => ({ ...f, email: e.currentTarget.value }))}
              />
              <TextField
                label="Contraseña"
                type="password"
                value={form().password}
                onInput={(e) => setForm((f) => ({ ...f, password: e.currentTarget.value }))}
              />
            </Show>
            <TextField
              label="Documento"
              value={form().document}
              onInput={(e) => setForm((f) => ({ ...f, document: e.currentTarget.value }))}
            />
            <TextField
              label="Nombre"
              value={form().firstName}
              onInput={(e) => setForm((f) => ({ ...f, firstName: e.currentTarget.value }))}
            />
            <TextField
              label="Apellido"
              value={form().lastName}
              onInput={(e) => setForm((f) => ({ ...f, lastName: e.currentTarget.value }))}
            />
            <TextField
              label="Teléfono"
              value={form().phone}
              onInput={(e) => setForm((f) => ({ ...f, phone: e.currentTarget.value }))}
            />
          </div>
          <Show when={!creating()}>
            <label class="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={form().active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.currentTarget.checked }))}
              />
              Conductor activo
            </label>
          </Show>
          <div class="flex gap-2">
            <Button type="button" size="sm" variant="primary" onClick={() => void save()}>
              Guardar
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={resetForm}>
              Cancelar
            </Button>
          </div>
        </Card>
      </Show>

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
            <For each={drivers()}>
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
                          onClick={() => startEdit(driver)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          class="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover"
                          aria-label={driver.active ? 'Desactivar' : 'Activar'}
                          onClick={() =>
                            void updateDriver(driver.id, { active: !driver.active }).then(() => load())
                          }
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
    </div>
  );
}
