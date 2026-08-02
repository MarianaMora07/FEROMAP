import { For, Show, createMemo, createResource, createSignal, onMount, type JSX } from 'solid-js';
import { A, useSearchParams } from '@solidjs/router';
import {
  AlertTriangle,
  ArrowRight,
  Car,
  CloudRain,
  Download,
  Eye,
  Leaf,
  Pencil,
  Play,
  Route,
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
import { canOptimize } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { fetchMonitoringStatus } from '../../core/api/monitoring';
import { downloadReport } from '../../core/api/reports';
import { initAppData } from '../../core/stores/appStore';
import {
  applySimulationScenario,
  currentKpis,
  currentScenario,
  dispatchRoutesAfterOptimization,
  initSimulationData,
  kpiImpactRows,
  kpiSavingsSummary,
  loadSimulationFromHistory,
  runOptimization,
  simulationState,
} from '../../core/stores/simulationStore';
import {
  buildPerformanceIndicators,
  deriveScenarioId,
  scenarioEfficiencyPct,
  scenarioSummaryIcon,
} from '../../core/utils/simulationScenario';
import { BreakdownReporter, ContingencyResultBanner } from '../contingency/BreakdownReporter';
import { RecentIncidentsPanel } from '../contingency/RecentIncidentsPanel';
import type { ScenarioId } from '../../data/types/simulation';
import {
  defaultConditions,
  durationOptions,
  quickScenariosFromApi,
  rainIntensityOptions,
  scenarioPresetsFromApi,
  simulationConditions,
  simulationSteps,
  wasteLevelOptions,
  type ConditionId,
} from './simulationConfig';
import { SimulationMapPanel } from './SimulationMapPanel';

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

function QuickIcon(props: { icon: 'car' | 'cloud-rain' | 'trash' | 'chart' | 'truck' }) {
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
    case 'truck':
      return wrap(<Truck size={18} />, 'bg-violet-100 text-violet-600');
  }
}

export default function SimulationPage() {
  const [params] = useSearchParams();
  const criticalFromPoints = () => {
    const value = params.critical;
    const raw = Array.isArray(value) ? value[0] : value;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  const vehiclesFromFleet = () => {
    const value = params.vehicles;
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
  const [preset, setPreset] = createSignal(simulationState.scenarioId);
  const [conditions, setConditions] = createSignal(defaultConditions());
  const [rainIntensity, setRainIntensity] = createSignal('alta');
  const [wasteLevel, setWasteLevel] = createSignal('30');
  const [duration, setDuration] = createSignal('4');
  const [hasResults, setHasResults] = createSignal(false);
  const [historyError, setHistoryError] = createSignal<string | null>(null);
  const [dispatchError, setDispatchError] = createSignal<string | null>(null);
  const [incidentsRefreshKey, setIncidentsRefreshKey] = createSignal(0);

  const scenarioPresets = createMemo(() => scenarioPresetsFromApi(simulationState.scenarios));
  const quickScenarios = createMemo(() => quickScenariosFromApi(simulationState.scenarios));
  const activeScenario = () => currentScenario();
  const scenarioIcon = () => scenarioSummaryIcon(simulationState.scenarioId);
  const efficiencyValue = createMemo(() =>
    hasResults() ? scenarioEfficiencyPct(currentKpis()) : 0,
  );
  const performanceIndicators = createMemo(() =>
    hasResults() ? buildPerformanceIndicators(currentKpis()) : [],
  );

  const impactRows = () => kpiImpactRows(currentKpis());
  const savings = () => kpiSavingsSummary(currentKpis());

  const toggleCondition = (id: ConditionId) =>
    setConditions((prev) => ({ ...prev, [id]: !prev[id] }));

  const applyQuick = (id: string) => {
    const scenarioId = id as ScenarioId;
    setPreset(scenarioId);
    applySimulationScenario(scenarioId);
    setStep(1);
  };

  const syncScenarioFromUi = () => {
    const scenarioId = deriveScenarioId(conditions(), preset());
    applySimulationScenario(scenarioId);
    if (preset() === 'custom') return;
    setPreset(scenarioId);
  };

  const handlePresetChange = (value: string) => {
    setPreset(value);
    if (value !== 'custom') {
      applySimulationScenario(value as ScenarioId);
    }
  };

  const handleRun = async () => {
    syncScenarioFromUi();
    setStep(2);
    setDispatchError(null);
    await runOptimization();
    setHasResults(true);
    setStep(3);
  };

  const handleViewHistory = async (simulationId: number) => {
    setHistoryError(null);
    try {
      await loadSimulationFromHistory(simulationId);
      setPreset(simulationState.scenarioId);
      setHasResults(true);
      setStep(3);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'No se pudo cargar la simulación');
    }
  };

  const handleDispatch = async () => {
    setDispatchError(null);
    try {
      await dispatchRoutesAfterOptimization();
      setIncidentsRefreshKey((value) => value + 1);
    } catch (error) {
      setDispatchError(error instanceof Error ? error.message : 'No se pudieron despachar las rutas');
    }
  };

  onMount(() => {
    void Promise.all([initAppData(), initSimulationData()]);
  });

  return (
    <div class="space-y-5">
      <Show when={vehiclesFromFleet() > 0}>
        <div class="rounded-xl border border-fero-green/40 bg-fero-green/10 px-4 py-3">
          <p class="text-sm font-semibold text-fero-green-dark">
            {vehiclesFromFleet()} vehículo{vehiclesFromFleet() === 1 ? '' : 's'} asignable
            {vehiclesFromFleet() === 1 ? '' : 's'} desde la flota
          </p>
          <p class="mt-1 text-sm text-text-secondary">
            La optimización usará camiones disponibles o en ruta, excluyendo mantenimiento.
          </p>
        </div>
      </Show>
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
              <ConditionIcon name={scenarioIcon()} />
            </span>
            <div>
              <p class="text-[10px] font-medium uppercase tracking-wide text-text-muted">Escenario actual</p>
              <p class="text-sm font-semibold text-text-primary dark:text-white">
                {activeScenario()?.label ?? simulationState.scenarioId}
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
            <Button
              variant="primary"
              class="gap-2"
              icon={<Route size={16} />}
              loading={simulationState.isDispatching}
              disabled={!canOptimize(authUser()?.role) || simulationState.lastSimulationId == null}
              onClick={() => void handleDispatch()}
            >
              Despachar rutas
            </Button>
          </Show>
        </div>
      </div>

      <Show when={dispatchError()}>
        <p class="text-sm text-red-600">{dispatchError()}</p>
      </Show>
      <Show when={simulationState.lastDispatch}>
        {(dispatch) => (
          <div class="rounded-xl border border-fero-green/30 bg-fero-green/10 px-4 py-3 text-sm text-fero-green-dark">
            Despachadas {dispatch().count} ruta(s) a operación
            {dispatch().routeIds.length > 0 ? ` (IDs: ${dispatch().routeIds.join(', ')})` : ''}.
          </div>
        )}
      </Show>

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
              onChange={(e) => handlePresetChange(e.currentTarget.value)}
              class="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-text-primary focus:border-fero-blue focus:outline-none dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
            >
              <For each={scenarioPresets()}>{(o) => <option value={o.id}>{o.label}</option>}</For>
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
          <SimulationMapPanel hasResults={hasResults()} />

          <div class="flex flex-col gap-4 xl:col-span-4">
            <Card>
              <CardHeader title="Reportar contingencia" />
              <BreakdownReporter
                vehicles={fleetForBreakdown()}
                onComplete={() => setIncidentsRefreshKey((value) => value + 1)}
              />
            </Card>

            <RecentIncidentsPanel refreshKey={incidentsRefreshKey()} compact />

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
                  <EfficiencyGauge value={efficiencyValue()} />
                  <ul class="w-full flex-1 space-y-3">
                    <For each={performanceIndicators()}>
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
            <For each={quickScenarios()}>
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
          <Show when={historyError()}>
            <p class="mb-3 text-sm text-red-600">{historyError()}</p>
          </Show>
          <div class="overflow-x-auto">
            <table class="w-full min-w-140 text-sm">
              <thead>
                <tr class="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted dark:border-dark-border">
                  <th class="pb-2 pr-3 font-semibold">Escenario</th>
                  <th class="pb-2 pr-3 font-semibold">Fecha</th>
                  <th class="pb-2 pr-3 font-semibold">Tipo</th>
                  <th class="pb-2 pr-3 font-semibold">Resultado</th>
                  <th class="pb-2 pr-3 font-semibold">Ahorro</th>
                  <th class="pb-2 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border dark:divide-dark-border">
                <For each={simulationState.history}>
                  {(row) => (
                    <tr>
                      <td class="py-2.5 pr-3 font-medium text-text-primary dark:text-white">{row.name}</td>
                      <td class="py-2.5 pr-3 text-xs text-text-muted">{row.datetime}</td>
                      <td class="py-2.5 pr-3 text-xs text-text-secondary">
                        {row.contingency ? 'Contingencia' : 'Optimización'}
                      </td>
                      <td class="py-2.5 pr-3">
                        <Badge variant="success" dot>
                          Completado
                        </Badge>
                      </td>
                      <td class="py-2.5 pr-3 font-semibold text-text-primary dark:text-white">
                        {row.efficiency > 0 ? `${row.efficiency}%` : '—'}
                      </td>
                      <td class="py-2.5">
                        <div class="flex items-center gap-0.5">
                          <button
                            type="button"
                            class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-fero-blue disabled:opacity-50"
                            aria-label={`Ver simulación #${row.id}`}
                            disabled={simulationState.isOptimizing}
                            onClick={() => void handleViewHistory(row.id)}
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            type="button"
                            class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover"
                            aria-label="Descargar reporte CSV"
                            title="Exportar simulaciones (CSV)"
                            onClick={() => void downloadReport('csv')}
                          >
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
