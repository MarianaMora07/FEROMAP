import { For } from 'solid-js';
import type { JSX } from 'solid-js';
import { Doughnut, Line, Bar } from 'solid-chartjs';
import { Clock, Download, Leaf, Route, Trash2, Truck } from 'lucide-solid';
import { Button, Card, CardHeader, KpiCard } from '../../design-system/components';

interface DashboardAnalytics {
  kpis: Array<{
    id: string;
    title: string;
    value: string;
    icon: string;
    iconTone: string;
    trend: number;
  }>;
  performanceSeries: {
    labels: string[];
    collections: number[];
    tons: number[];
    distance: number[];
    efficiency: number[];
  };
  wasteTypeDistribution: {
    totalLabel: string;
    items: Array<{ label: string; pct: number; color: string }>;
  };
  routePerformance: Array<{ label: string; tons: number; color: string }>;
  periodComparison: Array<{
    metric: string;
    current: string;
    previous: string;
    delta: number;
  }>;
  filters: {
    from: string | null;
    to: string | null;
    granularity: 'daily' | 'weekly' | 'monthly';
    sector: string | null;
  };
}

const GRANULARITY_OPTIONS = [
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
] as const;

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'custom', label: 'Personalizado' },
] as const;

const ICON_MAP: Record<string, () => JSX.Element> = {
  trash: () => <Trash2 size={22} />,
  route: () => <Route size={22} />,
  truck: () => <Truck size={22} />,
  leaf: () => <Leaf size={22} />,
  clock: () => <Clock size={22} />,
};

interface DashboardAnalyticsContentProps {
  data: {
    kpis: Array<{
      id: string;
      title: string;
      value: string;
      icon: string;
      iconTone: string;
      trend: number;
    }>;
    performanceSeries: {
      labels: string[];
      collections: number[];
      tons: number[];
      distance: number[];
      efficiency: number[];
    };
    wasteTypeDistribution: {
      totalLabel: string;
      items: Array<{ label: string; pct: number; color: string }>;
    };
    routePerformance: Array<{ label: string; tons: number; color: string }>;
    periodComparison: Array<{
      metric: string;
      current: string;
      previous: string;
      delta: number;
    }>;
    filters: {
      from: string | null;
      to: string | null;
      granularity: 'daily' | 'weekly' | 'monthly';
      sector: string | null;
    };
  };
  granularity: 'daily' | 'weekly' | 'monthly';
  period: 'today' | 'week' | 'month' | 'custom';
  startDate: string;
  endDate: string;
  setGranularity: (v: 'daily' | 'weekly' | 'monthly') => void;
  setPeriod: (v: 'today' | 'week' | 'month' | 'custom') => void;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
  globalToast: { addToast: (message: string, variant?: 'success' | 'error' | 'warning' | 'info') => void };
}

function DashboardAnalyticsContent({
  data,
  granularity,
  period,
  startDate,
  endDate,
  setGranularity,
  setPeriod,
  setStartDate,
  setEndDate,
  globalToast,
}: DashboardAnalyticsContentProps) {
  const GRANULARITY_OPTIONS = [
    { value: 'daily', label: 'Diario' },
    { value: 'weekly', label: 'Semanal' },
    { value: 'monthly', label: 'Mensual' },
  ] as const;

  const PERIOD_OPTIONS = [
    { value: 'today', label: 'Hoy' },
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mes' },
    { value: 'custom', label: 'Personalizado' },
  ] as const;

  const ICON_MAP: Record<string, () => JSX.Element> = {
    trash: () => <Trash2 size={22} />,
    route: () => <Route size={22} />,
    truck: () => <Truck size={22} />,
    leaf: () => <Leaf size={22} />,
    clock: () => <Clock size={22} />,
  };

  const lineData = {
    labels: data.performanceSeries.labels,
    datasets: [
      {
        label: 'Recolecciones',
        data: data.performanceSeries.collections,
        borderColor: '#34D634',
        backgroundColor: 'rgba(52, 214, 52, 0.08)',
        tension: 0.35,
        pointRadius: 3,
        yAxisID: 'y',
      },
      {
        label: 'Toneladas (t)',
        data: data.performanceSeries.tons,
        borderColor: '#1143F3',
        backgroundColor: 'transparent',
        tension: 0.35,
        pointRadius: 3,
        yAxisID: 'y',
      },
      {
        label: 'Distancia (km)',
        data: data.performanceSeries.distance,
        borderColor: '#f59e0b',
        backgroundColor: 'transparent',
        tension: 0.35,
        pointRadius: 3,
        yAxisID: 'y',
      },
      {
        label: 'Eficiencia (%)',
        data: data.performanceSeries.efficiency,
        borderColor: '#7c3aed',
        backgroundColor: 'transparent',
        tension: 0.35,
        pointRadius: 3,
        yAxisID: 'y1',
      },
    ],
  };

  const donutData = {
    labels: data.wasteTypeDistribution.items.map(i => i.label),
    datasets: [
      {
        data: data.wasteTypeDistribution.items.map(i => i.pct),
        backgroundColor: data.wasteTypeDistribution.items.map(i => i.color),
        borderWidth: 0,
        cutout: '72%',
      },
    ],
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
  };

  const barData = {
    labels: data.routePerformance.map(r => r.label),
    datasets: [
      {
        label: 'Toneladas',
        data: data.routePerformance.map(r => r.tons),
        backgroundColor: data.routePerformance.map(r => r.color),
        borderWidth: 0,
        borderRadius: 4,
      },
    ],
  };

  const maxRouteTons = Math.max(...data.routePerformance.map(r => r.tons), 1);

  return (
    <>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <For each={data.kpis}>
          {(kpi) => (
            <KpiCard
              title={kpi.title}
              value={kpi.value}
              icon={(ICON_MAP[kpi.icon] ?? ICON_MAP.trash)()}
              iconTone={kpi.iconTone as 'green' | 'blue' | 'amber' | 'red' | 'purple'}
              trend={{ value: kpi.trend }}
              trendLabel="vs período anterior"
            />
          )}
        </For>
      </div>

      <div class="grid gap-4 xl:grid-cols-5">
        <Card class="xl:col-span-3">
          <CardHeader
            title="Evolución operativa"
            action={
              <select
                aria-label="Granularidad del resumen"
                value={granularity}
                onChange={e => setGranularity(e.currentTarget.value as 'daily' | 'weekly' | 'monthly')}
                class="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-secondary dark:bg-dark-surface-hover dark:border-dark-border"
              >
                <For each={[
                  { value: 'daily', label: 'Diario' },
                  { value: 'weekly', label: 'Semanal' },
                  { value: 'monthly', label: 'Mensual' },
                ]}>
                  {(o) => <option value={o.value}>{o.label}</option>}
                </For>
              </select>
            }
          />
          <div class="mb-3 flex flex-wrap gap-3 text-xs text-text-secondary">
            <span class="inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-fero-green-dark" /> Recolecciones</span>
            <span class="inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-fero-blue" /> Toneladas (t)</span>
            <span class="inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-amber-500" /> Distancia (km)</span>
            <span class="inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-violet-600" /> Eficiencia (%)</span>
          </div>
          <div class="h-64 sm:h-72" role="img" aria-label="Evolución temporal de recolecciones, toneladas, distancia y eficiencia">
            <Line
              data={{
                labels: data.performanceSeries.labels,
                datasets: [
                  {
                    label: 'Recolecciones',
                    data: data.performanceSeries.collections,
                    borderColor: '#34D634',
                    backgroundColor: 'rgba(52, 214, 52, 0.08)',
                    tension: 0.35,
                    pointRadius: 3,
                    yAxisID: 'y',
                  },
                  {
                    label: 'Toneladas (t)',
                    data: data.performanceSeries.tons,
                    borderColor: '#1143F3',
                    backgroundColor: 'transparent',
                    tension: 0.35,
                    pointRadius: 3,
                    yAxisID: 'y',
                  },
                  {
                    label: 'Distancia (km)',
                    data: data.performanceSeries.distance,
                    borderColor: '#f59e0b',
                    backgroundColor: 'transparent',
                    tension: 0.35,
                    pointRadius: 3,
                    yAxisID: 'y',
                  },
                  {
                    label: 'Eficiencia (%)',
                    data: data.performanceSeries.efficiency,
                    borderColor: '#7c3aed',
                    backgroundColor: 'transparent',
                    tension: 0.35,
                    pointRadius: 3,
                    yAxisID: 'y1',
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: false } },
                scales: {
                  y: {
                    position: 'left',
                    grid: { color: 'rgba(148,163,184,0.2)' },
                    ticks: { font: { size: 10 } },
                  },
                  y1: {
                    position: 'right',
                    min: 0,
                    max: 100,
                    grid: { drawOnChartArea: false },
                    ticks: { callback: (v: string | number) => `${v}%`, font: { size: 10 } },
                  },
                  x: {
                    grid: { display: false },
                    ticks: { font: { size: 10 } },
                  },
                },
              }}
            />
          </div>
        </Card>

        <Card class="xl:col-span-2">
          <CardHeader title="Generar reporte" />
          <form class="space-y-4">
            <div>
              <label for="report-type" class="mb-1.5 block text-sm font-semibold text-text-primary dark:text-white">Tipo de reporte</label>
              <select id="report-type" class="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm dark:bg-dark-surface-hover dark:border-dark-border dark:text-white">
                <option value="performance">Rendimiento</option>
                <option value="contingency">Contingencia</option>
              </select>
            </div>
            <div>
              <label for="report-period" class="mb-1.5 block text-sm font-semibold text-text-primary dark:text-white">Período</label>
              <select id="report-period" class="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm dark:bg-dark-surface-hover dark:border-dark-border dark:text-white">
                <For each={[
                  { value: 'today', label: 'Hoy' },
                  { value: 'week', label: 'Semana' },
                  { value: 'month', label: 'Mes' },
                  { value: 'custom', label: 'Personalizado' },
                ]}>
                  {(o) => <option value={o.value}>{o.label}</option>}
                </For>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="report-start" class="mb-1.5 block text-sm font-semibold text-text-primary dark:text-white">Fecha inicio</label>
                <input id="report-start" type="date" class="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm dark:bg-dark-surface-hover dark:border-dark-border dark:text-white" />
              </div>
              <div>
                <label for="report-end" class="mb-1.5 block text-sm font-semibold text-text-primary dark:text-white">Fecha fin</label>
                <input id="report-end" type="date" class="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm dark:bg-dark-surface-hover dark:border-dark-border dark:text-white" />
              </div>
            </div>
            <Button type="button" variant="primary" class="w-full" icon={<Download size={16} />} onClick={() => globalToast.addToast('Reporte generado (demo)', 'success')}>
              Generar reporte
            </Button>
          </form>
        </Card>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Recolección por tipo de residuo" />
          <div class="flex flex-col items-center gap-4 sm:flex-row">
            <div class="relative h-36 w-36 shrink-0" role="img" aria-label={'Distribución de residuos por tipo; total ' + data.wasteTypeDistribution.totalLabel}>
              <Doughnut
                data={{
                  labels: data.wasteTypeDistribution.items.map(i => i.label),
                  datasets: [
                    {
                      data: data.wasteTypeDistribution.items.map(i => i.pct),
                      backgroundColor: data.wasteTypeDistribution.items.map(i => i.color),
                      borderWidth: 0,
                      cutout: '72%',
                    },
                  ],
                }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: true } } }}
              />
              <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span class="font-heading text-lg font-bold text-text-primary dark:text-white">{data.wasteTypeDistribution.totalLabel}</span>
                <span class="text-xs text-text-muted">Total</span>
              </div>
            </div>
            <ul class="w-full space-y-2">
              <For each={data.wasteTypeDistribution.items}>
                {(item) => (
                  <li class="flex items-center justify-between gap-2 text-sm">
                    <span class="flex items-center gap-2 text-text-secondary">
                      <span class="h-2.5 w-2.5 rounded-full" style={{ 'background-color': item.color }} />
                      {item.label}
                    </span>
                    <span class="font-medium text-text-primary dark:text-white">{item.pct}%</span>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Card>

        <Card>
          <CardHeader title="Rendimiento por ruta" />
          <ul class="space-y-3.5">
            <For each={data.routePerformance}>
              {(r) => (
                <li>
                  <div class="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span class="flex items-center gap-2 text-text-secondary">
                      <span class="h-2.5 w-2.5 rounded-full" style={{ 'background-color': r.color }} />
                      {r.label}
                    </span>
                    <span class="font-semibold text-text-primary dark:text-white">{r.tons} t</span>
                  </div>
                  <div class="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div class="h-full rounded-full" style={{ width: `${(r.tons / Math.max(...data.routePerformance.map(r => r.tons), 1)) * 100}%`, 'background-color': r.color }} />
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Card>

        <Card>
          <CardHeader title="Comparativo de períodos" />
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted">
                  <th class="pb-2 pr-2 font-semibold">Métrica</th>
                  <th class="pb-2 pr-2 font-semibold">Actual</th>
                  <th class="pb-2 pr-2 font-semibold">Anterior</th>
                  <th class="pb-2 font-semibold">Var.</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border dark:divide-dark-border">
                <For each={data.periodComparison}>
                  {(row) => (
                    <tr>
                      <td class="py-2.5 pr-2 text-text-secondary">{row.metric}</td>
                      <td class="py-2.5 pr-2 font-medium text-text-primary dark:text-white">{row.current}</td>
                      <td class="py-2.5 pr-2 text-text-muted">{row.previous}</td>
                      <td class="py-2.5">
                        <span class={`inline-flex items-center gap-0.5 text-xs font-semibold ${row.delta >= 0 ? 'text-fero-green-dark' : 'text-red-500'}`}>
                          {row.delta >= 0 ? '↑' : '↓'} {Math.abs(row.delta)}%
                        </span>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Rendimiento por ruta (barras)" />
        <div class="h-64" role="img" aria-label="Toneladas por ruta">
          <Bar
            data={{
              labels: data.routePerformance.map(r => r.label),
              datasets: [
                {
                  label: 'Toneladas',
                  data: data.routePerformance.map(r => r.tons),
                  backgroundColor: data.routePerformance.map(r => r.color),
                  borderWidth: 0,
                  borderRadius: 4,
                },
              ],
            }}
            options={{
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { grid: { color: 'rgba(148,163,184,0.2)' }, ticks: { font: { size: 10 } } },
                y: { grid: { display: false }, ticks: { font: { size: 10 } } },
              },
            }}
          />
        </div>
      </Card>
    </>
  );
}

export { DashboardAnalyticsContent };