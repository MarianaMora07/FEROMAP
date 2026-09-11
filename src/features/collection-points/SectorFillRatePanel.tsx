import { For, Show, createResource, createSignal } from 'solid-js';
import { Card, CardHeader } from '../../design-system/components';
import {
  fetchSectorFillRateFactors,
  updateSectorFillRateFactor,
  type SectorOption,
} from '../../core/api/collectionPoints';
import { useMocks } from '../../core/api/client';

/**
 * Editor compacto del factor de velocidad de llenado por zona (> 1 = más rápido).
 * Ver docs/fase-0/adr-criticidad.md (D4).
 */
export function SectorFillRatePanel() {
  const [sectors, { mutate }] = createResource(fetchSectorFillRateFactors);
  const [savingId, setSavingId] = createSignal<number | null>(null);
  const [error, setError] = createSignal('');

  const applyLocal = (updated: SectorOption) => {
    mutate((current) =>
      (current ?? []).map((item) =>
        item.id === updated.id ? { ...item, fillRateFactor: updated.fillRateFactor } : item,
      ),
    );
  };

  const save = async (sector: SectorOption, value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
      setError('El factor debe ser mayor que 0');
      return;
    }
    setError('');
    if (useMocks) {
      applyLocal({ ...sector, fillRateFactor: value });
      return;
    }
    setSavingId(sector.id);
    try {
      const updated = await updateSectorFillRateFactor(sector.id, value);
      applyLocal(updated);
    } catch {
      setError('No se pudo guardar el factor de la zona');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Velocidad de llenado por zona"
        subtitle="Qué tan rápido se llenan los contenedores de cada sector (> 1 = más rápido)."
      />
      <Show when={error()}>
        <p class="mb-2 text-sm text-red-600">{error()}</p>
      </Show>
      <Show
        when={!sectors.loading}
        fallback={<p class="text-sm text-text-secondary">Cargando sectores…</p>}
      >
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <For each={sectors() ?? []}>
            {(sector) => (
              <label class="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 dark:border-dark-border">
                <span class="truncate text-sm text-text-secondary" title={sector.name}>
                  {sector.name}
                </span>
                <input
                  type="number"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={String(sector.fillRateFactor ?? 1)}
                  disabled={savingId() === sector.id}
                  aria-label={`Factor de llenado de ${sector.name}`}
                  class="w-20 rounded-md border border-border bg-surface px-2 py-1 text-sm dark:bg-dark-surface-hover dark:border-dark-border"
                  onChange={(e) => void save(sector, Number(e.currentTarget.value))}
                />
              </label>
            )}
          </For>
        </div>
      </Show>
    </Card>
  );
}
