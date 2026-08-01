import { For, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import {
  Chart,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'solid-chartjs';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Clock,
  Crosshair,
  Leaf,
  Lightbulb,
  Minus,
  Plus,
  Route,
  TrendingUp,
  Trash2,
  Truck,
} from 'lucide-solid';
import {
  Card,
  CardHeader,
  KpiCard,
  ProgressBar,
} from '../../design-system/components';
import { bindMapTheme, mapStyleForTheme } from '../../core/utils/mapStyle';
import { appState } from '../../core/stores/appStore';
import { UNARE_CENTER, UNARE_ZOOM } from '../../data/types/geo';
import { fetchAnalyticsSummary } from '../../core/api/analytics';
import {
  analyticsEfficiencyIndicators as mockEfficiency,
  analyticsInsights as mockInsights,
  analyticsKpis as mockKpis,
  analyticsRoutePerformance as mockRoutePerformance,
  analyticsWasteTypes as mockWasteTypes,
  evolutionSeries as mockEvolution,
  heatmapPoints,
  hourlyDistribution as mockHourly,
  hourlyMetricOptions,
  type HourlyMetricId,
} from '../../data/mock/analytics';

function KpiIcon(props: { name: (typeof mockKpis)[number]['icon'] }) {
  const map: Record<(typeof mockKpis)[number]['icon'], () => JSX.Element> = {
    trash: () => <Trash2 size={22} />,
    truck: () => <Truck size={22} />,
    route: () => <Route size={22} />,
    clock: () => <Clock size={22} />,
    leaf: () => <Leaf size={22} />,
  };
  return map[props.name]();
}

function Sparkline(props: { values: number[]; color: string }) {
  const w = 120;
  const h = 28;
  const min = Math.min(...props.values);
  const max = Math.max(...props.values);
  const range = max - min || 1;
  const points = props.values
    .map((v, i) => {
      const x = (i / (props.values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} class="mt-2 h-7 w-full max-w-36" aria-hidden="true">
      <polyline
        fill="none"
        stroke={props.color}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        points={points}
      />
    </svg>
  );
}

const sparkColor: Record<(typeof mockKpis)[number]['iconTone'], string> = {
  green: '#34D634',
  blue: '#1143F3',
  amber: '#f59e0b',
  purple: '#7c3aed',
};

function InsightIcon(props: { icon: (typeof mockInsights)[number]['icon']; tone: string }) {
  const cls = props.tone;
  switch (props.icon) {
    case 'trend':
      return <TrendingUp size={16} class={cls} />;
    case 'clock':
      return <Clock size={16} class={cls} />;
    case 'route':
      return <Route size={16} class={cls} />;
    case 'leaf':
      return <Leaf size={16} class={cls} />;
  }
}

const insightToneBg = {
  green: 'bg-fero-green/15 text-fero-green-dark',
  amber: 'bg-amber-100 text-amber-600',
  purple: 'bg-violet-100 text-violet-600',
  blue: 'bg-fero-blue/10 text-fero-blue',
};

export default function AnalyticsPage() {
  let mapContainer!: HTMLDivElement;
  const mapRef: { current?: MapLibreMap } = {};
  const [granularity, setGranularity] = createSignal('daily');
  const [hourlyMetric, setHourlyMetric] = createSignal<HourlyMetricId>('toneladas');
  const [mapReady, setMapReady] = createSignal(false);
  const [kpis, setKpis] = createSignal(mockKpis);
  const [evolutionSeries, setEvolutionSeries] = createSignal(mockEvolution);
  const [analyticsWasteTypes, setAnalyticsWasteTypes] = createSignal(mockWasteTypes);
  const [analyticsRoutePerformance, setAnalyticsRoutePerformance] = createSignal(mockRoutePerformance);
  const [hourlyDistribution, setHourlyDistribution] = createSignal(mockHourly);
  const [analyticsEfficiencyIndicators, setAnalyticsEfficiencyIndicators] = createSignal(mockEfficiency);
  const [analyticsInsights, setAnalyticsInsights] = createSignal(mockInsights);

  const setupAnalyticsHeatmap = (map: MapLibreMap) => {
    if (!map.getSource('heat')) {
      map.addSource('heat', { type: 'geojson', data: heatmapPoints });
      map.addLayer({
        id: 'heat-layer',
        type: 'heatmap',
        source: 'heat',
        paint: {
          'heatmap-weight': ['get', 'weight'],
          'heatmap-intensity': 1.2,
          'heatmap-radius': 28,
          'heatmap-opacity': 0.75,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(52,214,52,0)',
            0.2,
            'rgba(52,214,52,0.5)',
            0.45,
            'rgba(245,158,11,0.7)',
            0.7,
            'rgba(239,68,68,0.85)',
            1,
            'rgba(185,28,28,0.95)',
          ],
        },
      });
    }
  };

  bindMapTheme(
    () => mapRef.current,
    mapReady,
    () => setupAnalyticsHeatmap(mapRef.current!),
  );

  onMount(() => {
    void fetchAnalyticsSummary().then((summary) => {
      setKpis(summary.kpis);
      setEvolutionSeries(summary.evolutionSeries);
      setAnalyticsWasteTypes(summary.wasteTypes);
      setAnalyticsRoutePerformance(summary.routePerformance);
      setHourlyDistribution(summary.hourlyDistribution);
      setAnalyticsEfficiencyIndicators(summary.efficiencyIndicators);
      setAnalyticsInsights(summary.insights);
    });
    Chart.register(
      ArcElement,
      BarElement,
      CategoryScale,
      LinearScale,
      LineElement,
      PointElement,
      Filler,
      Tooltip,
      Legend,
    );

    const map = new maplibregl.Map({
      container: mapContainer,
      style: mapStyleForTheme(appState.darkMode),
      center: UNARE_CENTER,
      zoom: UNARE_ZOOM - 0.4,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      map.resize();
      setupAnalyticsHeatmap(map);
      setMapReady(true);
    });

    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(mapContainer);
    onCleanup(() => {
      ro.disconnect();
      mapRef.current?.remove();
      mapRef.current = undefined;
    });
  });

  const lineData = () => ({
    labels: evolutionSeries().labels,
    datasets: [
      {
        label: 'Recolecciones',
        data: evolutionSeries().collections,
        borderColor: '#34D634',
        backgroundColor: 'rgba(52, 214, 52, 0.1)',
        tension: 0.35,
        pointRadius: 3,
        fill: true,
        yAxisID: 'y',
      },
      {
        label: 'Toneladas (t)',
        data: evolutionSeries().tons,
        borderColor: '#1143F3',
        backgroundColor: 'transparent',
        tension: 0.35,
        pointRadius: 3,
        yAxisID: 'y1',
      },
    ],
  });

  const donutData = () => ({
    labels: analyticsWasteTypes().items.map((i) => i.label),
    datasets: [
      {
        data: analyticsWasteTypes().items.map((i) => i.pct),
        backgroundColor: analyticsWasteTypes().items.map((i) => i.color),
        borderWidth: 0,
        cutout: '72%',
      },
    ],
  });

  const hourlyData = () => ({
    labels: hourlyDistribution().labels,
    datasets: [
      {
        data: hourlyDistribution()[hourlyMetric()],
        backgroundColor: '#7c3aed',
        borderRadius: 6,
        maxBarThickness: 28,
      },
    ],
  });

  const maxTons = () => Math.max(...analyticsRoutePerformance().map((r) => r.tons), 1);

  return (
    <div class="space-y-5">
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
              footer={<Sparkline values={kpi.sparkline} color={sparkColor[kpi.iconTone]} />}
            />
          )}
        </For>
      </div>

      <div class="grid gap-4 xl:grid-cols-5">
        <Card class="xl:col-span-3">
          <CardHeader
            title="Evolución de recolecciones y toneladas"
            action={
              <select
                value={granularity()}
                onChange={(e) => setGranularity(e.currentTarget.value)}
                class="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-secondary dark:bg-dark-surface-hover dark:border-dark-border"
              >
                <option value="daily">Diario</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
              </select>
            }
          />
          <div class="mb-2 flex flex-wrap gap-3 text-xs text-text-secondary">
            <span class="inline-flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full bg-fero-green-dark" /> Recolecciones
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full bg-fero-blue" /> Toneladas (t)
            </span>
          </div>
          <div class="h-64">
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
                    grid: { drawOnChartArea: false },
                    ticks: { font: { size: 10 } },
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
                  {analyticsWasteTypes().totalLabel}
                </span>
                <span class="text-xs text-text-muted">Total</span>
              </div>
            </div>
            <ul class="w-full space-y-2">
              <For each={analyticsWasteTypes().items}>
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
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Rendimiento por ruta" />
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted">
                  <th class="pb-2 pr-2 font-semibold">Ruta</th>
                  <th class="pb-2 pr-2 font-semibold">Toneladas</th>
                  <th class="pb-2 font-semibold">Eficiencia</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border dark:divide-dark-border">
                <For each={analyticsRoutePerformance()}>
                  {(r) => (
                    <tr>
                      <td class="py-2.5 pr-2 font-medium text-text-primary dark:text-white">{r.label}</td>
                      <td class="py-2.5 pr-2">
                        <div class="flex min-w-28 items-center gap-2">
                          <span class="text-text-secondary">{r.tons} t</span>
                          <div class="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              class="h-full rounded-full bg-fero-green-dark"
                              style={{ width: `${(r.tons / maxTons()) * 100}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td class="py-2.5 font-semibold text-text-primary dark:text-white">{r.efficiency}%</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Distribución por horario"
            action={
              <select
                value={hourlyMetric()}
                onChange={(e) => setHourlyMetric(e.currentTarget.value as HourlyMetricId)}
                class="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-secondary dark:bg-dark-surface-hover dark:border-dark-border"
              >
                <For each={[...hourlyMetricOptions]}>
                  {(o) => <option value={o.value}>{o.label}</option>}
                </For>
              </select>
            }
          />
          <div class="h-52">
            <Bar
              data={hourlyData()}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(148,163,184,0.2)' },
                    ticks: {
                      font: { size: 10 },
                      callback: (v: string | number) =>
                        hourlyMetric() === 'toneladas' ? `${v}t` : String(v),
                    },
                  },
                  x: {
                    grid: { display: false },
                    ticks: {
                      font: { size: 10 },
                      callback: (_v: string | number, i: number) => `${hourlyDistribution().labels[i]}:00`,
                    },
                  },
                },
              }}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Indicadores de eficiencia" />
          <ul class="space-y-4">
            <For each={analyticsEfficiencyIndicators()}>
              {(ind) => (
                <li>
                  <div class="mb-1.5 flex items-center justify-between gap-2 text-sm">
                    <span class="text-text-secondary">{ind.label}</span>
                    <span class="font-semibold text-text-primary dark:text-white">{ind.value}%</span>
                  </div>
                  <ProgressBar value={ind.value} color="green" size="sm" />
                </li>
              )}
            </For>
          </ul>
        </Card>
      </div>

      <div class="grid items-stretch gap-4 xl:grid-cols-5">
        <Card padding={false} class="flex min-h-0 flex-col overflow-hidden xl:col-span-3 xl:h-full">
          <div class="border-b border-border px-4 py-3 dark:border-dark-border">
            <h3 class="font-heading font-semibold text-text-primary dark:text-white">
              Mapa de calor de recolecciones
            </h3>
          </div>
          <div class="relative min-h-72 flex-1 bg-slate-100 dark:bg-slate-900">
            <div ref={mapContainer} class="absolute inset-0 h-full w-full" />

            <div class="absolute top-3 left-3 z-10 rounded-md border border-border bg-surface/95 px-2.5 py-2 text-[11px] shadow-sm backdrop-blur-sm dark:bg-dark-surface/95">
              <p class="mb-1.5 font-semibold text-text-primary dark:text-white">Densidad</p>
              <div class="flex items-center gap-2">
                <span class="text-text-muted">Baja</span>
                <div class="h-2 w-20 rounded-full bg-linear-to-r from-fero-green via-amber-400 to-red-500" />
                <span class="text-text-muted">Alta</span>
              </div>
            </div>

            <div class="absolute right-3 bottom-3 z-10 flex flex-col overflow-hidden rounded-md border border-border bg-surface/95 shadow-sm backdrop-blur-sm dark:bg-dark-surface/95">
              <button type="button" class="flex h-8 w-8 items-center justify-center text-text-secondary hover:bg-surface-hover disabled:opacity-40" disabled={!mapReady()} onClick={() => mapRef.current?.zoomIn()} aria-label="Acercar">
                <Plus size={14} />
              </button>
              <button type="button" class="flex h-8 w-8 items-center justify-center border-t border-border text-text-secondary hover:bg-surface-hover disabled:opacity-40" disabled={!mapReady()} onClick={() => mapRef.current?.zoomOut()} aria-label="Alejar">
                <Minus size={14} />
              </button>
              <button type="button" class="flex h-8 w-8 items-center justify-center border-t border-border text-text-secondary hover:bg-surface-hover disabled:opacity-40" disabled={!mapReady()} onClick={() => mapRef.current?.flyTo({ center: UNARE_CENTER, zoom: UNARE_ZOOM - 0.4 })} aria-label="Centrar">
                <Crosshair size={14} />
              </button>
            </div>
          </div>
        </Card>

        <Card class="xl:col-span-2 xl:h-full">
          <CardHeader
            title="Insights y recomendaciones"
            action={<Lightbulb size={18} class="text-amber-500" />}
          />
          <ul class="space-y-3">
            <For each={analyticsInsights()}>
              {(item) => (
                <li class="flex gap-3 rounded-lg border border-border p-3 dark:border-dark-border">
                  <span class={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${insightToneBg[item.tone]}`}>
                    <InsightIcon icon={item.icon} tone="" />
                  </span>
                  <p class="text-sm text-text-secondary">{item.text}</p>
                </li>
              )}
            </For>
          </ul>
        </Card>
      </div>
    </div>
  );
}
