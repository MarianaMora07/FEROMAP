import { For, Show, createResource, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { A, useSearchParams } from '@solidjs/router';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  AlertTriangle,
  ArrowRight,
  Car,
  CloudRain,
  Crosshair,
  Download,
  Eye,
  Leaf,
  Minus,
  Pencil,
  Play,
  Plus,
  Save,
  TrafficCone,
  Trash2,
  TrendingUp,
  Truck,
  Wrench,
} from 'lucide-solid';
import {
  Badge,
  Button,
  Card,
  CardHeader,
} from '../../design-system/components';
import { bindMapTheme, mapStyleForTheme } from '../../core/utils/mapStyle';
import { UNARE_CENTER, UNARE_ZOOM } from '../../data/types/geo';
import { runOptimization, setScenario, simulationState, initSimulationData, currentKpis, kpiImpactRows, kpiSavingsSummary } from '../../core/stores/simulationStore';
import { canOptimize } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { fetchMonitoringStatus } from '../../core/api/monitoring';
import { BreakdownReporter, ContingencyResultBanner } from '../contingency/BreakdownReporter';
import { appState } from '../../core/stores/appStore';
import type { ScenarioId } from '../../data/types/simulation';
import {
  currentScenarioSummary,
  durationOptions,
  mapMarkerLegend,
  mapRouteLegend,
  performanceIndicators,
  quickScenarios,
  rainIntensityOptions,
  scenarioPresets,
  simulationConditions,
  simulationEfficiency,
  simulationHistory,
  simulationMapPoints,
  simulationMapRoutes,
  simulationSteps,
  wasteLevelOptions,
  type ConditionId,
} from '../../data/mock/simulationScenarios';

const pointColor: Record<(typeof simulationMapPoints)[number]['status'], string> = {
  normal: '#34D634',
  full: '#f59e0b',
  critical: '#ef4444',
  vehicle: '#7c3aed',
  block: '#dc2626',
};

function trashSvg(color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
}

function truckSvg(color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>`;
}

function coneSvg(color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.3 5H14.7L20 21H4Z"/><path d="M7.5 12h9"/><path d="M6 17h12"/></svg>`;
}

function createMarkerEl(status: (typeof simulationMapPoints)[number]['status']) {
  const bg = pointColor[status];
  const svg =
    status === 'vehicle' ? truckSvg('#fff') : status === 'block' ? coneSvg('#fff') : trashSvg('#fff');
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'sim-marker';
  el.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:${bg};box-shadow:0 2px 8px rgba(0,0,0,.25);border:2px solid #fff">${svg}</span>`;
  return el;
}

function Toggle(props: {
  checked: boolean;
  onChange: () => void;
  label: string;
  icon: JSX.Element;
}) {
  return (
    <label class="flex cursor-pointer items-center justify-between gap-3 py-1.5">
      <span class="flex min-w-0 items-center gap-2.5 text-sm text-text-secondary">
        <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-text-secondary dark:bg-dark-surface-hover">
          {props.icon}
        </span>
        {props.label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        aria-label={props.label}
        onClick={props.onChange}
        class={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          props.checked ? 'bg-fero-green-dark' : 'bg-slate-300 dark:bg-slate-600'
        }`}
      >
        <span
          class={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            props.checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  );
}

function ConditionRowIcon(props: { icon: (typeof simulationConditions)[number]['icon'] }) {
  switch (props.icon) {
    case 'car':
      return <Car size={14} />;
    case 'cloud-rain':
      return <CloudRain size={14} />;
    case 'truck':
      return <Truck size={14} />;
    case 'trash':
      return <Trash2 size={14} />;
    case 'cone':
      return <TrafficCone size={14} />;
    case 'chart':
      return <TrendingUp size={14} />;
    case 'alert':
      return <AlertTriangle size={14} />;
  }
}

function EfficiencyGauge(props: { value: number }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const half = c / 2;
  const offset = half - (half * props.value) / 100;

  return (
    <div class="relative w-40 shrink-0">
      <svg viewBox="0 0 140 96" class="w-full">
        <defs>
          <linearGradient id="eff-gauge" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#34D634" />
            <stop offset="55%" stop-color="#93F555" />
            <stop offset="100%" stop-color="#56E93D" />
          </linearGradient>
        </defs>
        <path
          d="M 16 78 A 54 54 0 0 1 124 78"
          fill="none"
          stroke="#e2e8f0"
          stroke-width="12"
          stroke-linecap="round"
        />
        <path
          d="M 16 78 A 54 54 0 0 1 124 78"
          fill="none"
          stroke="url(#eff-gauge)"
          stroke-width="12"
          stroke-linecap="round"
          stroke-dasharray={`${half}`}
          stroke-dashoffset={offset}
        />
      </svg>
      <div class="absolute inset-x-0 top-[58%] -translate-y-1/2 text-center">
        <p class="font-heading text-3xl font-bold leading-none text-text-primary dark:text-white">
          {props.value}%
        </p>
      </div>
      <p class="-mt-1.5 text-center text-xs text-fero-blue">Eficiencia del escenario</p>
    </div>
  );
}

function MetricBar(props: { label: string; value: number }) {
  return (
    <li class="grid grid-cols-[7.5rem_1fr_2.25rem] items-center gap-2">
      <span class="truncate text-xs text-text-secondary">{props.label}</span>
      <div class="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          class="h-full rounded-full bg-linear-to-r from-fero-green-dark via-fero-green-mid to-fero-green"
          style={{ width: `${props.value}%` }}
        />
      </div>
      <span class="text-right text-xs font-semibold text-text-primary dark:text-white">{props.value}%</span>
    </li>
  );
}

function ConditionIcon(props: { name: string; class?: string }) {
  const cls = props.class ?? 'text-text-secondary';
  switch (props.name) {
    case 'cloud-rain':
      return <CloudRain size={14} class={cls} />;
    case 'car':
      return <Car size={14} class={cls} />;
    case 'trash':
      return <Trash2 size={14} class={cls} />;
    case 'cone':
      return <TrafficCone size={14} class={cls} />;
    case 'chart':
      return <TrendingUp size={14} class={cls} />;
    default:
      return <Wrench size={14} class={cls} />;
  }
}

function QuickIcon(props: { icon: (typeof quickScenarios)[number]['icon'] }) {
  const wrap = (node: JSX.Element, tone: string) => (
    <span class={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>{node}</span>
  );
  switch (props.icon) {
    case 'car':
      return wrap(<Car size={18} />, 'bg-fero-blue/10 text-fero-blue');
    case 'cloud-rain':
      return wrap(<CloudRain size={18} />, 'bg-violet-100 text-violet-600');
    case 'trash':
      return wrap(<Trash2 size={18} />, 'bg-amber-100 text-amber-600');
    case 'chart':
      return wrap(<TrendingUp size={18} />, 'bg-fero-green/15 text-fero-green-dark');
  }
}

export default function SimulationPage() {
  let mapContainer!: HTMLDivElement;
  const mapRef: { current?: MapLibreMap } = {};
  const markers: Marker[] = [];
  const [params] = useSearchParams();
  const criticalFromPoints = () => {
    const value = params.critical;
    const raw = Array.isArray(value) ? value[0] : value;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };

  const [monitoringData] = createResource(fetchMonitoringStatus);
  const fleetForBreakdown = () =>
    (monitoringData()?.liveFleet ?? []).map((v) => ({
      id: v.id,
      routeId: v.routeId,
      status: v.status,
    }));

  const [step, setStep] = createSignal(1);
  const [preset, setPreset] = createSignal('custom');
  const [conditions, setConditions] = createSignal(
    Object.fromEntries(simulationConditions.map((c) => [c.id, c.defaultOn])) as Record<
      ConditionId,
      boolean
    >,
  );
  const [rainIntensity, setRainIntensity] = createSignal('alta');
  const [wasteLevel, setWasteLevel] = createSignal('30');
  const [duration, setDuration] = createSignal('4');
  const [mapReady, setMapReady] = createSignal(false);
  const [hasResults, setHasResults] = createSignal(false);

  const impactRows = () => kpiImpactRows(currentKpis());
  const savings = () => kpiSavingsSummary(currentKpis());

  const toggleCondition = (id: ConditionId) =>
    setConditions((prev) => ({ ...prev, [id]: !prev[id] }));

  const applyQuick = (id: string) => {
    const q = quickScenarios.find((s) => s.id === id);
    if (!q) return;
    setPreset(id);
    setConditions({ ...q.conditions });
    setScenario(id as ScenarioId);
    setStep(1);
  };

  const handleRun = async () => {
    setStep(2);
    await runOptimization();
    setHasResults(true);
    setStep(3);
    const map = mapRef.current;
    if (map?.getSource('sim-routes')) {
      const features = appState.routes.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          kind: feature.properties.type,
        },
      }));
      (map.getSource('sim-routes') as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features,
      });
    }
  };

  const setupSimulationMap = (map: MapLibreMap) => {
    if (!map.getSource('sim-routes')) {
      map.addSource('sim-routes', { type: 'geojson', data: simulationMapRoutes });
      map.addLayer({
        id: 'sim-current',
        type: 'line',
        source: 'sim-routes',
        filter: ['==', ['get', 'kind'], 'current'],
        paint: {
          'line-color': '#94a3b8',
          'line-width': 3.5,
          'line-dasharray': [2, 2],
          'line-opacity': 0.9,
        },
      });
      map.addLayer({
        id: 'sim-optimized',
        type: 'line',
        source: 'sim-routes',
        filter: ['==', ['get', 'kind'], 'optimized'],
        paint: { 'line-color': '#34D634', 'line-width': 4, 'line-opacity': 0.95 },
      });
      map.addLayer({
        id: 'sim-deviation',
        type: 'line',
        source: 'sim-routes',
        filter: ['==', ['get', 'kind'], 'deviation'],
        paint: {
          'line-color': '#ef4444',
          'line-width': 3,
          'line-dasharray': [1.5, 1.5],
          'line-opacity': 0.9,
        },
      });
    } else if (hasResults()) {
      const features = appState.routes.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          kind: feature.properties.type,
        },
      }));
      (map.getSource('sim-routes') as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features,
      });
    }

    markers.forEach((m) => m.remove());
    markers.length = 0;
    for (const p of simulationMapPoints) {
      const marker = new maplibregl.Marker({ element: createMarkerEl(p.status) })
        .setLngLat([p.lng, p.lat])
        .addTo(map);
      markers.push(marker);
    }
  };

  bindMapTheme(
    () => mapRef.current,
    mapReady,
    () => setupSimulationMap(mapRef.current!),
  );

  onMount(() => {
    void initSimulationData();
    const map = new maplibregl.Map({
      container: mapContainer,
      style: mapStyleForTheme(appState.darkMode),
      center: UNARE_CENTER,
      zoom: UNARE_ZOOM - 0.3,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      map.resize();
      setupSimulationMap(map);
      setMapReady(true);
    });

    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(mapContainer);
    onCleanup(() => {
      ro.disconnect();
      markers.forEach((m) => m.remove());
      mapRef.current?.remove();
      mapRef.current = undefined;
    });
  });

  return (
    <div class="space-y-5">
      <Show when={criticalFromPoints() > 0}>
        <div class="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 dark:border-amber-700/50 dark:bg-amber-950/20">
          <p class="text-sm font-semibold text-amber-800 dark:text-amber-300">
            {criticalFromPoints()} punto{criticalFromPoints() === 1 ? '' : 's'} crítico
            {criticalFromPoints() === 1 ? '' : 's'} desde Puntos de Recolección
          </p>
          <p class="mt-1 text-sm text-text-secondary">
            Ejecuta la optimización para incorporar los contenedores más urgentes en la ruta.
          </p>
        </div>
      </Show>
      <ContingencyResultBanner />
      <BreakdownReporter vehicles={fleetForBreakdown()} />

      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex flex-wrap items-center gap-2 sm:gap-3">
          <For each={[...simulationSteps]}>
            {(s, i) => (
              <>
                <button
                  type="button"
                  onClick={() => setStep(s.id)}
                  class={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
                    step() === s.id
                      ? 'bg-fero-green-dark text-white'
                      : step() > s.id
                        ? 'bg-fero-green/20 text-fero-green-dark'
                        : 'bg-slate-100 text-text-muted dark:bg-dark-surface-hover'
                  }`}
                >
                  <span
                    class={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                      step() === s.id ? 'bg-white/20' : 'bg-white dark:bg-dark-surface'
                    }`}
                  >
                    {s.id}
                  </span>
                  {s.label}
                </button>
                <Show when={i() < simulationSteps.length - 1}>
                  <span class="hidden h-px w-6 bg-border sm:block dark:bg-dark-border" />
                </Show>
              </>
            )}
          </For>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <div class="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 shadow-xs dark:bg-dark-surface dark:border-dark-border">
            <span class="flex h-8 w-8 items-center justify-center rounded-md bg-violet-100 text-violet-600">
              <CloudRain size={16} />
            </span>
            <div>
              <p class="text-[10px] font-medium uppercase tracking-wide text-text-muted">Escenario actual</p>
              <p class="text-sm font-semibold text-text-primary dark:text-white">
                {currentScenarioSummary.title}
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            class="gap-2 px-5 py-2.5"
            icon={<Play size={16} />}
            loading={simulationState.isOptimizing}
            disabled={!canOptimize(authUser()?.role)}
            onClick={() => void handleRun()}
          >
            Optimizar rutas con IA
          </Button>
          <Show when={hasResults()}>
            <A href="/map">
              <Button variant="outline" class="gap-2">
                Ver rutas en mapa
                <ArrowRight size={16} />
              </Button>
            </A>
          </Show>
        </div>
      </div>

      <div class="grid items-start gap-4 xl:grid-cols-12">
        <Card class="self-start xl:col-span-3">
          <CardHeader title="Configuración del escenario" />
          <div class="mb-4">
            <div class="mb-1.5 flex items-center justify-between">
              <p class="text-sm font-semibold text-text-primary dark:text-white">Escenario</p>
              <button type="button" class="text-text-muted hover:text-text-secondary" aria-label="Editar">
                <Pencil size={14} />
              </button>
            </div>
            <select
              value={preset()}
              onChange={(e) => setPreset(e.currentTarget.value)}
              class="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-text-primary focus:border-fero-blue focus:outline-none dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
            >
              <For each={scenarioPresets}>{(o) => <option value={o.id}>{o.label}</option>}</For>
            </select>
          </div>

          <p class="mb-1 text-sm font-semibold text-text-primary dark:text-white">Condiciones a simular</p>
          <div class="mb-4 divide-y divide-border dark:divide-dark-border">
            <For each={simulationConditions}>
              {(c) => (
                <Toggle
                  label={c.label}
                  icon={<ConditionRowIcon icon={c.icon} />}
                  checked={conditions()[c.id]}
                  onChange={() => toggleCondition(c.id)}
                />
              )}
            </For>
          </div>

          <p class="mb-2 text-sm font-semibold text-text-primary dark:text-white">Parámetros adicionales</p>
          <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div class="min-w-0">
              <label class="mb-1 block text-xs text-text-muted">Intensidad de lluvia</label>
              <select
                value={rainIntensity()}
                onChange={(e) => setRainIntensity(e.currentTarget.value)}
                disabled={!conditions().rain}
                class="w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm disabled:opacity-50 dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
              >
                <For each={rainIntensityOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </select>
            </div>
            <div class="min-w-0">
              <label class="mb-1 block text-xs text-text-muted">Nivel de desechos</label>
              <select
                value={wasteLevel()}
                onChange={(e) => setWasteLevel(e.currentTarget.value)}
                disabled={!conditions().waste_surge}
                class="w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm disabled:opacity-50 dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
              >
                <For each={wasteLevelOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </select>
            </div>
            <div class="min-w-0">
              <label class="mb-1 block text-xs text-text-muted">Duración estimada</label>
              <select
                value={duration()}
                onChange={(e) => setDuration(e.currentTarget.value)}
                class="w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
              >
                <For each={durationOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </select>
            </div>
          </div>

          <Button variant="primary" class="w-full" icon={<Save size={16} />}>
            Guardar escenario
          </Button>
        </Card>

        <div class="grid gap-4 xl:col-span-9 xl:grid-cols-9 xl:items-stretch">
          <Card padding={false} class="flex min-h-0 flex-col overflow-hidden xl:col-span-5 xl:h-full">
            <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 dark:border-dark-border">
              <h3 class="font-heading font-semibold text-text-primary dark:text-white">
                Visualización del escenario
              </h3>
              <div class="flex flex-wrap items-center gap-3 text-[11px] text-text-secondary">
                <For each={mapRouteLegend}>
                  {(item) => (
                    <span class="inline-flex items-center gap-1.5">
                      <span
                        class={`h-0.5 w-5 rounded-full ${
                          item.style === 'solid-green'
                            ? 'bg-fero-green-dark'
                            : item.style === 'dashed-red'
                              ? 'border-t-2 border-dashed border-red-500 bg-transparent'
                              : 'border-t-2 border-dashed border-slate-400 bg-transparent'
                        }`}
                      />
                      {item.label}
                    </span>
                  )}
                </For>
              </div>
            </div>

            <div class="relative min-h-64 flex-1 bg-slate-100 dark:bg-slate-900">
              <div ref={mapContainer} class="absolute inset-0 h-full w-full" />
              <div class="absolute right-3 bottom-3 z-10 flex flex-col overflow-hidden rounded-md border border-border bg-surface/95 shadow-sm backdrop-blur-sm dark:bg-dark-surface/95">
                <button type="button" class="flex h-8 w-8 items-center justify-center text-text-secondary hover:bg-surface-hover disabled:opacity-40" disabled={!mapReady()} onClick={() => mapRef.current?.zoomIn()} aria-label="Acercar">
                  <Plus size={14} />
                </button>
                <button type="button" class="flex h-8 w-8 items-center justify-center border-t border-border text-text-secondary hover:bg-surface-hover disabled:opacity-40" disabled={!mapReady()} onClick={() => mapRef.current?.zoomOut()} aria-label="Alejar">
                  <Minus size={14} />
                </button>
                <button type="button" class="flex h-8 w-8 items-center justify-center border-t border-border text-text-secondary hover:bg-surface-hover disabled:opacity-40" disabled={!mapReady()} onClick={() => mapRef.current?.flyTo({ center: UNARE_CENTER, zoom: UNARE_ZOOM - 0.3 })} aria-label="Centrar">
                  <Crosshair size={14} />
                </button>
              </div>
            </div>

            <div class="flex shrink-0 flex-wrap gap-x-4 gap-y-2 border-t border-border px-4 py-2.5 text-xs text-text-secondary dark:border-dark-border">
              <For each={mapMarkerLegend}>
                {(item) => (
                  <span class={`inline-flex items-center gap-1.5 ${item.class}`}>
                    <Show when={item.icon === 'trash'}><Trash2 size={12} /></Show>
                    <Show when={item.icon === 'truck'}><Truck size={12} /></Show>
                    <Show when={item.icon === 'cone'}><TrafficCone size={12} /></Show>
                    <span class="text-text-secondary">{item.label}</span>
                  </span>
                )}
              </For>
            </div>
          </Card>

          <div class="flex flex-col gap-4 xl:col-span-4">
            <Card>
              <CardHeader title="Resultados de la simulación" />
              <Show
                when={hasResults()}
                fallback={
                  <p class="py-10 text-center text-sm text-text-muted">
                    Ejecuta una simulación para ver el impacto estimado.
                  </p>
                }
              >
                <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Impacto general</p>
                <div class="mb-3 overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted">
                        <th class="pb-2 font-semibold">Métrica</th>
                        <th class="pb-2 font-semibold">Actual</th>
                        <th class="pb-2 font-semibold text-fero-green-dark">Simulado</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-border dark:divide-dark-border">
                      <For each={impactRows()}>
                        {(row) => (
                          <tr>
                            <td class="py-2.5 text-text-secondary">{row.metric}</td>
                            <td class="py-2.5 text-text-muted">{row.current}</td>
                            <td class="py-2.5">
                              <span class="font-semibold text-fero-green-dark">{row.simulated}</span>
                              <span class="ml-1.5 text-xs font-medium text-fero-green-dark">
                                {row.delta}%
                              </span>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>

                <div class="flex items-start gap-2.5 rounded-lg border border-fero-green/30 bg-fero-green/10 px-3 py-2.5">
                  <Leaf size={18} class="mt-0.5 shrink-0 text-fero-green-dark" />
                  <div>
                    <p class="text-xs font-semibold text-fero-green-dark">Ahorro estimado</p>
                    <p class="mt-0.5 text-sm font-medium text-text-primary dark:text-white">
                      {savings().distanceKm} km · {savings().timeMin} min · {savings().fuelL} L ·{' '}
                      {savings().co2Kg} kg CO₂ evitados
                    </p>
                  </div>
                </div>
              </Show>
            </Card>

            <Show when={hasResults()}>
              <Card padding={false} class="overflow-hidden">
                <div class="px-4 pt-4">
                  <h3 class="font-heading font-semibold text-text-primary dark:text-white">
                    Indicadores de desempeño
                  </h3>
                </div>
                <div class="flex flex-col items-center gap-5 px-4 py-4 sm:flex-row sm:items-center">
                  <EfficiencyGauge value={simulationEfficiency} />
                  <ul class="w-full flex-1 space-y-3">
                    <For each={performanceIndicators}>
                      {(ind) => <MetricBar label={ind.label} value={ind.value} />}
                    </For>
                  </ul>
                </div>
                <A
                  href="/analytics"
                  class="flex items-center justify-center border-t border-border px-4 py-3 text-sm font-semibold text-fero-blue transition-colors hover:bg-surface-hover dark:border-dark-border"
                >
                  <span class="flex-1 text-center">Ver análisis detallado</span>
                  <ArrowRight size={16} class="shrink-0" />
                </A>
              </Card>
            </Show>
          </div>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-5">
        <Card class="lg:col-span-2">
          <CardHeader title="Escenarios rápidos" />
          <div class="grid gap-3 sm:grid-cols-2">
            <For each={quickScenarios}>
              {(q) => (
                <div class="rounded-lg border border-border p-3 dark:border-dark-border">
                  <div class="mb-2">
                    <QuickIcon icon={q.icon} />
                  </div>
                  <p class="text-sm font-semibold text-text-primary dark:text-white">{q.title}</p>
                  <p class="mt-1 text-xs text-text-muted">{q.description}</p>
                  <button
                    type="button"
                    class="mt-2 text-xs font-semibold text-fero-blue hover:underline"
                    onClick={() => applyQuick(q.id)}
                  >
                    Usar escenario
                  </button>
                </div>
              )}
            </For>
          </div>
        </Card>

        <Card class="lg:col-span-3">
          <CardHeader title="Historial de simulaciones" />
          <div class="overflow-x-auto">
            <table class="w-full min-w-140 text-sm">
              <thead>
                <tr class="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted dark:border-dark-border">
                  <th class="pb-2 pr-3 font-semibold">Escenario</th>
                  <th class="pb-2 pr-3 font-semibold">Fecha</th>
                  <th class="pb-2 pr-3 font-semibold">Condiciones</th>
                  <th class="pb-2 pr-3 font-semibold">Resultado</th>
                  <th class="pb-2 pr-3 font-semibold">Eficiencia</th>
                  <th class="pb-2 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border dark:divide-dark-border">
                <For each={simulationHistory}>
                  {(row) => (
                    <tr>
                      <td class="py-2.5 pr-3 font-medium text-text-primary dark:text-white">{row.name}</td>
                      <td class="py-2.5 pr-3 text-xs text-text-muted">{row.datetime}</td>
                      <td class="py-2.5 pr-3">
                        <span class="inline-flex items-center gap-1">
                          <For each={[...row.conditionIcons]}>
                            {(icon) => (
                              <span class="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 dark:bg-dark-surface-hover">
                                <ConditionIcon name={icon} />
                              </span>
                            )}
                          </For>
                        </span>
                      </td>
                      <td class="py-2.5 pr-3">
                        <Badge variant="success" dot>
                          Completado
                        </Badge>
                      </td>
                      <td class="py-2.5 pr-3 font-semibold text-text-primary dark:text-white">
                        {row.efficiency}%
                      </td>
                      <td class="py-2.5">
                        <div class="flex items-center gap-0.5">
                          <button type="button" class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-fero-blue" aria-label="Ver">
                            <Eye size={14} />
                          </button>
                          <button type="button" class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover" aria-label="Descargar">
                            <Download size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <A
            href="/reports"
            class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-fero-blue hover:underline"
          >
            Ver todos los escenarios
            <ArrowRight size={14} />
          </A>
        </Card>
      </div>
    </div>
  );
}
