import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { Save } from 'lucide-solid';
import { Button } from '../../design-system/components';
import type { Vehicle } from '../../data/mock/vehicles';
import {
  fetchSectorTerritories,
  setDriverTerritory,
  type SectorTerritoryRow,
} from '../../core/api/territories';

interface VehicleTerritoryPanelProps {
  vehicle: Vehicle;
  editable: boolean;
}

export function VehicleTerritoryPanel(props: VehicleTerritoryPanelProps) {
  const driverId = () => props.vehicle.defaultDriverId ?? null;
  const [rows, setRows] = createSignal<SectorTerritoryRow[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [selected, setSelected] = createSignal<Set<number>>(new Set());
  const [query, setQuery] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [savedNotice, setSavedNotice] = createSignal('');
  const [error, setError] = createSignal<string | null>(null);

  createEffect(() => {
    const id = driverId();
    setRows([]);
    setSelected(new Set<number>());
    setSavedNotice('');
    setError(null);
    if (id == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    void fetchSectorTerritories()
      .then((allRows) => {
        if (cancelled) return;
        setRows(allRows);
        const mine = new Set<number>(
          allRows.filter((sector) => sector.driverId === id).map((sector) => sector.sectorId),
        );
        setSelected(mine);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los sectores');
        setLoading(false);
      });
    onCleanup(() => {
      cancelled = true;
    });
  });

  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase();
    const all = rows();
    if (!q) return all;
    return all.filter((sector) => sector.name.toLowerCase().includes(q));
  });

  const selectedCount = () => selected().size;

  const toggle = (sectorId: number) => {
    setSavedNotice('');
    setError(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(sectorId)) {
        next.delete(sectorId);
      } else {
        next.add(sectorId);
      }
      return next;
    });
  };

  const save = async () => {
    const id = driverId();
    if (id == null) return;
    setSaving(true);
    setError(null);
    setSavedNotice('');
    try {
      const result = await setDriverTerritory(id, Array.from(selected()));
      setSavedNotice(
        result.count > 0
          ? `Territorio guardado: ${result.count} sector(es) preferente(s) para este camión.`
          : 'Territorio liberado: el camión usará lo que el ACO decida cada día.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el territorio');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="space-y-3" data-testid="vehicle-territory-panel">
      <div class="rounded-lg border border-border bg-surface/50 px-3 py-2 dark:border-dark-border">
        <p class="text-sm font-semibold text-text-primary dark:text-white">
          Territorio fijo del camión
        </p>
        <p class="mt-1 text-xs text-text-muted">
          Al marcar sectores, este camión (vía su conductor: {props.vehicle.driver || '—'}) los
          atiende de forma preferente cuando el día tiene territorio completo. Si el día se arma por
          zonas o hay sectores sin conductor asignado, el ACO reparte libre entre la flota.
        </p>
      </div>

      <Show
        when={driverId() != null}
        fallback={
          <p class="rounded-lg border border-amber-300/60 bg-amber-50/80 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-200">
            Este vehículo no tiene conductor asignado. Asigna uno en «Editar» para poder fijarle
            sectores de preferencia.
          </p>
        }
      >
        <input
          type="search"
          value={query()}
          placeholder="Buscar sector…"
          onInput={(event) => setQuery(event.currentTarget.value)}
          class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-fero-green dark:border-dark-border dark:bg-dark-surface"
        />

        <Show when={loading()}>
          <p class="text-sm text-text-muted">Cargando sectores…</p>
        </Show>
        <Show when={!loading() && rows().length === 0 && !error()}>
          <p class="text-sm text-text-muted">No hay sectores cargados.</p>
        </Show>

        <ul class="max-h-80 space-y-1.5 overflow-y-auto pr-1">
          <For each={filtered()}>
            {(sector) => {
              const checked = () => selected().has(sector.sectorId);
              const ownerIsVehicle = () => sector.driverId != null && sector.driverId === driverId();
              const otherOwner = () =>
                sector.driverId != null && sector.driverId !== driverId()
                  ? (sector.driverName ?? 'otro conductor')
                  : null;
              return (
                <li
                  class={`flex items-start gap-2 rounded-md border px-2 py-1.5 ${
                    checked()
                      ? 'border-fero-green/40 bg-fero-green/10'
                      : 'border-border bg-surface/40 dark:border-dark-border'
                  }`}
                >
                  <input
                    type="checkbox"
                    class="mt-1"
                    checked={checked()}
                    onChange={() => toggle(sector.sectorId)}
                    aria-label={`Sector ${sector.name}`}
                  />
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-text-primary dark:text-white">{sector.name}</p>
                    <p class="text-[11px] text-text-muted">
                      {sector.pointCount} contenedor(es)
                      <Show when={checked() && ownerIsVehicle()}>
                        <span class="text-fero-green-dark dark:text-fero-green"> · preferente</span>
                      </Show>
                      <Show when={otherOwner()}>
                        <span class="text-amber-700 dark:text-amber-300"> · hoy: {otherOwner()}</span>
                      </Show>
                    </p>
                  </div>
                </li>
              );
            }}
          </For>
        </ul>

        <Show when={error()}>
          <p class="text-xs font-medium text-red-600 dark:text-red-300">{error()}</p>
        </Show>

        <Show when={props.editable}>
          <div class="flex flex-wrap gap-2 pt-1">
            <Button variant="primary" size="sm" class="gap-2" loading={saving()} onClick={() => void save()}>
              <Save size={14} /> Guardar territorio ({selectedCount()})
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedCount() === 0}
              onClick={() => {
                setSavedNotice('');
                setError(null);
                setSelected(new Set<number>());
              }}
            >
              Limpiar selección
            </Button>
          </div>
        </Show>

        <Show when={savedNotice()}>
          <p class="text-xs font-medium text-fero-green-dark dark:text-fero-green-mid">{savedNotice()}</p>
        </Show>
      </Show>
    </div>
  );
}
