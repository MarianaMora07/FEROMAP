import { For, Show, createSignal } from 'solid-js';
import {
  Sparkles,
  MapPin,
  Route,
  Clock,
  Weight,
  Truck,
  Fuel,
  Leaf,
  Layers,
  Maximize2,
  Plus,
  Minus,
  Crosshair,
  CheckCircle2,
  Trash2,
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
import { UNARE_CENTER } from '../../data/types/geo';
import {
  algorithms,
  availableVehicles,
  comparisonRows,
  constraints as constraintDefs,
  mapLegendContainers,
  mapLegendVehicles,
  objectives,
  optimizationTabs,
  resultsTotals,
  routeResults,
  savingsBanner,
  scenarioInfo,
  type OptimizationTabId,
} from '../../data/mock/optimization';

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

function ParametersForm(props: { onGenerate: () => void }) {
  const [checks, setChecks] = createSignal(
    Object.fromEntries(constraintDefs.map((c) => [c.id, c.checked])) as Record<string, boolean>,
  );

  const toggle = (id: string) => setChecks((prev) => ({ ...prev, [id]: !prev[id] }));

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
          value="2026-06-25"
        />

        <div>
          <FieldLabel>Vehículos disponibles</FieldLabel>
          <div class="flex flex-wrap gap-2 rounded-md border border-border bg-surface px-3 py-2.5 dark:bg-dark-surface-hover dark:border-dark-border">
            <For each={availableVehicles}>
              {(v) => (
                <span class={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${vehicleToneClass[v.tone]}`}>
                  {v.id}
                </span>
              )}
            </For>
          </div>
        </div>

        <SelectField label="Algoritmo de optimización" name="algorithm" value="aco">
          <For each={algorithms}>{(a) => <option value={a.id}>{a.label}</option>}</For>
        </SelectField>

        <SelectField label="Objetivo principal" name="objective" value="distance_time">
          <For each={objectives}>{(o) => <option value={o.id}>{o.label}</option>}</For>
        </SelectField>

        <div>
          <FieldLabel>Restricciones (opcionales)</FieldLabel>
          <ul class="space-y-2.5">
            <For each={constraintDefs}>
              {(item) => (
                <li>
                  <label class="flex cursor-pointer items-center gap-2.5 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      class="size-4 rounded border-border accent-fero-green-mid"
                      checked={checks()[item.id]}
                      onChange={() => toggle(item.id)}
                    />
                    {item.label}
                  </label>
                </li>
              )}
            </For>
          </ul>
        </div>

        <Button type="submit" variant="gradient" size="lg" class="w-full font-semibold" icon={<Sparkles size={18} />}>
          Generar ruta óptima
        </Button>
      </form>
    </Card>
  );
}

function ScenarioInfoCard() {
  return (
    <Card>
      <CardHeader title="Información del escenario" />
      <ul class="space-y-3">
        <For each={scenarioInfo}>
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

function RouteMap() {
  const [lng, lat] = UNARE_CENTER;
  const delta = 0.035;
  const bbox = `${lng - delta}%2C${lat - delta}%2C${lng + delta}%2C${lat + delta}`;

  return (
    <Card padding={false} class="overflow-hidden">
      <div class="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 class="font-heading font-semibold text-text-primary dark:text-white">
          Vista de la ruta óptima
        </h3>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="hidden items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-text-secondary sm:inline-flex"
          >
            <Layers size={14} />
            Capas
          </button>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary"
            aria-label="Pantalla completa"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      <div class="relative h-85 bg-slate-100 dark:bg-slate-900 lg:h-95">
        <iframe
          title="Mapa de ruta óptima Unare"
          class="h-full w-full border-0"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`}
        />
        <div class="absolute right-3 top-3 flex flex-col overflow-hidden rounded-md border border-border bg-surface shadow-sm dark:bg-dark-surface">
          <button type="button" class="flex h-8 w-8 items-center justify-center text-text-secondary hover:bg-surface-hover" aria-label="Acercar">
            <Plus size={14} />
          </button>
          <button type="button" class="flex h-8 w-8 items-center justify-center border-t border-border text-text-secondary hover:bg-surface-hover" aria-label="Alejar">
            <Minus size={14} />
          </button>
          <button type="button" class="flex h-8 w-8 items-center justify-center border-t border-border text-text-secondary hover:bg-surface-hover" aria-label="Centrar">
            <Crosshair size={14} />
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-xs text-text-secondary">
        <For each={mapLegendVehicles}>
          {(v) => (
            <span class={`inline-flex items-center gap-1.5 font-medium ${v.class}`}>
              <Truck size={14} />
              {v.id}
            </span>
          )}
        </For>
        <span class="hidden h-4 w-px bg-border sm:block" />
        <For each={mapLegendContainers}>
          {(c) => (
            <span class={`inline-flex items-center gap-1.5 ${c.class}`}>
              <Trash2 size={14} />
              {c.label}
            </span>
          )}
        </For>
      </div>
    </Card>
  );
}

function ResultsCard() {
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
        <For each={routeResults}>
          {(route) => (
            <div class="rounded-lg border border-border p-3 dark:border-dark-border">
              <div class="mb-3 flex items-center justify-between gap-2">
                <span class={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${vehicleToneClass[route.tone]}`}>
                  {route.id}
                </span>
                <span class={`flex h-9 w-9 items-center justify-center rounded-lg ${vehicleIconClass[route.tone]}`}>
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
            <p class="font-semibold text-text-primary dark:text-white">{resultsTotals.distanceKm} km</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Clock size={16} class="text-fero-blue" />
          <div>
            <p class="text-xs text-text-muted">Tiempo</p>
            <p class="font-semibold text-text-primary dark:text-white">{resultsTotals.duration}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Weight size={16} class="text-fero-blue" />
          <div>
            <p class="text-xs text-text-muted">Toneladas</p>
            <p class="font-semibold text-text-primary dark:text-white">{resultsTotals.tons} ton</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Fuel size={16} class="text-fero-blue" />
          <div>
            <p class="text-xs text-text-muted">Combustible</p>
            <p class="font-semibold text-text-primary dark:text-white">{resultsTotals.fuelL} L</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ComparisonCard() {
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
            <For each={comparisonRows}>
              {(row) => (
                <tr>
                  <td class="py-3 text-text-secondary">{row.metric}</td>
                  <td class="py-3 text-text-muted">{row.current}</td>
                  <td class="py-3">
                    <span class="font-semibold text-fero-green-dark">{row.optimized}</span>
                    <span class="ml-2 text-xs font-medium text-fero-green-dark">↓ {Math.abs(row.delta)}%</span>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      <div class="mt-4 flex items-start gap-2 rounded-lg bg-fero-green/15 px-3 py-3 text-sm text-fero-green-dark">
        <Leaf size={18} class="mt-0.5 shrink-0" />
        <p class="font-medium leading-snug">{savingsBanner.text}</p>
      </div>
    </Card>
  );
}

function PlaceholderTab(props: { title: string; description: string }) {
  return (
    <Card class="py-16 text-center">
      <p class="font-heading font-semibold text-text-primary dark:text-white">{props.title}</p>
      <p class="mt-1 text-sm text-text-muted">{props.description}</p>
    </Card>
  );
}

export default function OptimizationPage() {
  const [tab, setTab] = createSignal<OptimizationTabId>('nueva');
  const [generated, setGenerated] = createSignal(true);

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

      <Show when={tab() === 'nueva'}>
        <div class="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
          <div class="space-y-4 xl:col-span-3">
            <ParametersForm onGenerate={() => setGenerated(true)} />
            <ScenarioInfoCard />
          </div>

          <div class="space-y-4 xl:col-span-9">
            <RouteMap />
            <Show when={generated()}>
              <div class="grid grid-cols-1 items-start gap-4 lg:grid-cols-5">
                <div class="lg:col-span-3">
                  <ResultsCard />
                </div>
                <div class="lg:col-span-2">
                  <ComparisonCard />
                </div>
              </div>
            </Show>
          </div>
        </div>
      </Show>

      <Show when={tab() === 'historial'}>
        <PlaceholderTab
          title="Historial de optimizaciones"
          description="Aquí se listarán las optimizaciones ejecutadas anteriormente."
        />
      </Show>

      <Show when={tab() === 'escenarios'}>
        <PlaceholderTab
          title="Escenarios guardados"
          description="Aquí podrá reutilizar configuraciones de optimización guardadas."
        />
      </Show>
    </div>
  );
}
