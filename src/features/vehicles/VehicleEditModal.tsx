import { For, Show, createEffect, createSignal, onMount } from 'solid-js';
import { X } from 'lucide-solid';
import { Button, SelectField } from '../../design-system/components';
import { driverDisplayName, fetchDrivers, type Driver } from '../../core/api/drivers';
import { updateVehicle, type VehicleStatusUpdate } from '../../core/api/vehicles';
import type { Vehicle } from '../../core/types/vehicle';

export function VehicleEditModal(props: {
  vehicle: (Vehicle & { maxCapacityKg?: number; defaultDriverId?: number | null }) | null;
  open: boolean;
  onClose: () => void;
  onSaved: (vehicle: Vehicle & { maxCapacityKg: number }) => void;
  onError: (message: string) => void;
}) {
  const [drivers, setDrivers] = createSignal<Driver[]>([]);
  const [driverId, setDriverId] = createSignal<string>('');
  const [status, setStatus] = createSignal<VehicleStatusUpdate>('available');
  const [saving, setSaving] = createSignal(false);

  onMount(() => {
    void fetchDrivers().then(setDrivers);
  });

  createEffect(() => {
    const vehicle = props.vehicle;
    if (!props.open || !vehicle) return;
    setDriverId(vehicle.defaultDriverId != null ? String(vehicle.defaultDriverId) : '');
    if (vehicle.status === 'mantenimiento') {
      setStatus('maintenance');
    } else {
      setStatus('available');
    }
  });

  const save = async () => {
    const vehicle = props.vehicle;
    if (!vehicle) return;
    setSaving(true);
    try {
      const payload: { defaultDriverId: number | null; status?: VehicleStatusUpdate } = {
        defaultDriverId: driverId() ? Number(driverId()) : null,
      };
      if (vehicle.status === 'disponible' || vehicle.status === 'mantenimiento') {
        payload.status = status();
      }
      const updated = await updateVehicle(vehicle.id, payload);
      props.onSaved(updated);
      props.onClose();
    } catch {
      props.onError('No se pudo guardar el vehículo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Show when={props.open && props.vehicle}>
      {(vehicle) => (
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/40" onClick={props.onClose} />
          <div class="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl dark:border-dark-border dark:bg-dark-surface">
            <div class="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 class="font-heading text-lg font-semibold text-text-primary dark:text-white">
                  Editar vehículo
                </h2>
                <p class="text-sm text-text-muted">{vehicle().id} · {vehicle().plate}</p>
              </div>
              <button
                type="button"
                class="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover"
                onClick={props.onClose}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div class="space-y-4">
              <SelectField
                label="Conductor asignado"
                value={driverId()}
                onChange={(e) => setDriverId(e.currentTarget.value)}
              >
                <option value="">Sin conductor</option>
                <For each={drivers().filter((d) => d.active)}>
                  {(driver) => (
                    <option value={String(driver.id)}>
                      {driverDisplayName(driver)}
                      {driver.assignedVehicles > 0 ? ` (${driver.assignedVehicles} veh.)` : ''}
                    </option>
                  )}
                </For>
              </SelectField>

              <Show when={vehicle().status === 'disponible' || vehicle().status === 'mantenimiento'}>
                <SelectField
                  label="Estado operativo"
                  value={status()}
                  onChange={(e) => setStatus(e.currentTarget.value as VehicleStatusUpdate)}
                >
                  <option value="available">Disponible</option>
                  <option value="maintenance">Mantenimiento</option>
                </SelectField>
              </Show>
            </div>

            <div class="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={props.onClose}>
                Cancelar
              </Button>
              <Button type="button" variant="primary" size="sm" loading={saving()} onClick={() => void save()}>
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}
