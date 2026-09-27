import { createMemo, onMount, Show } from 'solid-js';
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
import type { ObjectiveSweepRun } from '../../core/api/benchmark';

let chartRegistered = false;

function ensureChart() {
  if (chartRegistered) return;
  Chart.register(CategoryScale, LinearScale, PointElement, ScatterController, Tooltip, Legend);
  chartRegistered = true;
}

interface ParetoFrontierChartProps {
  runs: ObjectiveSweepRun[];
  frontier: ObjectiveSweepRun[];
  frontierLabel: string;
  distanceLabel: string;
  makespanLabel: string;
}

function toPoint(run: ObjectiveSweepRun) {
  return {
    x: run.distanceKmOptimized ?? 0,
    y: run.maxRouteHours ?? 0,
    label: run.label,
    vehicles: run.activeVehicles ?? 0,
  };
}

/** Dispersión distancia vs makespan; el radio crece con los vehículos activos. */
export function ParetoFrontierChart(props: ParetoFrontierChartProps) {
  onMount(ensureChart);

  const chartData = createMemo(() => {
    const other = props.runs.filter(
      (run) => !props.frontier.some((item) => item.label === run.label),
    );
    const radius = (points: ReturnType<typeof toPoint>[]) => {
      const vehicles = points.map((point) => point.vehicles);
      return (context: { dataIndex: number }) => {
        const value = vehicles[context.dataIndex] ?? 3;
        return 4 + Math.min(6, Math.max(0, value));
      };
    };
    const frontierPoints = props.frontier.map(toPoint);
    const otherPoints = other.map(toPoint);

    return {
      datasets: [
        {
          label: props.frontierLabel,
          data: frontierPoints,
          backgroundColor: '#16a34a',
          pointRadius: radius(frontierPoints),
        },
        {
          label: props.distanceLabel,
          data: otherPoints,
          backgroundColor: 'rgba(148, 163, 184, 0.55)',
          pointRadius: radius(otherPoints),
        },
      ],
    };
  });

  const options = createMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const, labels: { boxWidth: 10, font: { size: 10 } } },
      tooltip: {
        callbacks: {
          label: (context: { raw: unknown }) => {
            const point = context.raw as ReturnType<typeof toPoint>;
            return `${point.label}: ${point.x.toFixed(1)} km · ${point.y.toFixed(2)} h · ${
              point.vehicles
            } veh.`;
          },
        },
      },
    },
    scales: {
      x: { title: { display: true, text: props.distanceLabel }, beginAtZero: false },
      y: { title: { display: true, text: props.makespanLabel }, beginAtZero: false },
    },
  }));

  return (
    <Show when={props.runs.length > 0} fallback={<p class="text-xs text-text-muted">Sin corridas.</p>}>
      <div class="h-56" data-testid="calibration-pareto-chart">
        <Scatter data={chartData()} options={options()} />
      </div>
    </Show>
  );
}
