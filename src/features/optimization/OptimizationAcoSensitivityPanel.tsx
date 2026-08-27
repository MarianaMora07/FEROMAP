import { Show, createSignal, onMount } from 'solid-js';
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
import { Button, Card, CardHeader } from '../../design-system/components';
import {
  fetchAcoSensitivity,
  runAcoSensitivity,
  type AcoSensitivityPayload,
} from '../../core/api/benchmark';
import { formatComputationSeconds } from '../../core/utils/optimizationResults';

let chartRegistered = false;

function ensureChart() {
  if (chartRegistered) return;
  Chart.register(CategoryScale, LinearScale, PointElement, ScatterController, Tooltip, Legend);
  chartRegistered = true;
}

const AXIS_COLORS: Record<string, string> = {
  ants: '#2563eb',
  iterations: '#16a34a',
};

export function OptimizationAcoSensitivityPanel() {
  onMount(ensureChart);
  const [payload, setPayload] = createSignal<AcoSensitivityPayload | undefined>();
  const [loading, setLoading] = createSignal(true);
  const [missing, setMissing] = createSignal(false);
  const [running, setRunning] = createSignal(false);

  const load = async () => {
    setLoading(true);
    setMissing(false);
    try {
      setPayload(await fetchAcoSensitivity());
    } catch {
      setPayload(undefined);
      setMissing(true);
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void load();
  });

  const successfulRuns = () => (payload()?.runs ?? []).filter((run) => !run.error);

  const scatterData = () => ({
    datasets: ['ants', 'iterations'].map((axis) => {
      const rows = successfulRuns().filter((run) => run.axis === axis);
      return {
        label: axis === 'ants' ? 'Variación de hormigas' : 'Variación de iteraciones',
        data: rows.map((run) => ({
          x: run.computationSeconds ?? 0,
          y: run.distanceKmOptimized ?? 0,
        })),
        backgroundColor: AXIS_COLORS[axis] ?? '#64748b',
        pointRadius: 7,
      };
    }),
  });

  const handleRun = async () => {
    setRunning(true);
    try {
      setPayload(await runAcoSensitivity());
      setMissing(false);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card data-testid="optimization-aco-sensitivity-panel">
      <CardHeader
        title="Sensibilidad ACO (evidencia Fase 3)"
        subtitle="Trade-off distancia vs tiempo de cómputo — escenario normal"
        action={
          <Button size="sm" variant="outline" loading={running()} onClick={() => void handleRun()}>
            Regenerar
          </Button>
        }
      />
      <Show when={loading()}>
        <p class="text-sm text-text-muted">Cargando estudio de sensibilidad…</p>
      </Show>
      <Show when={!loading() && missing()}>
        <p class="mb-3 text-sm text-text-muted">
          Sin datos en caché. Ejecuta <code class="rounded bg-app px-1">just phase3-sensitivity</code> o
          pulsa Regenerar.
        </p>
      </Show>
      <Show when={!loading() && successfulRuns().length > 0}>
        <div class="mb-4 h-48">
          <Scatter
            data={scatterData()}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y} km · ${ctx.parsed.x} s` } },
              },
              scales: {
                x: { title: { display: true, text: 'Tiempo CPU (s)' } },
                y: { title: { display: true, text: 'Distancia ACO (km)' }, beginAtZero: false },
              },
            }}
          />
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[32rem] text-sm">
            <thead>
              <tr class="border-b border-default text-left text-[10px] uppercase tracking-wide text-text-muted">
                <th class="pb-2 pr-3">Configuración</th>
                <th class="pb-2 pr-3">Hormigas</th>
                <th class="pb-2 pr-3">Iter.</th>
                <th class="pb-2 pr-3">CPU</th>
                <th class="pb-2 pr-3">Distancia</th>
                <th class="pb-2">Iter. ejecutadas</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default/70">
              {successfulRuns().map((run) => (
                <tr>
                  <td class="py-2 pr-3 font-medium">{run.label}</td>
                  <td class="py-2 pr-3">{run.acoAnts}</td>
                  <td class="py-2 pr-3">{run.acoIterations}</td>
                  <td class="py-2 pr-3">{formatComputationSeconds(run.computationSeconds ?? 0)}</td>
                  <td class="py-2 pr-3">{run.distanceKmOptimized?.toFixed(1)} km</td>
                  <td class="py-2">{run.acoIterationsRun ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Show>
    </Card>
  );
}
