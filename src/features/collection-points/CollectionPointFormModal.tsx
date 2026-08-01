import { For, Show, createEffect, createSignal } from 'solid-js';
import { Button, Modal, SelectField, TextField } from '../../design-system/components';
import type { CollectionPointDetail } from '../../core/api/collectionPoints';
import type { SectorOption } from '../../core/api/collectionPoints';
import { UNARE_CENTER } from '../../data/types/geo';

export interface CollectionPointFormValues {
  code: string;
  sectorId: number;
  latitude: number;
  longitude: number;
  maxCapacityKg: number;
  fillLevelPct: number;
  status: 'active' | 'inactive';
}

interface CollectionPointFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: CollectionPointDetail | null;
  sectorOptions: SectorOption[];
  draftCoords?: { lat: number; lng: number } | null;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (values: CollectionPointFormValues) => void | Promise<void>;
}

function defaultValues(
  sectorOptions: SectorOption[],
  draftCoords?: { lat: number; lng: number } | null,
): CollectionPointFormValues {
  const defaultSector = sectorOptions[0]?.id ?? 1;
  return {
    code: '',
    sectorId: defaultSector,
    latitude: draftCoords?.lat ?? UNARE_CENTER[1],
    longitude: draftCoords?.lng ?? UNARE_CENTER[0],
    maxCapacityKg: 1100,
    fillLevelPct: 0,
    status: 'active',
  };
}

function valuesFromDetail(detail: CollectionPointDetail): CollectionPointFormValues {
  const capacity = detail.capacityKg || 1;
  return {
    code: detail.code,
    sectorId: detail.sectorId,
    latitude: detail.latitude,
    longitude: detail.longitude,
    maxCapacityKg: detail.capacityKg,
    fillLevelPct: detail.fillLevel,
    status: detail.active ? 'active' : 'inactive',
  };
}

export function CollectionPointFormModal(props: CollectionPointFormModalProps) {
  const [form, setForm] = createSignal<CollectionPointFormValues>(
    defaultValues(props.sectorOptions, props.draftCoords),
  );
  const [error, setError] = createSignal('');

  createEffect(() => {
    if (!props.open) return;
    setError('');
    if (props.mode === 'edit' && props.initial) {
      setForm(valuesFromDetail(props.initial));
      return;
    }
    setForm(defaultValues(props.sectorOptions, props.draftCoords));
  });

  const patch = (partial: Partial<CollectionPointFormValues>) => {
    setForm((current) => ({ ...current, ...partial }));
  };

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    const values = form();
    if (props.mode === 'create' && !values.code.trim()) {
      setError('El código del punto es obligatorio');
      return;
    }
    if (values.maxCapacityKg <= 0) {
      setError('La capacidad debe ser mayor que cero');
      return;
    }
    if (values.fillLevelPct < 0 || values.fillLevelPct > 100) {
      setError('El nivel de llenado debe estar entre 0 y 100 %');
      return;
    }
    setError('');
    await props.onSubmit(values);
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.mode === 'create' ? 'Nuevo punto de recolección' : 'Editar punto'}
      size="lg"
    >
      <form class="space-y-4" onSubmit={handleSubmit}>
        <div class="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Código"
            name="code"
            value={form().code}
            disabled={props.mode === 'edit' || props.submitting}
            placeholder="CNT-099"
            onInput={(e) => patch({ code: e.currentTarget.value.toUpperCase() })}
            required={props.mode === 'create'}
          />
          <SelectField
            label="Sector"
            name="sectorId"
            value={String(form().sectorId)}
            disabled={props.submitting}
            onChange={(e) => patch({ sectorId: Number(e.currentTarget.value) })}
          >
            <For each={props.sectorOptions}>
              {(sector) => <option value={sector.id}>{sector.name}</option>}
            </For>
          </SelectField>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Latitud"
            name="latitude"
            type="number"
            step="any"
            value={String(form().latitude)}
            disabled={props.submitting}
            onInput={(e) => patch({ latitude: Number(e.currentTarget.value) })}
            required
          />
          <TextField
            label="Longitud"
            name="longitude"
            type="number"
            step="any"
            value={String(form().longitude)}
            disabled={props.submitting}
            onInput={(e) => patch({ longitude: Number(e.currentTarget.value) })}
            required
          />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Capacidad máxima (kg)"
            name="maxCapacityKg"
            type="number"
            min="1"
            step="1"
            value={String(form().maxCapacityKg)}
            disabled={props.submitting}
            onInput={(e) => patch({ maxCapacityKg: Number(e.currentTarget.value) })}
            required
          />
          <TextField
            label="Nivel de llenado (%)"
            name="fillLevelPct"
            type="number"
            min="0"
            max="100"
            step="1"
            value={String(form().fillLevelPct)}
            disabled={props.submitting}
            onInput={(e) => patch({ fillLevelPct: Number(e.currentTarget.value) })}
            required
          />
        </div>

        <SelectField
          label="Estado operativo"
          name="status"
          value={form().status}
          disabled={props.submitting}
          onChange={(e) => patch({ status: e.currentTarget.value as 'active' | 'inactive' })}
        >
          <option value="active">Activo</option>
          <option value="inactive">Fuera de servicio</option>
        </SelectField>

        <Show when={props.mode === 'create' && props.draftCoords}>
          <p class="rounded-md border border-fero-blue/30 bg-fero-blue/5 px-3 py-2 text-xs text-text-secondary">
            Coordenadas tomadas del mapa. Puedes ajustarlas antes de guardar.
          </p>
        </Show>

        <Show when={error()}>
          <p class="text-sm text-red-600">{error()}</p>
        </Show>

        <div class="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={props.onClose} disabled={props.submitting}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={props.submitting}>
            {props.submitting ? 'Guardando...' : props.mode === 'create' ? 'Crear punto' : 'Guardar cambios'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
