import { For, Show, createSignal, onMount } from 'solid-js';
import {
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  PointElement,
  ScatterController,
  Tooltip,
} from 'chart.js';
import { Scatter } from 'solid-chartjs';
import {
  fetchAcoBenchmark,
  runAcoBenchmark,
  type AcoBenchmarkPayload,
  type AcoBenchmarkRun,
} from '../../core/api/benchmark';
import { Button, Card, CardHeader } from '../../design-system/components';
import { formatComputationSeconds } from '../../core/utils/optimizationResults';

let chartRegistered = false;

function ensureChart() {
  if (chartRegistered) return;
  Chart.register(CategoryScale, LinearScale, PointElement, ScatterController, Tooltip, Legend);
  chartRegistered = true;
}

const PROFILE_COLORS: Record<string, string> = {
  fast: '#f59e0b',
  standard: '#16a34a',
  precise: '#2563eb',
};

function runLabel(run: AcoBenchmarkRun) {
  return `${run.scenarioLabel} · ${run.profileLabel}`;
}

export function AcoBenchmarkPanel() {
  onMount(ensureChart);
  const [benchmark, setBenchmark] = createSignal<AcoBenchmarkPayload | undefined>();
  const [loadingBenchmark, setLoadingBenchmark] = createSignal(true);
  const [benchmarkError, setBenchmarkError] = createSignal(false);
  const [running, setRunning] = createSignal(false);
  const [runError, setRunError] = createSignal<string | null>(null);

  const loadBenchmark = async () => {
    setLoadingBenchmark(true);
    setBenchmarkError(false);
    try {
      setBenchmark(await fetchAcoBenchmark());
    } catch {
      setBenchmark(undefined);
      setBenchmarkError(true);
    } finally {
      setLoadingBenchmark(false);
    }
  };

  onMount(() => {
    void loadBenchmark();
  });

  const successfulRuns = () => (benchmark()?.runs ?? []).filter((run) => !run.error);

  const scatterData = () => ({
    datasets: ['fast', 'standard', 'precise'].map((profileId) => {
      const rows = successfulRuns().filter((run) => run.profileId === profileId);
      return {
        label: rows[0]?.profileLabel ?? profileId,
        data: rows.map((run) => ({
          x: run.computationSeconds ?? 0,
          y: run.savingPct ?? 0,
        })),
        backgroundColor: PROFILE_COLORS[profileId] ?? '#64748b',
        pointRadius: 6,
      };
    }),
  });

  const scatterOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { x: number; y: number } }) =>
            `${ctx.dataset.label}: ${ctx.parsed.x.toFixed(1)} s · ${ctx.parsed.y.toFixed(1)}% ahorro`,
        },
      },
    },
    scales: {
      x: { title: { display: true, text: 'Tiempo total de cálculo (s)' } },
      y: { title: { display: true, text: 'Ahorro de distancia (%)' } },
    },
  };

  const handleRunBenchmark = async () => {
    setRunning(true);
    setRunError(null);
    try {
      ensureChart();
      await runAcoBenchmark();
      await loadBenchmark();
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'No se pudo ejecutar el benchmark');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Benchmark ACO (tesis)"
        subtitle="5 escenarios × 3 perfiles — tiempo de CPU vs. calidad de solución (% ahorro en km)."
      />
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={running()} onClick={handleRunBenchmark}>
          {running() ? 'Ejecutando…' : 'Regenerar benchmark'}
        </Button>
        <Show when={benchmark()?.generatedAt}>
          <span class="text-xs text-text-muted">
            Generado: {new Date(benchmark()!.generatedAt).toLocaleString('es-VE')}
          </span>
        </Show>
      </div>
      <Show when={runError()}>
        <p class="mb-3 text-sm text-red-600 dark:text-red-400">{runError()}</p>
      </Show>
      <Show when={loadingBenchmark()}>
        <p class="mb-3 text-sm text-text-muted">Cargando benchmark…</p>
      </Show>
      <Show when={!loadingBenchmark() && benchmarkError()}>
        <p class="mb-3 text-sm text-text-muted">
          No hay benchmark en caché. Ejecuta <code class="rounded bg-slate-100 px-1 dark:bg-dark-surface">just benchmark-aco</code>{' '}
          o pulsa «Regenerar benchmark».
        </p>
      </Show>
      <Show when={!loadingBenchmark() && successfulRuns().length > 0}>
        <div class="mb-4 h-56">
          <Scatter data={scatterData()} options={scatterOptions} />
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr class="border-b border-border text-text-muted dark:border-dark-border">
                <th class="px-2 py-2 font-semibold">Escenario</th>
                <th class="px-2 py-2 font-semibold">Perfil</th>
                <th class="px-2 py-2 font-semibold">Total</th>
                <th class="px-2 py-2 font-semibold">Grafo</th>
                <th class="px-2 py-2 font-semibold">ACO</th>
                <th class="px-2 py-2 font-semibold">Overhead</th>
                <th class="px-2 py-2 font-semibold">Ahorro km</th>
                <th class="px-2 py-2 font-semibold">Iter.</th>
              </tr>
            </thead>
            <tbody>
              <For each={successfulRuns()}>
                {(run) => (
                  <tr class="border-b border-border/60 dark:border-dark-border/60">
                    <td class="px-2 py-2">{run.scenarioLabel}</td>
                    <td class="px-2 py-2">{run.profileLabel}</td>
                    <td class="px-2 py-2 font-mono">{formatComputationSeconds(run.computationSeconds ?? 0)}</td>
                    <td class="px-2 py-2 font-mono">{formatComputationSeconds(run.graphLoadSeconds ?? 0)}</td>
                    <td class="px-2 py-2 font-mono">{formatComputationSeconds(run.acoSeconds ?? 0)}</td>
                    <td class="px-2 py-2 font-mono">{formatComputationSeconds(run.overheadSeconds ?? 0)}</td>
                    <td class="px-2 py-2 font-semibold text-fero-green-dark">{run.savingPct?.toFixed(1)}%</td>
                    <td class="px-2 py-2 font-mono">
                      {run.acoIterationsRun}/{run.acoIterations}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <p class="mt-3 text-[11px] text-text-muted">
          Interpretación: el perfil Rápido suele bastar para demos; Estándar + caché/early-stop acerca la calidad de Preciso
          con mucho menos CPU.
        </p>
      </Show>
    </Card>
  );
}

export { runLabel };
