import { For, Show, createEffect, createMemo, createSignal, onMount, type JSX } from 'solid-js';
import { A, useSearchParams } from '@solidjs/router';
import {
  Chart,
  ArcElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut, Line } from 'solid-chartjs';
import {
  ArrowRight,
  ArrowUpRight,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Leaf,
  Route,
  Trash2,
  Truck,
} from 'lucide-solid';
import {
  Button,
  Card,
  CardHeader,
  KpiCard,
} from '../../design-system/components';
import {
  periodComparison as mockPeriodComparison,
  performanceSeries as mockPerformanceSeries,
  reportPeriodOptions,
  reportTypeOptions,
  reportsKpis as mockReportsKpis,
  routePerformance as mockRoutePerformance,
  savedReports as mockSavedReports,
  wasteTypeDistribution as mockWasteTypeDistribution,
} from '../../data/mock/reports';
import { downloadReport, fetchReportsSummary } from '../../core/api/reports';
import type { AnalyticsGranularity } from '../../core/types/analytics';
import {
  defaultDateRange,
  resolvePeriodRange,
  type ReportPeriodPreset,
} from '../../core/utils/analyticsFilters';
import { parseSimulationIdParam } from '../../core/utils/simulationLinks';
import { SimulationContextBanner } from '../simulation/SimulationContextBanner';

function KpiIcon(props: { name: (typeof mockReportsKpis)[number]['icon'] }) {
  const map: Record<(typeof mockReportsKpis)[number]['icon'], () => JSX.Element> = {
    trash: () => <Trash2 size={22} />,
    truck: () => <Truck size={22} />,
    route: () => <Route size={22} />,
    clock: () => <Clock size={22} />,
    leaf: () => <Leaf size={22} />,
  };
  return map[props.name]();
}

export default function ReportsPage() {
  const [params] = useSearchParams();
  const focusedSimulationId = () => parseSimulationIdParam(params.simulationId);
  const initialRange = defaultDateRange();
  const [granularity, setGranularity] = createSignal<AnalyticsGranularity>('daily');
  const [reportType, setReportType] = createSignal('performance');
  const [period, setPeriod] = createSignal<ReportPeriodPreset>('month');
  const [startDate, setStartDate] = createSignal(initialRange.from);
  const [endDate, setEndDate] = createSignal(initialRange.to);
  const [format, setFormat] = createSignal<'pdf' | 'excel'>('pdf');
  const [generating, setGenerating] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [kpis, setKpis] = createSignal(mockReportsKpis);
  const [performanceSeries, setPerformanceSeries] = createSignal(mockPerformanceSeries);
  const [wasteTypeDistribution, setWasteTypeDistribution] = createSignal(mockWasteTypeDistribution);
  const [routePerformance, setRoutePerformance] = createSignal(mockRoutePerformance);
  const [periodComparison, setPeriodComparison] = createSignal(mockPeriodComparison);
  const [savedReports, setSavedReports] = createSignal(mockSavedReports);

  const filters = createMemo(() => {
    const range = resolvePeriodRange(period(), startDate(), endDate());
    return {
      from: range.from,
      to: range.to,
      granularity: granularity(),
    };
  });

  const loadSummary = () =>
    fetchReportsSummary(filters()).then((summary) => {
      setKpis(summary.kpis);
      setPerformanceSeries(summary.performanceSeries);
      setWasteTypeDistribution(summary.wasteTypeDistribution);
      setRoutePerformance(summary.routePerformance);
      setPeriodComparison(summary.periodComparison);
      setSavedReports(summary.savedReports);
    });

  createEffect(() => {
    filters();
    setLoading(true);
    void loadSummary().finally(() => setLoading(false));
  });

  const handlePeriodChange = (value: string) => {
    const next = value as ReportPeriodPreset;
    setPeriod(next);
    if (next !== 'custom') {
      const range = resolvePeriodRange(next);
      setStartDate(range.from);
      setEndDate(range.to);
    }
  };

  onMount(() => {
    Chart.register(ArcElement, CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend);
  });

  const lineData = () => ({
    labels: performanceSeries().labels,
    datasets: [
      {
        label: 'Recolecciones',
        data: performanceSeries().collections,
        borderColor: '#34D634',
        backgroundColor: 'rgba(52, 214, 52, 0.08)',
        tension: 0.35,
        pointRadius: 3,
        yAxisID: 'y',
      },
      {
        label: 'Toneladas (t)',
        data: performanceSeries().tons,
        borderColor: '#1143F3',
        backgroundColor: 'transparent',
        tension: 0.35,
        pointRadius: 3,
        yAxisID: 'y',
      },
      {
        label: 'Distancia (km)',
        data: performanceSeries().distance,
        borderColor: '#f59e0b',
        backgroundColor: 'transparent',
        tension: 0.35,
        pointRadius: 3,
        yAxisID: 'y',
      },
      {
        label: 'Eficiencia (%)',
        data: performanceSeries().efficiency,
        borderColor: '#7c3aed',
        backgroundColor: 'transparent',
        tension: 0.35,
        pointRadius: 3,
        yAxisID: 'y1',
      },
    ],
  });

  const donutData = () => ({
    labels: wasteTypeDistribution().items.map((i) => i.label),
    datasets: [
      {
        data: wasteTypeDistribution().items.map((i) => i.pct),
        backgroundColor: wasteTypeDistribution().items.map((i) => i.color),
        borderWidth: 0,
        cutout: '72%',
      },
    ],
  });

  const maxRouteTons = () => Math.max(...routePerformance().map((r) => r.tons), 1);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await downloadReport(format() === 'pdf' ? 'pdf' : 'csv', filters());
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div class="space-y-5">
      <SimulationContextBanner simulationId={focusedSimulationId()} page="reports" />
      <Show when={loading()}>
        <div class="text-sm text-text-muted">Cargando reportes...</div>
      </Show>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <For each={kpis()}>
          {(kpi) => (
            <KpiCard
              title={kpi.title}
              value={kpi.value}
              iconTone={kpi.iconTone}
              icon={<KpiIcon name={kpi.icon} />}
              trend={{ value: kpi.trend, direction: 'up' }}
              trendLabel="vs período anterior"
            />
          )}
        </For>
      </div>

      <div class="grid gap-4 xl:grid-cols-5">
        <Card class="xl:col-span-3">
          <CardHeader
            title="Resumen de rendimiento"
            action={
              <select
                value={granularity()}
                onChange={(e) => setGranularity(e.currentTarget.value as AnalyticsGranularity)}
                class="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-secondary dark:bg-dark-surface-hover dark:border-dark-border"
              >
                <option value="daily">Diario</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
              </select>
            }
          />
          <div class="mb-3 flex flex-wrap gap-3 text-xs text-text-secondary">
            <span class="inline-flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full bg-fero-green-dark" /> Recolecciones
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full bg-fero-blue" /> Toneladas (t)
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full bg-amber-500" /> Distancia (km)
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full bg-violet-600" /> Eficiencia (%)
            </span>
          </div>
          <div class="h-64 sm:h-72">
            <Line
              data={lineData()}
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
          <form
            class="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleGenerate();
            }}
          >
            <div>
              <label class="mb-1.5 block text-sm font-semibold text-text-primary dark:text-white">
                Tipo de reporte
              </label>
              <select
                value={reportType()}
                onChange={(e) => setReportType(e.currentTarget.value)}
                class="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
              >
                <For each={reportTypeOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </select>
            </div>

            <div>
              <label class="mb-1.5 block text-sm font-semibold text-text-primary dark:text-white">
                Período
              </label>
              <select
                value={period()}
                onChange={(e) => handlePeriodChange(e.currentTarget.value)}
                class="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
              >
                <For each={reportPeriodOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </select>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1.5 block text-sm font-semibold text-text-primary dark:text-white">
                  Fecha inicio
                </label>
                <input
                  type="date"
                  value={startDate()}
                  onInput={(e) => setStartDate(e.currentTarget.value)}
                  disabled={period() !== 'custom'}
                  class="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm disabled:opacity-50 dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-sm font-semibold text-text-primary dark:text-white">
                  Fecha fin
                </label>
                <input
                  type="date"
                  value={endDate()}
                  onInput={(e) => setEndDate(e.currentTarget.value)}
                  disabled={period() !== 'custom'}
                  class="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm disabled:opacity-50 dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
                />
              </div>
            </div>

            <div>
              <p class="mb-1.5 text-sm font-semibold text-text-primary dark:text-white">Formato</p>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  class={`inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors ${
                    format() === 'pdf'
                      ? 'border-violet-300 bg-violet-50 text-violet-700'
                      : 'border-border text-text-secondary hover:bg-surface-hover'
                  }`}
                  onClick={() => setFormat('pdf')}
                >
                  <FileText size={16} />
                  PDF
                </button>
                <button
                  type="button"
                  class={`inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors ${
                    format() === 'excel'
                      ? 'border-fero-green-dark/40 bg-fero-green/15 text-fero-green-dark'
                      : 'border-border text-text-secondary hover:bg-surface-hover'
                  }`}
                  onClick={() => setFormat('excel')}
                >
                  <FileSpreadsheet size={16} />
                  Excel
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              class="w-full"
              icon={<Download size={16} />}
              loading={generating()}
            >
              Generar reporte
            </Button>
          </form>
        </Card>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Recolección por tipo de residuo" />
          <div class="flex flex-col items-center gap-4 sm:flex-row">
            <div class="relative h-36 w-36 shrink-0">
              <Doughnut
                data={donutData()}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false }, tooltip: { enabled: true } },
                }}
              />
              <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span class="font-heading text-lg font-bold text-text-primary dark:text-white">
                  {wasteTypeDistribution().totalLabel}
                </span>
                <span class="text-xs text-text-muted">Total</span>
              </div>
            </div>
            <ul class="w-full space-y-2">
              <For each={wasteTypeDistribution().items}>
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
            <For each={routePerformance()}>
              {(r) => (
                <li>
                  <div class="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span class="text-text-secondary">{r.label}</span>
                    <span class="font-semibold text-text-primary dark:text-white">{r.tons} t</span>
                  </div>
                  <div class="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      class="h-full rounded-full"
                      style={{
                        width: `${(r.tons / maxRouteTons()) * 100}%`,
                        'background-color': r.color,
                      }}
                    />
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
                <For each={periodComparison()}>
                  {(row) => (
                    <tr>
                      <td class="py-2.5 pr-2 text-text-secondary">{row.metric}</td>
                      <td class="py-2.5 pr-2 font-medium text-text-primary dark:text-white">{row.current}</td>
                      <td class="py-2.5 pr-2 text-text-muted">{row.previous}</td>
                      <td class="py-2.5">
                        <span class="inline-flex items-center gap-0.5 text-xs font-semibold text-fero-green-dark">
                          <ArrowUpRight size={12} />
                          {row.delta}%
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
        <CardHeader title="Reportes guardados" />
        <div class="overflow-x-auto">
          <table class="w-full min-w-180 text-sm">
            <thead>
              <tr class="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted dark:border-dark-border">
                <th class="pb-2 pr-3 font-semibold">Nombre del reporte</th>
                <th class="pb-2 pr-3 font-semibold">Tipo</th>
                <th class="pb-2 pr-3 font-semibold">Período</th>
                <th class="pb-2 pr-3 font-semibold">Formato</th>
                <th class="pb-2 pr-3 font-semibold">Fecha de generación</th>
                <th class="pb-2 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border dark:divide-dark-border">
              <For each={savedReports()}>
                {(row) => (
                  <tr>
                    <td class="py-3 pr-3 font-medium text-text-primary dark:text-white">{row.name}</td>
                    <td class="py-3 pr-3 text-text-secondary">{row.type}</td>
                    <td class="py-3 pr-3 text-text-muted">{row.period}</td>
                    <td class="py-3 pr-3">
                      <Show
                        when={row.format === 'pdf'}
                        fallback={
                          <span class="inline-flex items-center gap-1 text-fero-green-dark">
                            <FileSpreadsheet size={14} /> Excel
                          </span>
                        }
                      >
                        <span class="inline-flex items-center gap-1 text-violet-600">
                          <FileText size={14} /> PDF
                        </span>
                      </Show>
                    </td>
                    <td class="py-3 pr-3 text-xs text-text-muted">{row.generatedAt}</td>
                    <td class="py-3">
                      <div class="flex items-center gap-0.5">
                        <button
                          type="button"
                          class="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-fero-blue"
                          aria-label="Descargar"
                          onClick={() => void downloadReport('csv', filters())}
                        >
                          <Download size={15} />
                        </button>
                        <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover" aria-label="Ver">
                          <Eye size={15} />
                        </button>
                        <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-red-500" aria-label="Eliminar">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <div class="mt-4 flex justify-end">
          <A href="/reports" class="inline-flex items-center gap-1 text-sm font-medium text-fero-blue hover:underline">
            Ver todos los reportes
            <ArrowRight size={14} />
          </A>
        </div>
      </Card>
    </div>
  );
}
