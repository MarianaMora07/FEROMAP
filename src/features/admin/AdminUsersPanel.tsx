import { For, Show, createSignal, onMount } from 'solid-js';
import { Pencil, Plus, UserCheck, UserX } from 'lucide-solid';
import { Badge, Button, Card, SelectField, TextField } from '../../design-system/components';
import {
  createAdminUser,
  fetchAdminRoles,
  fetchAdminUsers,
  updateAdminUser,
  type AdminUser,
  type AdminUserCreate,
} from '../../core/api/admin';
import type { UserRole } from '../../core/types/auth';

export function AdminUsersPanel(props: { onFlash: (message: string) => void }) {
  const [users, setUsers] = createSignal<AdminUser[]>([]);
  const [roles, setRoles] = createSignal<{ id: UserRole; label: string }[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [editingId, setEditingId] = createSignal<number | null>(null);
  const [creating, setCreating] = createSignal(false);
  const [form, setForm] = createSignal({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
    role: 'planificador' as UserRole,
    active: true,
  });

  const load = () =>
    Promise.all([fetchAdminUsers(), fetchAdminRoles()])
      .then(([userRows, roleRows]) => {
        setUsers(userRows);
        setRoles(roleRows.map((r) => ({ id: r.id, label: r.label })));
      })
      .finally(() => setLoading(false));

  onMount(() => {
    void load();
  });

  const resetForm = () => {
    setForm({
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      phone: '',
      role: 'planificador',
      active: true,
    });
    setEditingId(null);
    setCreating(false);
  };

  const startEdit = (user: AdminUser) => {
    setCreating(false);
    setEditingId(user.id);
    setForm({
      email: user.email,
      password: '',
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone ?? '',
      role: user.role,
      active: user.active,
    });
  };

  const save = async () => {
    const data = form();
    try {
      if (creating()) {
        const payload: AdminUserCreate = {
          email: data.email,
          password: data.password,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone || null,
          role: data.role,
          active: data.active,
        };
        await createAdminUser(payload);
        props.onFlash('Usuario creado.');
      } else if (editingId() !== null) {
        await updateAdminUser(editingId()!, {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone || null,
          role: data.role,
          active: data.active,
          password: data.password || undefined,
        });
        props.onFlash('Usuario actualizado.');
      }
      resetForm();
      await load();
    } catch {
      props.onFlash('No se pudo guardar el usuario.');
    }
  };

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="font-heading text-base font-semibold text-text-primary dark:text-white">
            Usuarios y roles
          </h3>
          <p class="text-sm text-text-muted">Alta, edición y activación de cuentas.</p>
        </div>
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
          Nuevo usuario
        </Button>
      </div>

      <Show when={creating() || editingId() !== null}>
        <Card class="space-y-3 p-4">
          <p class="text-sm font-semibold text-text-primary dark:text-white">
            {creating() ? 'Crear usuario' : 'Editar usuario'}
          </p>
          <div class="grid gap-3 sm:grid-cols-2">
            <Show when={creating()}>
              <TextField
                label="Correo"
                type="email"
                value={form().email}
                onInput={(e) => setForm((f) => ({ ...f, email: e.currentTarget.value }))}
              />
            </Show>
            <TextField
              label={creating() ? 'Contraseña' : 'Nueva contraseña (opcional)'}
              type="password"
              value={form().password}
              onInput={(e) => setForm((f) => ({ ...f, password: e.currentTarget.value }))}
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
            <SelectField
              label="Rol"
              value={form().role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.currentTarget.value as UserRole }))}
            >
              <For each={roles()}>{(r) => <option value={r.id}>{r.label}</option>}</For>
            </SelectField>
          </div>
          <label class="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={form().active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.currentTarget.checked }))}
            />
            Cuenta activa
          </label>
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
        <p class="text-sm text-text-muted">Cargando usuarios...</p>
      </Show>

      <div class="overflow-x-auto rounded-xl border border-border dark:border-dark-border">
        <table class="w-full min-w-160 text-sm">
          <thead>
            <tr class="border-b border-border bg-slate-50/80 text-left text-[10px] uppercase tracking-wide text-text-muted dark:border-dark-border dark:bg-dark-surface-hover">
              <th class="px-3 py-2.5">Usuario</th>
              <th class="px-3 py-2.5">Rol</th>
              <th class="px-3 py-2.5">Estado</th>
              <th class="px-3 py-2.5">Último acceso</th>
              <th class="px-3 py-2.5">Acciones</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border dark:divide-dark-border">
            <For each={users()}>
              {(user) => (
                <tr>
                  <td class="px-3 py-2.5">
                    <p class="font-medium text-text-primary dark:text-white">
                      {user.firstName} {user.lastName}
                    </p>
                    <p class="text-xs text-text-muted">{user.email}</p>
                  </td>
                  <td class="px-3 py-2.5 text-text-secondary">{user.roleLabel}</td>
                  <td class="px-3 py-2.5">
                    <Badge variant={user.active ? 'success' : 'default'} dot>
                      {user.active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td class="px-3 py-2.5 text-xs text-text-muted">
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleString('es-VE')
                      : '—'}
                  </td>
                  <td class="px-3 py-2.5">
                    <div class="flex gap-1">
                      <button
                        type="button"
                        class="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-fero-blue"
                        aria-label="Editar"
                        onClick={() => startEdit(user)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        class="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover"
                        aria-label={user.active ? 'Desactivar' : 'Activar'}
                        onClick={() =>
                          void updateAdminUser(user.id, { active: !user.active })
                            .then(() => load())
                            .then(() => props.onFlash(user.active ? 'Usuario desactivado.' : 'Usuario activado.'))
                        }
                      >
                        {user.active ? <UserX size={14} /> : <UserCheck size={14} />}
                      </button>
                    </div>
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
