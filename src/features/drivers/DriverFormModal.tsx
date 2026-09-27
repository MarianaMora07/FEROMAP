import { createEffect, createSignal, Show } from 'solid-js';
import { Button, Modal, TextField } from '../../design-system/components';
import type { Driver, DriverCreate } from '../../core/api/drivers';

interface DriverFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: Driver | null;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (values: DriverCreate) => void | Promise<void>;
}

function defaultForm() {
  return {
    email: '',
    password: '',
    document: '',
    firstName: '',
    lastName: '',
    phone: '',
  };
}

export function DriverFormModal(props: DriverFormModalProps) {
  const [form, setForm] = createSignal(defaultForm());
  const [error, setError] = createSignal('');

  createEffect(() => {
    if (!props.open) return;
    setError('');
    if (props.mode === 'edit' && props.initial) {
      const d = props.initial;
      setForm({
        email: d.email ?? '',
        password: '',
        document: d.document,
        firstName: d.firstName,
        lastName: d.lastName,
        phone: d.phone ?? '',
      });
      return;
    }
    setForm(defaultForm());
  });

  const patch = (partial: Partial<ReturnType<typeof form>>) =>
    setForm((f) => ({ ...f, ...partial }));

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const v = form();
    if (props.mode === 'create' && !v.email.trim()) {
      setError('El correo es obligatorio');
      return;
    }
    if (props.mode === 'create' && v.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (!v.document.trim()) {
      setError('El documento es obligatorio');
      return;
    }
    if (!v.firstName.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    if (!v.lastName.trim()) {
      setError('El apellido es obligatorio');
      return;
    }
    setError('');
    await props.onSubmit({
      email: v.email,
      password: v.password,
      document: v.document,
      firstName: v.firstName,
      lastName: v.lastName,
      phone: v.phone || null,
    });
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.mode === 'create' ? 'Nuevo conductor' : 'Editar conductor'}
      size="md"
    >
      <form class="space-y-4" onSubmit={handleSubmit}>
        <Show when={props.mode === 'create'}>
          <div class="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Correo"
              type="email"
              value={form().email}
              disabled={props.submitting}
              onInput={(e) => patch({ email: e.currentTarget.value })}
              required
            />
            <TextField
              label="Contraseña"
              type="password"
              value={form().password}
              disabled={props.submitting}
              onInput={(e) => patch({ password: e.currentTarget.value })}
              required={props.mode === 'create'}
              placeholder={props.mode === 'edit' ? '••••••••' : undefined}
            />
          </div>
        </Show>

        <div class="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Documento"
            value={form().document}
            disabled={props.submitting}
            onInput={(e) => patch({ document: e.currentTarget.value })}
            required
          />
          <TextField
            label="Nombre"
            value={form().firstName}
            disabled={props.submitting}
            onInput={(e) => patch({ firstName: e.currentTarget.value })}
            required
          />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Apellido"
            value={form().lastName}
            disabled={props.submitting}
            onInput={(e) => patch({ lastName: e.currentTarget.value })}
            required
          />
          <TextField
            label="Teléfono"
            value={form().phone}
            disabled={props.submitting}
            onInput={(e) => patch({ phone: e.currentTarget.value })}
          />
        </div>

        <Show when={error()}>
          <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error()}
          </div>
        </Show>

        <div class="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={props.onClose} disabled={props.submitting}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={props.submitting}>
            {props.submitting ? 'Guardando...' : props.mode === 'create' ? 'Crear conductor' : 'Guardar cambios'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
