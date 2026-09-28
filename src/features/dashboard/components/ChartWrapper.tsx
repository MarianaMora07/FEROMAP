import { For, createMemo } from 'solid-js';
import type { JSX } from 'solid-js';
import { Line, Bar, Doughnut } from 'solid-chartjs';
import {
  Chart,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  ArcElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Card, CardHeader, KpiCard } from '../../../design-system/components';

Chart.register(
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  ArcElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
);

export interface LineChartProps {
  title: string;
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor?: string;
    yAxisID?: 'y' | 'y1';
    tension?: number;
    fill?: boolean;
    pointRadius?: number;
    borderWidth?: number;
  }>;
  yAxisLabel?: string;
  y1AxisLabel?: string;
  yMin?: number;
  y1Min?: number;
  yMax?: number;
  y1Max?: number;
  className?: string;
  height?: number;
  showLegend?: boolean;
}

const DEFAULT_COLORS = [
  '#34D634',  // green
  '#1143F3',  // blue
  '#f59e0b',  // amber
  '#7c3aed',  // violet
  '#ef4444',  // red
  '#06b6d4',  // cyan
  '#ec4899',  // pink
];

export function LineChart({
  title,
  labels,
  datasets,
  yAxisLabel,
  y1AxisLabel,
  yMin,
  y1Min,
  yMax,
  y1Max,
  className = '',
  height = 300,
  showLegend = false,
}: LineChartProps) {
  const chartData = {
    labels,
    datasets: datasets.map((d, i) => ({
      label: d.label,
      data: d.data,
      borderColor: d.borderColor || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      backgroundColor: d.backgroundColor || `rgba(${hexToRgb(d.borderColor || DEFAULT_COLORS[i % DEFAULT_COLORS.length])}, 0.08)`,
      borderWidth: d.borderWidth ?? 2,
      pointRadius: d.pointRadius ?? 3,
      pointHoverRadius: 5,
      tension: d.tension ?? 0.35,
      fill: d.fill ?? false,
      yAxisID: d.yAxisID || 'y',
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        titleFont: { size: 12 },
        bodyFont: { size: 11 },
        padding: 12,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        grid: { display: false, color: 'rgba(148,163,184,0.1)' },
        ticks: { font: { size: 10 }, color: '#64748b' },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        min: yMin,
        title: yAxisLabel ? { display: true, text: yAxisLabel, font: { size: 10 } } : undefined,
        grid: { color: 'rgba(148,163,184,0.1)' },
        ticks: { font: { size: 10 }, color: '#64748b' },
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        min: y1Min ?? 0,
        max: y1Max,
        grid: { drawOnChartArea: false },
        title: y1AxisLabel ? { display: true, text: y1AxisLabel, font: { size: 10 } } : undefined,
        ticks: { font: { size: 10 }, color: '#64748b', callback: (v: string | number) => `${v}%` },
      },
    },
  };

  return (
    <div className="space-y-2">
      {title && <h3 className="font-semibold text-text-primary dark:text-white mb-2">{title}</h3>}
      <div className={`h-64 ${height ? `h-${height}` : ''}`} role="img" aria-label={title}>
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
}

export interface BarChartProps {
  title?: string;
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor: string | string[];
    borderRadius?: number;
  }>;
  indexAxis?: 'x' | 'y';
  className?: string;
  height?: number;
}

export function BarChart({
  title,
  labels,
  datasets,
  indexAxis = 'y',
  className = '',
  height = 300,
}: BarChartProps) {
  const chartData = {
    labels,
    datasets: datasets.map((d) => ({
      label: d.label,
      data: d.data,
      backgroundColor: d.backgroundColor || ['#34D634', '#1143F3', '#f59e0b', '#7c3aed', '#ef4444'],
      borderWidth: 0,
      borderRadius: d.borderRadius ?? 4,
      borderSkipped: false,
    })),
  };

  const options = {
    indexAxis: indexAxis as 'x' | 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    scales: {
      x: { grid: { color: 'rgba(148,163,184,0.1)' }, ticks: { font: { size: 10 } } },
      y: { grid: { display: false }, ticks: { font: { size: 10 } } },
    },
  };

  return (
    <div className="space-y-2">
      {title && <h3 className="font-semibold text-text-primary dark:text-white mb-2">{title}</h3>}
      <div className={`h-64 ${height ? `h-${height}` : ''}`} role="img" aria-label={title}>
        <Bar data={chartData} options={options} />
      </div>
    </div>
  );
}

export interface DoughnutChartProps {
  title?: string;
  labels: string[];
  data: number[];
  colors: string[];
  totalLabel?: string;
  centerLabel?: string;
  className?: string;
  size?: number;
}

export function DoughnutChart({
  title,
  labels,
  data,
  colors,
  totalLabel,
  centerLabel,
  className = '',
  size = 120,
}: DoughnutChartProps) {
  const chartData = {
    labels,
    datasets: [{
      data,
      backgroundColor: colors,
      borderWidth: 0,
      cutout: '72%',
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    cutout: '72%',
  };

  return (
    <div className="space-y-2">
      {title && <h3 className="font-semibold text-text-primary dark:text-white mb-2">{title}</h3>}
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div class="relative" style={{ width: `${size}px`, height: `${size}px` }}>
          <Doughnut
            data={{ labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, cutout: '72%' }] }}
            options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: true } }, cutout: '72%' }}
          />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            {totalLabel && <span className="font-heading text-lg font-bold text-text-primary dark:text-white">{totalLabel}</span>}
            {centerLabel && <span className="text-xs text-text-muted">{centerLabel}</span>}
          </div>
        </div>
        <ul className="w-full space-y-2">
          <For each={labels}>
            {(label, i) => (
              <li class="flex items-center justify-between gap-2 text-sm">
                <span class="flex items-center gap-2 text-text-secondary">
                  <span class="h-2.5 w-2.5 rounded-full" style={{ 'background-color': colors[i()] }} />
                  {label}
                </span>
                <span class="font-medium text-text-primary dark:text-white">{data[i()]}{data[i()] > 1 ? '%' : ''}</span>
              </li>
            )}
          </For>
        </ul>
      </div>
    </div>
  );
}

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  action?: JSX.Element;
  children: JSX.Element;
  className?: string;
}

export function ChartCard({ title, subtitle, action, children, className = '' }: ChartCardProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-text-primary dark:text-white">{title}</h3>
          {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="rounded-xl border border-default bg-surface p-4">
        {children}
      </div>
    </div>
  );
}

export interface KpiGridProps {
  children: JSX.Element;
  columns?: { base: number; sm: number; lg: number; xl: number };
  gap?: number;
  className?: string;
}

export function KpiGrid({ children, columns = { base: 1, sm: 2, lg: 3, xl: 5 }, gap = 3, className = '' }: KpiGridProps) {
  return (
    <div class={`grid gap-${gap} ${className}`} style={{ 'grid-template-columns': `repeat(${columns.base}, 1fr)` }}>
      {children}
    </div>
  );
}

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '52, 214, 84';
}