import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import {
  Sparkles,
  MapPin,
  Route,
  Clock,
  Weight,
  Truck,
  Fuel,
  Leaf,
  CheckCircle2,
  Send,
  Loader2,
} from 'lucide-solid';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ProgressBar,
  SelectField,
  TextField,
} from '../../design-system/components';
import { canOptimize } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { appState } from '../../core/stores/appStore';
import {
  dispatchOptimizationResult,
  executeOptimization,
  initOptimizationPage,
  loadOptimizationFromHistory,
  optimizationState,
  setOptimizationScenario,
  updateOptimizationPreset,
} from '../../core/stores/optimizationStore';
import {
  buildComparisonRows,
  buildResultsTotals,
  buildRouteResults,
  buildSavingsBanner,
  buildScenarioInfoRows,
} from '../../core/utils/optimizationResults';
import {
  algorithms,
  constraints as constraintDefs,
  objectives,
  optimizationTabs,
  type OptimizationTabId,
} from '../../data/mock/optimization';
import type { OptimizationConstraints } from '../../core/api/optimization';
import type { ScenarioId } from '../../data/types/simulation';
import { OptimizationRouteMap } from './OptimizationRouteMap';

const vehicleToneClass = {
  blue: 'bg-fero-blue/10 text-fero-blue border-fero-blue/20',
  green: 'bg-fero-green/15 text-fero-green-dark border-fero-green/30',
  purple: 'bg-violet-100 text-violet-700 border-violet-200',
};

const vehicleIconClass = {
  blue: 'bg-fero-blue/10 text-fero-blue',
  green: 'bg-fero-green/15 text-fero-green-dark',
  purple: 'bg-violet-100 text-violet-600',
};

const scenarioIconMap = {
  'map-pin': MapPin,
  route: Route,
  clock: Clock,
  weight: Weight,
} as const;

function FieldLabel(props: { children: string }) {
  return (
    <p class="mb-1.5 text-sm font-semibold text-text-primary dark:text-white">{props.children}</p>
  );
}

function ParametersForm(props: { onGenerate: () => void; disabled?: boolean }) {
  const preset = () => optimizationState.preset;
  const context = () => optimizationState.context;
  const assignableVehicles = () => context()?.assignableVehicles ?? [];

  const toggleConstraint = (id: keyof OptimizationConstraints) => {
    updateOptimizationPreset({
      constraints: { ...preset().constraints, [id]: !preset().constraints[id] },
    });
  };

  return (
    <Card>
      <CardHeader title="Parámetros de optimización" />
      <form
        class="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          props.onGenerate();
        }}
      >
        <TextField
          label="Fecha de operación"
          type="date"
          name="operationDate"
          value={preset().operationDate}
          onInput={(e) => updateOptimizationPreset({ operationDate: e.currentTarget.value })}
        />

        <div>
          <FieldLabel>Vehículos disponibles ({assignableVehicles().length})</FieldLabel>
          <div class="flex flex-wrap gap-2 rounded-md border border-border bg-surface px-3 py-2.5 dark:bg-dark-surface-hover dark:border-dark-border">
            <Show
              when={assignableVehicles().length > 0}
              fallback={<span class="text-xs text-text-muted">Sin vehículos asignables</span>}
            >
              <For each={assignableVehicles()}>
                {(v, index) => {
                  const tones = ['blue', 'green', 'purple'] as const;
                  const tone = tones[index() % tones.length]!;
                  return (
                    <span
                      class={`inline-flex flex-col rounded-full border px-2.5 py-0.5 text-xs font-semibold ${vehicleToneClass[tone]}`}
                      title={v.driver !== '—' ? v.driver : 'Sin conductor asignado'}
                    >
                      <span>{v.id}</span>
                      <Show when={v.driver && v.driver !== '—'}>
                        <span class="text-[10px] font-medium opacity-80">{v.driver}</span>
                      </Show>
                    </span>
                  );
                }}
              </For>
            </Show>
          </div>
        </div>

        <SelectField
          label="Escenario operativo"
          name="scenario"
          value={preset().scenarioId}
          onChange={(e) => setOptimizationScenario(e.currentTarget.value as ScenarioId)}
        >
          <For each={context()?.scenarios ?? []}>
            {(scenario) => <option value={scenario.id}>{scenario.label}</option>}
          </For>
        </SelectField>

        <SelectField
          label="Algoritmo de optimización"
          name="algorithm"
          value={preset().algorithm}
          onChange={(e) => updateOptimizationPreset({ algorithm: e.currentTarget.value })}
        >
          <For each={algorithms}>{(a) => <option value={a.id}>{a.label}</option>}</For>
        </SelectField>

        <SelectField
          label="Objetivo principal"
          name="objective"
          value={preset().objective}
          onChange={(e) => updateOptimizationPreset({ objective: e.currentTarget.value })}
        >
          <For each={objectives}>{(o) => <option value={o.id}>{o.label}</option>}</For>
        </SelectField>

        <div>
          <FieldLabel>Restricciones (guardadas localmente)</FieldLabel>
          <ul class="space-y-2.5">
            <For each={constraintDefs}>
              {(item) => (
                <li>
                  <label class="flex cursor-pointer items-center gap-2.5 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      class="size-4 rounded border-border accent-fero-green-mid"
                      checked={preset().constraints[item.id as keyof OptimizationConstraints]}
                      onChange={() => toggleConstraint(item.id as keyof OptimizationConstraints)}
                    />
                    {item.label}
                  </label>
                </li>
              )}
            </For>
          </ul>
        </div>

        <Button
          type="submit"
          variant="gradient"
          size="lg"
          class="w-full font-semibold"
          icon={optimizationState.isOptimizing ? <Loader2 size={18} class="animate-spin" /> : <Sparkles size={18} />}
          disabled={props.disabled || optimizationState.isOptimizing || !canOptimize(authUser()?.role)}
        >
          {optimizationState.isOptimizing
            ? `Optimizando… ${optimizationState.optimizationProgress}%`
            : 'Generar ruta óptima'}
        </Button>
      </form>
    </Card>
  );
}

function ScenarioInfoCard() {
  const context = () => optimizationState.context;
  const kpis = () => optimizationState.kpis;
  const rows = createMemo(() =>
    buildScenarioInfoRows(
      context()?.pointsToVisit ?? 0,
      kpis(),
      context()?.pointsContext.criticalCount ?? 0,
    ),
  );

  return (
    <Card>
      <CardHeader title="Información del escenario" />
      <ul class="space-y-3">
        <For each={rows()}>
          {(row) => {
            const Icon = scenarioIconMap[row.icon];
            return (
              <li class="flex items-center justify-between gap-3 text-sm">
                <span class="flex items-center gap-2 text-text-secondary">
                  <span class="flex h-8 w-8 items-center justify-center rounded-md bg-fero-blue/10 text-fero-blue">
                    <Icon size={16} />
                  </span>
                  {row.label}
                </span>
                <span class="font-semibold text-text-primary dark:text-white">{row.value}</span>
              </li>
            );
          }}
        </For>
      </ul>
    </Card>
  );
}

function ResultsCard(props: {
  routeResults: ReturnType<typeof buildRouteResults>;
  totals: ReturnType<typeof buildResultsTotals>;
  driverByVehicleId?: Record<string, string>;
}) {
  return (
    <Card>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-heading font-semibold text-text-primary dark:text-white">
          Resultados de la optimización
        </h3>
        <Badge variant="success" class="gap-1">
          <CheckCircle2 size={12} />
          Ruta óptima encontrada
        </Badge>
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <For each={props.routeResults}>
          {(route) => (
            <div class="rounded-lg border border-border p-3 dark:border-dark-border">
              <div class="mb-3 flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <span class={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${vehicleToneClass[route.tone]}`}>
                    {route.id}
                  </span>
                  <Show when={props.driverByVehicleId?.[route.id]}>
                    <p class="mt-1 text-[11px] text-text-muted">{props.driverByVehicleId![route.id]}</p>
                  </Show>
                </div>
                <span class={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${vehicleIconClass[route.tone]}`}>
                  <Truck size={18} />
                </span>
              </div>
              <dl class="space-y-1.5 text-sm">
                <div class="flex justify-between gap-2">
                  <dt class="text-text-muted">Distancia</dt>
                  <dd class="font-semibold text-text-primary dark:text-white">{route.distanceKm} km</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-text-muted">Tiempo</dt>
                  <dd class="font-semibold text-text-primary dark:text-white">{route.duration}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-text-muted">Puntos</dt>
                  <dd class="font-semibold text-text-primary dark:text-white">{route.points}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-text-muted">Toneladas</dt>
                  <dd class="font-semibold text-text-primary dark:text-white">{route.tons} ton</dd>
                </div>
              </dl>
              <div class="mt-3">
                <div class="mb-1 flex justify-between text-xs">
                  <span class="text-text-muted">Capacidad</span>
                  <span class="font-medium text-text-secondary">{route.capacityPct}%</span>
                </div>
                <ProgressBar value={route.capacityPct} color="green" size="sm" />
              </div>
            </div>
          )}
        </For>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 px-3 py-3 text-sm dark:bg-dark-surface-hover sm:grid-cols-4">
        <div class="flex items-center gap-2">
          <Route size={16} class="text-fero-blue" />
          <div>
            <p class="text-xs text-text-muted">Distancia</p>
            <p class="font-semibold text-text-primary dark:text-white">{props.totals.distanceKm} km</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Clock size={16} class="text-fero-blue" />
          <div>
            <p class="text-xs text-text-muted">Tiempo</p>
            <p class="font-semibold text-text-primary dark:text-white">{props.totals.duration}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Weight size={16} class="text-fero-blue" />
          <div>
            <p class="text-xs text-text-muted">Toneladas</p>
            <p class="font-semibold text-text-primary dark:text-white">{props.totals.tons} ton</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Fuel size={16} class="text-fero-blue" />
          <div>
            <p class="text-xs text-text-muted">Combustible</p>
            <p class="font-semibold text-text-primary dark:text-white">{props.totals.fuelL} L</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ComparisonCard(props: {
  rows: ReturnType<typeof buildComparisonRows>;
  savingsText: string;
}) {
  return (
    <Card class="h-full">
      <CardHeader title="Comparación de rutas" />
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
              <th class="pb-2 font-semibold">Métrica</th>
              <th class="pb-2 font-semibold">Ruta actual</th>
              <th class="pb-2 font-semibold text-fero-green-dark">Ruta optimizada</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <For each={props.rows}>
              {(row) => (
                <tr>
                  <td class="py-3 text-text-secondary">{row.metric}</td>
                  <td class="py-3 text-text-muted">{row.current}</td>
                  <td class="py-3">
                    <span class="font-semibold text-fero-green-dark">{row.optimized}</span>
                    <span class="ml-2 text-xs font-medium text-fero-green-dark">
                      {row.delta >= 0 ? '↑' : '↓'} {Math.abs(row.delta)}%
                    </span>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      <div class="mt-4 flex items-start gap-2 rounded-lg bg-fero-green/15 px-3 py-3 text-sm text-fero-green-dark">
        <Leaf size={18} class="mt-0.5 shrink-0" />
        <p class="font-medium leading-snug">{props.savingsText}</p>
      </div>
    </Card>
  );
}

function HistoryTab() {
  const [error, setError] = createSignal<string | null>(null);

  const handleLoad = async (id: number) => {
    setError(null);
    try {
      await loadOptimizationFromHistory(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la optimización');
    }
  };

  return (
    <Card>
      <CardHeader title="Historial de optimizaciones" />
      <Show when={error()}>
        <p class="mb-3 text-sm text-red-500">{error()}</p>
      </Show>
      <ul class="divide-y divide-border">
        <For each={optimizationState.history}>
          {(row) => (
            <li class="flex items-center justify-between gap-3 py-3">
              <div>
                <p class="text-sm font-semibold text-text-primary dark:text-white">{row.name}</p>
                <p class="text-xs text-text-muted">{row.datetime} · {row.efficiency}% ahorro</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => void handleLoad(row.id)}>
                Ver
              </Button>
            </li>
          )}
        </For>
      </ul>
      <Show when={optimizationState.history.length === 0}>
        <p class="py-8 text-center text-sm text-text-muted">Aún no hay optimizaciones guardadas.</p>
      </Show>
    </Card>
  );
}

function ScenariosTab() {
  const scenarios = () => optimizationState.context?.scenarios ?? [];

  return (
    <Card>
      <CardHeader title="Escenarios operativos" />
      <ul class="space-y-3">
        <For each={scenarios()}>
          {(scenario) => (
            <li class="rounded-lg border border-border p-3 dark:border-dark-border">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-semibold text-text-primary dark:text-white">{scenario.label}</p>
                  <p class="mt-1 text-sm text-text-secondary">{scenario.description}</p>
                  <p class="mt-2 text-xs text-text-muted">
                    Tráfico ×{scenario.trafficMultiplier} · Llenado +{scenario.fillLevelBoost}%
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={optimizationState.preset.scenarioId === scenario.id ? 'primary' : 'secondary'}
                  onClick={() => setOptimizationScenario(scenario.id)}
                >
                  {optimizationState.preset.scenarioId === scenario.id ? 'Activo' : 'Usar'}
                </Button>
              </div>
            </li>
          )}
        </For>
      </ul>
    </Card>
  );
}

export default function OptimizationPage() {
  const [tab, setTab] = createSignal<OptimizationTabId>('nueva');
  const [dispatchError, setDispatchError] = createSignal<string | null>(null);

  const hasResults = () => optimizationState.kpis != null;
  const kpis = () => optimizationState.kpis!;
  const routeResults = createMemo(() => {
    if (!hasResults()) return [];
    const optimized =
      optimizationState.lastResult?.routes.optimized ?? {
        type: 'FeatureCollection' as const,
        features: appState.routes.features.filter((feature) => feature.properties.type === 'optimized'),
      };
    return buildRouteResults(optimized, kpis());
  });
  const comparisonRows = createMemo(() => (hasResults() ? buildComparisonRows(kpis()) : []));
  const totals = createMemo(() => (hasResults() ? buildResultsTotals(kpis()) : null));
  const savingsText = createMemo(() => (hasResults() ? buildSavingsBanner(kpis()) : ''));
  const driverByVehicleId = createMemo(() => {
    const map: Record<string, string> = {};
    for (const vehicle of optimizationState.context?.vehicles ?? []) {
      if (vehicle.driver && vehicle.driver !== '—') {
        map[vehicle.id] = vehicle.driver;
      }
    }
    return map;
  });

  onMount(() => {
    void initOptimizationPage();
  });

  const handleGenerate = async () => {
    setDispatchError(null);
    try {
      await executeOptimization();
    } catch {
      // error stored in optimizationState.error
    }
  };

  const handleDispatch = async () => {
    setDispatchError(null);
    try {
      await dispatchOptimizationResult();
    } catch (error) {
      setDispatchError(error instanceof Error ? error.message : 'No se pudieron despachar las rutas');
    }
  };

  return (
    <div class="space-y-4 md:space-y-5">
      <div class="flex gap-1 overflow-x-auto border-b border-border">
        <For each={[...optimizationTabs]}>
          {(item) => (
            <button
              type="button"
              class={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab() === item.id
                  ? 'border-fero-green-mid text-fero-green-dark'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          )}
        </For>
      </div>

      <Show when={optimizationState.error}>
        <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {optimizationState.error}
        </div>
      </Show>

      <Show when={tab() === 'nueva'}>
        <div class="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
          <div class="space-y-4 xl:col-span-3">
            <ParametersForm
              onGenerate={() => void handleGenerate()}
              disabled={optimizationState.isLoadingContext}
            />
            <ScenarioInfoCard />
            <Show when={optimizationState.isOptimizing}>
              <Card>
                <CardHeader title="Progreso del motor" />
                <ProgressBar value={optimizationState.optimizationProgress} color="green" />
                <ul class="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs text-text-muted">
                  <For each={optimizationState.logs}>
                    {(log) => (
                      <li>
                        <span class="text-text-secondary">{log.timestamp}</span> — {log.message}
                      </li>
                    )}
                  </For>
                </ul>
              </Card>
            </Show>
          </div>

          <div class="space-y-4 xl:col-span-9">
            <OptimizationRouteMap hasResults={hasResults()} routeResults={routeResults()} />
            <Show when={hasResults()}>
              <div class="flex flex-wrap items-center justify-end gap-2">
                <Show when={optimizationState.lastDispatch}>
                  {(dispatch) => (
                    <Badge variant="success">
                      Despachadas {dispatch().count} ruta(s)
                    </Badge>
                  )}
                </Show>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Send size={16} />}
                  disabled={
                    optimizationState.isDispatching ||
                    optimizationState.lastSimulationId == null ||
                    !canOptimize(authUser()?.role)
                  }
                  onClick={() => void handleDispatch()}
                >
                  {optimizationState.isDispatching ? 'Despachando…' : 'Despachar rutas'}
                </Button>
              </div>
              <Show when={dispatchError()}>
                <p class="text-sm text-red-500">{dispatchError()}</p>
              </Show>
              <div class="grid grid-cols-1 items-start gap-4 lg:grid-cols-5">
                <div class="lg:col-span-3">
                  <ResultsCard
                    routeResults={routeResults()}
                    totals={totals()!}
                    driverByVehicleId={driverByVehicleId()}
                  />
                </div>
                <div class="lg:col-span-2">
                  <ComparisonCard rows={comparisonRows()} savingsText={savingsText()} />
                </div>
              </div>
            </Show>
          </div>
        </div>
      </Show>

      <Show when={tab() === 'historial'}>
        <HistoryTab />
      </Show>

      <Show when={tab() === 'escenarios'}>
        <ScenariosTab />
      </Show>
    </div>
  );
}
