import type { ChartOptions } from 'chart.js';

/** Tokens alineados con `--fero-border-default` y `--fero-text-muted` en dark. */
export const CHART_GRID_DARK = '#334155';
export const CHART_TICK_DARK = '#94a3b8';
export const CHART_GRID_LIGHT = 'rgba(148, 163, 184, 0.25)';
export const CHART_TICK_LIGHT = '#64748b';

export function isDarkChartTheme(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

export function chartGridColor(): string {
  return isDarkChartTheme() ? CHART_GRID_DARK : CHART_GRID_LIGHT;
}

export function chartTickColor(): string {
  return isDarkChartTheme() ? CHART_TICK_DARK : CHART_TICK_LIGHT;
}

export function cartesianChartScales(): NonNullable<ChartOptions['scales']> {
  const grid = chartGridColor();
  const tick = chartTickColor();
  return {
    x: {
      grid: { display: false },
      ticks: { color: tick },
    },
    y: {
      beginAtZero: true,
      grid: { color: grid },
      ticks: { color: tick },
    },
  };
}

export function barChartOptions(
  overrides: ChartOptions = {},
): ChartOptions {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, ...overrides.plugins },
    scales: { ...cartesianChartScales(), ...overrides.scales },
    ...overrides,
  };
}

export function doughnutChartOptions(
  overrides: ChartOptions = {},
): ChartOptions {
  const tick = chartTickColor();
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: overrides.plugins?.legend?.display ?? false,
        labels: { color: tick, ...overrides.plugins?.legend?.labels },
      },
      tooltip: { enabled: true, ...overrides.plugins?.tooltip },
      ...overrides.plugins,
    },
    ...overrides,
  };
}
