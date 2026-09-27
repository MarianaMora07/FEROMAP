import { createMemo, onMount, Show } from 'solid-js';
import {
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Line } from 'solid-chartjs';
import type { AcoSensitivityRun } from '../../core/api/benchmark';

let chartRegistered = false;

function ensureChart() {
  if (chartRegistered) return;
  Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);
  chartRegistered = true;
}

interface CalibrationAxisChartProps {
  /** Corridas del eje seleccionado (válidas primero). */
  runs: AcoSensitivityRun[];
  labels: string[];
  baselineKm?: number | null;
  distanceLabel: string;
  baselineLabel: string;
  /** Título del eje X: el parámetro que se barre. */
  xAxisTitle: string;
}

/** Distancia optimizada vs nivel del eje seleccionado (+ línea base de referencia). */
export function CalibrationAxisChart(props: CalibrationAxisChartProps) {
  onMount(ensureChart);

  const chartData = createMemo(() => ({
    labels: props.labels,
    datasets: [
      {
        label: props.distanceLabel,
        data: props.runs.map((run) => run.distanceKmOptimized ?? null),
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22, 163, 74, 0.12)',
        tension: 0.25,
        pointRadius: 4,
      },
      ...(props.baselineKm
        ? [
            {
              label: props.baselineLabel,
              data: props.labels.map(() => props.baselineKm ?? null),
              borderColor: '#94a3b8',
              borderDash: [6, 4],
              pointRadius: 0,
              tension: 0,
            },
          ]
        : []),
    ],
  }));

  const options = createMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const, labels: { boxWidth: 10, font: { size: 10 } } },
      tooltip: { mode: 'index' as const, intersect: false },
    },
    scales: {
      x: { title: { display: true, text: props.xAxisTitle } },
      y: { title: { display: true, text: 'km' }, beginAtZero: false },
    },
  }));

  return (
    <Show
      when={props.runs.length > 0}
      fallback={<p class="text-xs text-text-muted">Sin corridas válidas en este eje.</p>}
    >
      <div class="h-56" data-testid="calibration-axis-chart">
        <Line data={chartData()} options={options()} />
      </div>
    </Show>
  );
}
