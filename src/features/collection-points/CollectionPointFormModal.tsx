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
  status: 'active' | 'inactive';
  fillRateFactorOverride: number | null;
  estimatedFillHours: number | null;
  generationRateKgPerDay: number | null;
  servedPopulation: number | null;
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
    status: 'active',
    fillRateFactorOverride: null,
    estimatedFillHours: null,
    generationRateKgPerDay: null,
    servedPopulation: null,
  };
}

function valuesFromDetail(detail: CollectionPointDetail): CollectionPointFormValues {
  return {
    code: detail.code,
    sectorId: detail.sectorId,
    latitude: detail.latitude,
    longitude: detail.longitude,
    maxCapacityKg: detail.capacityKg,
    status: detail.active ? 'active' : 'inactive',
    fillRateFactorOverride: detail.fillRateFactorOverride ?? null,
    estimatedFillHours: detail.estimatedFillHours ?? null,
    generationRateKgPerDay: detail.generationRateOverrideKgPerDay ?? null,
    servedPopulation: detail.servedPopulation ?? null,
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

  const inheritedFactor = () =>
    props.sectorOptions.find((sector) => sector.id === form().sectorId)?.fillRateFactor ?? 1;

  const selectedSector = () =>
    props.sectorOptions.find((sector) => sector.id === form().sectorId);

  /** La zona define una tasa: se reparte equitativamente y el campo por contenedor se bloquea. */
  const zoneManaged = () => selectedSector()?.generationRateKgPerDay != null;

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
        </div>

        <div class="space-y-1">
          <TextField
            label="Factor de llenado (opcional)"
            name="fillRateFactorOverride"
            type="number"
            min="0.1"
            max="10"
            step="0.1"
            value={form().fillRateFactorOverride == null ? '' : String(form().fillRateFactorOverride)}
            disabled={props.submitting}
            placeholder={`Heredar del sector (${inheritedFactor().toFixed(2)}×)`}
            onInput={(e) => {
              const raw = e.currentTarget.value;
              patch({ fillRateFactorOverride: raw === '' ? null : Number(raw) });
            }}
          />
          <p class="text-xs text-text-muted">
            &gt; 1 = se llena más rápido. Vacío hereda el factor de la zona (
            {inheritedFactor().toFixed(2)}×).
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1">
            <TextField
              label="Tasa de generación (kg/día)"
              name="generationRateKgPerDay"
              type="number"
              min="0"
              step="1"
              value={
                form().generationRateKgPerDay == null
                  ? ''
                  : String(form().generationRateKgPerDay)
              }
              disabled={zoneManaged() || props.submitting}
              placeholder={
                zoneManaged()
                  ? `Gestionada por zona (${selectedSector()?.generationRateKgPerDay} kg/día)`
                  : 'Derivar de capacidad y horas'
              }
              onInput={(e) => {
                const raw = e.currentTarget.value;
                patch({ generationRateKgPerDay: raw === '' ? null : Number(raw) });
              }}
            />
            <p class="text-xs text-text-muted">
              {zoneManaged()
                ? 'La zona reparte su tasa equitativamente; se bloquea este valor.'
                : 'Vacío deriva la tasa de la capacidad y las horas de llenado.'}
            </p>
          </div>
          <div class="space-y-1">
            <TextField
              label="Horas base de llenado"
              name="estimatedFillHours"
              type="number"
              min="0.1"
              step="0.1"
              value={form().estimatedFillHours == null ? '' : String(form().estimatedFillHours)}
              disabled={props.submitting}
              placeholder="72"
              onInput={(e) => {
                const raw = e.currentTarget.value;
                patch({ estimatedFillHours: raw === '' ? null : Number(raw) });
              }}
            />
            <p class="text-xs text-text-muted">
              Tiempo hasta llenarse sin factor. Vacío mantiene las 72 h por defecto.
            </p>
          </div>
        </div>

        <div class="space-y-1">
          <TextField
            label="Población servida (opcional)"
            name="servedPopulation"
            type="number"
            min="0"
            step="1"
            value={form().servedPopulation == null ? '' : String(form().servedPopulation)}
            disabled={props.submitting}
            placeholder="Habitantes que sirve este contenedor"
            onInput={(e) => {
              const raw = e.currentTarget.value;
              patch({ servedPopulation: raw === '' ? null : Number(raw) });
            }}
          />
          <p class="text-xs text-text-muted">
            Se usa cuando la zona reparte su tasa por población. Vacío cae a capacidad.
          </p>
        </div>

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
