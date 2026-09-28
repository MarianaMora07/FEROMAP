import { For, Show, createEffect, createSignal } from 'solid-js';
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
  BarElement,
} from 'chart.js';
import { fetchAnalyticsSummary, type AnalyticsSummary } from '../../core/api/analytics';
import { formatIsoDate, resolvePeriodRange } from '../../core/utils/analyticsFilters';
import { globalToast } from '../../core/stores/toastStore';
import { DashboardAnalyticsContent } from './DashboardAnalyticsContent';

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

const ROUTE_COLORS = ['#34D634', '#1143F3', '#f59e0b', '#7c3aed', '#ef4444', '#0ea5e9'];

Chart.register(
  ArcElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend,
  BarElement,
);

function analyticsRange(
  period: 'today' | 'week' | 'month' | 'custom',
  start: string,
  end: string,
): { from: string; to: string } {
  if (period === 'custom' && start && end) return { from: start, to: end };
  if (period === 'today') {
    const day = formatIsoDate(new Date());
    return { from: day, to: day };
  }
  if (period === 'month') return resolvePeriodRange('month');
  return resolvePeriodRange('week');
}

function sparkDelta(values: number[]): number {
  if (values.length < 2 || values[0] === 0) return 0;
  const previous = values[0]!;
  const current = values[values.length - 1] ?? previous;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

function toDashboardAnalytics(
  summary: AnalyticsSummary,
  granularity: DashboardAnalytics['filters']['granularity'],
): DashboardAnalytics {
  const evolution = summary.evolutionSeries as AnalyticsSummary['evolutionSeries'] & {
    distanceKm?: number[];
    savingPct?: number[];
  };

  return {
    kpis: summary.kpis.map((kpi) => ({
      id: kpi.id,
      title: kpi.title,
      value: kpi.value,
      icon: kpi.icon,
      iconTone: kpi.iconTone,
      trend: kpi.trend,
    })),
    performanceSeries: {
      labels: evolution.labels ?? [],
      collections: evolution.collections ?? [],
      tons: evolution.tons ?? [],
      distance: evolution.distanceKm ?? [],
      efficiency: evolution.savingPct ?? [],
    },
    wasteTypeDistribution: summary.wasteTypes,
    routePerformance: summary.routePerformance.map((route, index) => ({
      label: route.label,
      tons: route.tons,
      color: ROUTE_COLORS[index % ROUTE_COLORS.length] ?? '#34D634',
    })),
    periodComparison: summary.kpis.map((kpi) => {
      const sparkline = kpi.sparkline ?? [];
      return {
        metric: kpi.title,
        current: kpi.value,
        previous: sparkline.length > 1 ? String(sparkline[0]) : '—',
        delta: sparkDelta(sparkline),
      };
    }),
    filters: {
      from: null,
      to: null,
      granularity,
      sector: null,
    },
  };
}

export function DashboardAnalyticsSection() {
  const [granularity, setGranularity] = createSignal<'daily' | 'weekly' | 'monthly'>('daily');
  const [period, setPeriod] = createSignal<'today' | 'week' | 'month' | 'custom'>('week');
  const [startDate, setStartDate] = createSignal('');
  const [endDate, setEndDate] = createSignal('');
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal(false);
  const [analytics, setAnalytics] = createSignal<DashboardAnalytics | null>(null);

  const loadAnalytics = async () => {
    const range = analyticsRange(period(), startDate(), endDate());
    const grain = granularity();
    setLoading(true);
    try {
      const summary = await fetchAnalyticsSummary({ ...range, granularity: grain });
      setAnalytics(toDashboardAnalytics(summary, grain));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    void loadAnalytics();
  });

  return (
    <div class="space-y-4" data-testid="dashboard-analytics">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="font-heading text-xl font-bold text-text-primary dark:text-white">Analíticas operativas</h2>
          <p class="mt-0.5 text-sm text-text-secondary">Evolución y distribución de la operación</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <select
            aria-label="Granularidad"
            value={granularity()}
            onChange={e => setGranularity(e.currentTarget.value as 'daily' | 'weekly' | 'monthly')}
            class="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-secondary dark:bg-dark-surface-hover dark:border-dark-border"
          >
            <For each={GRANULARITY_OPTIONS}>
              {(o) => <option value={o.value}>{o.label}</option>}
            </For>
          </select>
          <select
            aria-label="Período"
            value={period()}
            onChange={e => { const v = e.currentTarget.value; setPeriod(v as 'today' | 'week' | 'month' | 'custom'); }}
            class="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-secondary dark:bg-dark-surface-hover dark:border-dark-border"
          >
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
      </div>

      <Show when={loading()}>
        <div role="status" aria-live="polite" class="text-sm text-text-muted">Cargando analíticas...</div>
      </Show>

      <Show when={!loading() && error()}>
        <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          Error cargando analíticas
        </div>
      </Show>

      <Show when={!loading() && !error() ? analytics() : undefined} keyed>
        {(data) => (
          <DashboardAnalyticsContent
            data={data}
            granularity={granularity()}
            period={period()}
            startDate={startDate()}
            endDate={endDate()}
            setGranularity={setGranularity}
            setPeriod={setPeriod}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
            globalToast={globalToast}
          />
        )}
      </Show>
    </div>
  );
}


