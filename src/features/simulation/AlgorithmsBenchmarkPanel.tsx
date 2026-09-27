import { For, Show, createSignal, onMount } from 'solid-js';
import { RefreshCw, ShieldAlert } from 'lucide-solid';
import { Button, Card, CardHeader } from '../../design-system/components';
import {
  fetchAlgorithmsBenchmark,
  runAlgorithmsBenchmark,
  type AlgorithmsBenchmarkPayload,
  type AlgorithmsBenchmarkRun,
} from '../../core/api/benchmark';

function familyTone(family: AlgorithmsBenchmarkRun['family']): string {
  if (family === 'aco') return 'bg-fero-green/15 text-fero-green-dark border-fero-green/30';
  if (family === 'clarke_wright') return 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600';
  return 'bg-fero-blue/10 text-fero-blue border-fero-blue/25';
}

function bestDistance(payload: AlgorithmsBenchmarkPayload | undefined, size: number): number | null {
  const rows = (payload?.runs ?? []).filter((row) => row.instanceSize === size);
  if (rows.length === 0) return null;
  return Math.min(...rows.map((row) => row.distanceKm));
}

export function AlgorithmsBenchmarkPanel() {
  const [payload, setPayload] = createSignal<AlgorithmsBenchmarkPayload | undefined>();
  const [error, setError] = createSignal<string | null>(null);
  const [running, setRunning] = createSignal(false);

  const load = async () => {
    setRunning(true);
    setError(null);
    try {
      setPayload(await fetchAlgorithmsBenchmark());
    } catch {
      setPayload(undefined);
      setError('Sin benchmark generado. Usa "Regenerar comparación" para ejecutarlo.');
    } finally {
      setRunning(false);
    }
  };

  const regenerate = async () => {
    setRunning(true);
    setError(null);
    try {
      setPayload(await runAlgorithmsBenchmark());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo ejecutar el benchmark');
    } finally {
      setRunning(false);
    }
  };

  onMount(() => void load());

  return (
    <Card data-testid="algorithms-benchmark-panel">
      <CardHeader
        title="Comparación entre familias de algoritmos"
        subtitle="ACO vs Clarke-Wright vs GA sobre instancias controladas (15/30/60 contenedores)"
        action={
          <Button size="sm" variant="outline" icon={<RefreshCw size={14} />} loading={running()} onClick={() => void regenerate()}>
            Regenerar comparación
          </Button>
        }
      />
      <Show when={error()} fallback={null}>
        <div class="mb-3 flex items-start gap-2 rounded-lg border border-amber-300/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
          <ShieldAlert size={16} class="mt-0.5 shrink-0" />
          <p>{error()}</p>
        </div>
      </Show>
      <Show when={!payload()} fallback={null}>
        <p class="text-sm text-text-muted">Cargando…</p>
      </Show>
      <Show when={payload()}>
        {(payload) => (
          <>
            <div class="overflow-x-auto">
              <table class="w-full min-w-140 text-sm">
                <thead>
                  <tr class="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted dark:border-dark-border">
                    <th class="pb-2 pr-3 font-semibold">Familia</th>
                    <th class="pb-2 pr-3 font-semibold">Contenedores</th>
                    <th class="pb-2 pr-3 font-semibold">Distancia (km)</th>
                    <th class="pb-2 pr-3 font-semibold">CPU (s)</th>
                    <th class="pb-2 font-semibold">Sin cubrir</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border dark:divide-dark-border">
                  <For each={payload().runs}>
                    {(row) => (
                      <tr>
                        <td class="py-2 pr-3">
                          <span
                            class={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${familyTone(row.family)}`}
                          >
                            {row.familyLabel}
                          </span>
                        </td>
                        <td class="py-2 pr-3 text-text-secondary">{row.instanceSize}</td>
                        <td class="py-2 pr-3 font-semibold text-text-primary dark:text-white">
                          {row.distanceKm.toFixed(1)}
                          {row.distanceKm === bestDistance(payload(), row.instanceSize) && (
                            <span class="ml-1 text-[10px] font-medium text-fero-green-dark dark:text-fero-green-mid">
                              ← mejor
                            </span>
                          )}
                        </td>
                        <td class="py-2 pr-3 text-text-secondary">{row.cpuSeconds.toFixed(2)}</td>
                        <td class="py-2 pr-3 text-text-secondary">{row.uncoveredCount}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
            <p class="mt-3 text-[11px] text-text-muted">{payload().methodology}</p>
          </>
        )}
      </Show>
    </Card>
  );
}
