import { For, Show, createResource, createSignal } from 'solid-js';
import { Button, Card, CardHeader } from '../../design-system/components';
import {
  calibrateCollectionPoints,
  fetchSectorsSummary,
  updateSectorFillRateFactor,
  updateSectorGenerationConfig,
  type DistributionMode,
  type SectorSummary,
} from '../../core/api/collectionPoints';
import { useMocks } from '../../core/api/client';

const DISTRIBUTION_OPTIONS: { value: DistributionMode; label: string }[] = [
  { value: 'equal', label: 'Igual' },
  { value: 'capacity', label: 'Por capacidad' },
  { value: 'population', label: 'Por población' },
];

function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString('es-VE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Gestión por zona: tasa de generación (manual o per cápita), modo de reparto y
 * factor de velocidad de llenado. Calibra las tasas por contenedor con los pesos
 * reales recolectados.
 */
export function SectorFillRatePanel() {
  const [zones, { mutate, refetch }] = createResource(fetchSectorsSummary);
  const [savingId, setSavingId] = createSignal<number | null>(null);
  const [error, setError] = createSignal('');
  const [flash, setFlash] = createSignal('');
  const [calibrating, setCalibrating] = createSignal(false);

  const replaceLocal = (updated: Partial<SectorSummary> & { id: number }) => {
    mutate((current) =>
      (current ?? []).map((zone) => (zone.id === updated.id ? { ...zone, ...updated } : zone)),
    );
  };

  const saveField = async (
    zone: SectorSummary,
    payload: Parameters<typeof updateSectorGenerationConfig>[1],
    patch: Partial<SectorSummary>,
  ) => {
    setError('');
    setFlash('');
    if (useMocks) {
      replaceLocal({ id: zone.id, ...patch });
      return;
    }
    setSavingId(zone.id);
    try {
      await updateSectorGenerationConfig(zone.id, payload);
      await refetch();
    } catch {
      setError('No se pudo guardar la configuración de la zona');
    } finally {
      setSavingId(null);
    }
  };

  const saveRate = (zone: SectorSummary, raw: string) => {
    const trimmed = raw.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setError('La tasa debe ser un número mayor o igual que 0');
      return;
    }
    void saveField(zone, { generationRateKgPerDay: value }, { configuredGenerationRateKgPerDay: value });
  };

  const savePerCapita = (zone: SectorSummary, raw: string) => {
    const trimmed = raw.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setError('La tasa per cápita debe ser mayor o igual que 0');
      return;
    }
    void saveField(zone, { perCapitaKgPerDay: value }, { perCapitaKgPerDay: value });
  };

  const saveMode = (zone: SectorSummary, mode: DistributionMode) =>
    void saveField(zone, { distributionMode: mode }, { distributionMode: mode });

  const saveFactor = async (zone: SectorSummary, value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
      setError('El factor debe ser mayor que 0');
      return;
    }
    setError('');
    if (useMocks) {
      replaceLocal({ id: zone.id, fillRateFactor: value });
      return;
    }
    setSavingId(zone.id);
    try {
      const updated = await updateSectorFillRateFactor(zone.id, value);
      replaceLocal({ id: zone.id, fillRateFactor: updated.fillRateFactor ?? value });
    } catch {
      setError('No se pudo guardar el factor de la zona');
    } finally {
      setSavingId(null);
    }
  };

  const calibrate = async () => {
    if (useMocks) {
      setFlash('Calibración simulada (modo demo)');
      return;
    }
    setError('');
    setCalibrating(true);
    try {
      const result = await calibrateCollectionPoints({});
      setFlash(
        `Calibración: ${result.calibratedCount} contenedores actualizados, ${result.skippedCount} omitidos.`,
      );
      await refetch();
    } catch {
      setError('No se pudo calibrar con los pesos recolectados');
    } finally {
      setCalibrating(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Generación por zona"
        subtitle="Tasa total (manual o per cápita) y reparto entre contenedores. Calibra con los pesos reales recolectados."
      />
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <Button size="sm" loading={calibrating()} onClick={() => void calibrate()}>
          Calibrar con pesos reales
        </Button>
        <Show when={flash()}>
          <span class="text-xs text-text-secondary">{flash()}</span>
        </Show>
      </div>
      <Show when={error()}>
        <p class="mb-2 text-sm text-red-600">{error()}</p>
      </Show>
      <Show
        when={!zones.loading}
        fallback={<p class="text-sm text-text-secondary">Cargando zonas…</p>}
      >
        <div class="space-y-2" data-testid="sector-generation-panel">
          <For each={zones() ?? []}>
            {(zone) => (
              <div class="rounded-md border border-border px-3 py-2 dark:border-dark-border">
                <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div class="min-w-0">
                    <p
                      class="truncate text-sm font-medium text-text-primary dark:text-white"
                      title={zone.name}
                    >
                      {zone.name}
                    </p>
                    <p class="text-xs text-text-muted">
                      {zone.containerCount} contenedores · {formatNumber(zone.totalCapacityKg)} kg ·{' '}
                      {formatNumber(zone.effectiveGenerationRateKgPerDay, 1)} kg/día efectivos
                      {zone.overflowCount > 0 ? ` · ${zone.overflowCount} en rebose` : ''}
                      {zone.population ? ` · ${formatNumber(zone.population)} hab` : ''}
                    </p>
                  </div>
                  <div class="flex flex-wrap items-end gap-3">
                    <label class="flex flex-col gap-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                        Reparto
                      </span>
                      <select
                        value={zone.distributionMode}
                        disabled={savingId() === zone.id}
                        aria-label={`Modo de reparto de ${zone.name}`}
                        class="rounded-md border border-border bg-surface px-2 py-1 text-sm dark:bg-dark-surface-hover dark:border-dark-border"
                        onChange={(e) =>
                          void saveMode(zone, e.currentTarget.value as DistributionMode)
                        }
                      >
                        <For each={DISTRIBUTION_OPTIONS}>
                          {(option) => <option value={option.value}>{option.label}</option>}
                        </For>
                      </select>
                    </label>
                    <label class="flex flex-col gap-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                        Tasa zona (kg/día)
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={
                          zone.configuredGenerationRateKgPerDay == null
                            ? ''
                            : String(zone.configuredGenerationRateKgPerDay)
                        }
                        disabled={savingId() === zone.id}
                        placeholder="manual"
                        aria-label={`Tasa de generación de ${zone.name}`}
                        class="w-24 rounded-md border border-border bg-surface px-2 py-1 text-sm dark:bg-dark-surface-hover dark:border-dark-border"
                        onChange={(e) => saveRate(zone, e.currentTarget.value)}
                      />
                    </label>
                    <label class="flex flex-col gap-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                        Per cápita (kg/hab/día)
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={zone.perCapitaKgPerDay == null ? '' : String(zone.perCapitaKgPerDay)}
                        disabled={savingId() === zone.id}
                        placeholder="deriva"
                        aria-label={`Tasa per cápita de ${zone.name}`}
                        class="w-24 rounded-md border border-border bg-surface px-2 py-1 text-sm dark:bg-dark-surface-hover dark:border-dark-border"
                        onChange={(e) => savePerCapita(zone, e.currentTarget.value)}
                      />
                    </label>
                    <label class="flex flex-col gap-1">
                      <span class="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                        Factor llenado
                      </span>
                      <input
                        type="number"
                        min="0.1"
                        max="10"
                        step="0.1"
                        value={String(zone.fillRateFactor ?? 1)}
                        disabled={savingId() === zone.id}
                        aria-label={`Factor de llenado de ${zone.name}`}
                        class="w-16 rounded-md border border-border bg-surface px-2 py-1 text-sm dark:bg-dark-surface-hover dark:border-dark-border"
                        onChange={(e) => void saveFactor(zone, Number(e.currentTarget.value))}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </Card>
  );
}
