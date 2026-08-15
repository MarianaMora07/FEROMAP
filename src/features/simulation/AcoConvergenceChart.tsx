import { For, Show, createMemo, onMount } from 'solid-js';
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
import type { AcoConvergencePoint } from '../../data/types/simulation';

let chartRegistered = false;

function ensureChart() {
  if (chartRegistered) return;
  Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);
  chartRegistered = true;
}

interface AcoConvergenceChartProps {
  points: AcoConvergencePoint[];
  compact?: boolean;
  /** Etiqueta del eje Y (default: distancia en km). */
  yAxisTitle?: string;
  bestSeriesLabel?: string;
  iterationSeriesLabel?: string;
}

export function AcoConvergenceChart(props: AcoConvergenceChartProps) {
  onMount(ensureChart);

  const yTitle = () => props.yAxisTitle ?? 'Distancia (km)';
  const bestLabel = () => props.bestSeriesLabel ?? 'Mejor distancia global (km)';
  const iterationLabel = () => props.iterationSeriesLabel ?? 'Mejor de la iteración (km)';

  const chartData = createMemo(() => {
    const labels = props.points.map((point) => String(point.iteration));
    return {
      labels,
      datasets: [
        {
          label: bestLabel(),
          data: props.points.map((point) => point.bestDistanceKm),
          borderColor: '#16a34a',
          backgroundColor: 'rgba(22, 163, 74, 0.12)',
          tension: 0.25,
          pointRadius: 3,
        },
        {
          label: iterationLabel(),
          data: props.points.map((point) => point.iterationBestDistanceKm),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          tension: 0.25,
          pointRadius: 2,
          borderDash: [4, 3],
        },
      ],
    };
  });

  const options = createMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: { boxWidth: 10, font: { size: 10 } },
      },
      tooltip: { mode: 'index' as const, intersect: false },
    },
    scales: {
      x: {
        title: { display: !props.compact, text: 'Iteración ACO' },
        ticks: { maxTicksLimit: props.compact ? 6 : 12 },
      },
      y: {
        title: { display: !props.compact, text: yTitle() },
        beginAtZero: false,
      },
    },
  }));

  return (
    <Show
      when={props.points.length > 0}
      fallback={<p class="text-xs text-text-muted">Sin datos de convergencia ACO.</p>}
    >
      <div class={props.compact ? 'h-40' : 'h-52'}>
        <Line data={chartData()} options={options()} />
      </div>
    </Show>
  );
}
