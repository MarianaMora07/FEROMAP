import { For, Show } from 'solid-js';
import { AlertTriangle, Leaf, Map } from 'lucide-solid';
import { Button, Card, CardHeader } from '../../design-system/components';
import { optimizationHref } from '../../core/planning/operationalLinks';
import type { RoutePlaybackController } from '../../core/route-playback/useRoutePlayback';
import type { RoutePlaybackModel } from '../../core/route-playback/routePlaybackTypes';
import type { KpiMetrics, ScenarioId } from '../../data/types/simulation';
import { PlanningContextualCta } from '../planning/PlanningContextualCta';
import { LandfillKpiStrip } from '../landfill/LandfillKpiStrip';
import { UncoveredPointsAlert } from '../landfill/UncoveredPointsAlert';
import { RoutePlaybackPanel } from '../route-playback/RoutePlaybackPanel';
import { DurationBreakdownPanel } from './DurationBreakdownPanel';
import { EngineComputationPanel } from './EngineComputationPanel';
import { ExecutiveSummary } from './ExecutiveSummary';
import { PostSimulationActions } from './PostSimulationActions';
import { SimulationMapPanel } from './SimulationMapPanel';
import { SimulationResultsTabs } from './SimulationResultsTabs';
import type { SimulationResultsTabId } from './simulationResultsConfig';

interface PerformanceIndicator {
  id: string;
  label: string;
  value: number;
}

interface ImpactRow {
  metric: string;
  current: string;
  simulated: string;
  delta: number;
}

interface SavingsSummary {
  distanceKm: string;
  timeMin: string;
  fuelL: string;
  co2Kg: string;
}

interface SimulationResultsStepProps {
  hasResults: boolean;
  tab: SimulationResultsTabId;
  onTabChange: (tab: SimulationResultsTabId) => void;
  kpis: KpiMetrics;
  efficiencyValue: number;
  performanceIndicators: PerformanceIndicator[];
  impactRows: ImpactRow[];
  savings: SavingsSummary;
  workdayWarning: string | null;
  simulationId: number | null;
  onNewSimulation: () => void;
  weeklyPlanApproved: boolean;
  operationDate: string;
  scenarioId: ScenarioId;
  scenarioLabel: string;
  playbackOpen: boolean;
  playbackRoutes: RoutePlaybackModel[];
  playback: RoutePlaybackController;
  playbackLoading: boolean;
  playbackError: string | null;
  playbackPreviewMode: boolean;
  onOpenPlayback: () => void;
  onClosePlayback: () => void;
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

export function SimulationResultsStep(props: SimulationResultsStepProps) {
  return (
    <Show
      when={props.hasResults}
      fallback={
        <Card>
          <p class="py-12 text-center text-sm text-text-muted">
            Aún no hay resultados. Vuelve al paso 2 y ejecuta una simulación.
          </p>
        </Card>
      }
    >
      <div class="space-y-4">
        <Show when={props.workdayWarning}>
          {(message) => (
            <div class="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              <AlertTriangle size={18} class="mt-0.5 shrink-0" />
              <p>{message()}</p>
            </div>
          )}
        </Show>
        <UncoveredPointsAlert kpis={props.kpis} />

        <SimulationResultsTabs tab={props.tab} onTabChange={props.onTabChange} />

        <Show when={props.tab === 'summary'}>
          <div class="space-y-4" data-testid="simulation-results-panel-summary">
            <ExecutiveSummary kpis={props.kpis} />
            <div class="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="gap-1.5"
                icon={<Map size={14} />}
                onClick={() => props.onTabChange('map')}
              >
                Ver mapa y recorrido
              </Button>
            </div>
            <div class="grid items-start gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader title="Comparación de rutas" subtitle="Ruta actual vs ruta simulada" />
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted">
                        <th class="pb-2 font-semibold">Métrica</th>
                        <th class="pb-2 font-semibold">Actual</th>
                        <th class="pb-2 font-semibold text-fero-green-dark">Simulado</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-border dark:divide-dark-border">
                      <For each={props.impactRows}>
                        {(row) => (
                          <tr>
                            <td class="py-2.5 text-text-secondary">{row.metric}</td>
                            <td class="py-2.5 text-text-muted">{row.current}</td>
                            <td class="py-2.5">
                              <span class="font-semibold text-fero-green-dark">{row.simulated}</span>
                              <Show when={row.delta !== 0}>
                                <span class="ml-1.5 text-xs font-medium text-fero-green-dark">
                                  {row.delta}%
                                </span>
                              </Show>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
                <div class="mt-3 flex items-start gap-2.5 rounded-lg border border-fero-green/30 bg-fero-green/10 px-3 py-2.5">
                  <Leaf size={18} class="mt-0.5 shrink-0 text-fero-green-dark" />
                  <div>
                    <p class="text-xs font-semibold text-fero-green-dark">Ahorro estimado</p>
                    <p class="mt-0.5 text-sm font-medium text-text-primary dark:text-white">
                      {props.savings.distanceKm} km · {props.savings.timeMin} min · {props.savings.fuelL} L ·{' '}
                      {props.savings.co2Kg} kg CO₂ evitados
                    </p>
                  </div>
                </div>
              </Card>
              <Card padding={false} class="overflow-hidden">
                <div class="px-4 pt-4">
                  <h3 class="font-heading font-semibold text-text-primary dark:text-white">
                    Indicadores de desempeño
                  </h3>
                </div>
                <div class="flex flex-col items-center gap-5 px-4 py-4 sm:flex-row sm:items-center">
                  <EfficiencyGauge value={props.efficiencyValue} />
                  <ul class="w-full flex-1 space-y-3">
                    <For each={props.performanceIndicators}>
                      {(ind) => <MetricBar label={ind.label} value={ind.value} />}
                    </For>
                  </ul>
                </div>
              </Card>
            </div>
            <PostSimulationActions
              simulationId={props.simulationId}
              onNewSimulation={props.onNewSimulation}
            />
          </div>
        </Show>

        <Show when={props.tab === 'map'}>
          <div class="grid items-start gap-4 xl:grid-cols-12" data-testid="simulation-results-panel-map">
            <div class="space-y-4 xl:col-span-8">
              <SimulationMapPanel
                hasResults
                largeMap
                studyAreaFit
                playbackActive={props.playbackOpen}
                playbackRoutes={props.playbackRoutes}
                playback={props.playback}
                playbackLoading={props.playbackLoading}
                onOpenPlayback={props.onOpenPlayback}
              />
            </div>
            <div class="xl:col-span-4">
              <Show
                when={props.playbackOpen}
                fallback={
                  <Card class="flex min-h-[12rem] flex-col items-center justify-center gap-3 p-6 text-center">
                    <p class="text-sm text-text-muted">
                      Reproduce el camión sobre la geometría vial del resultado optimizado.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      class="gap-1.5"
                      onClick={props.onOpenPlayback}
                      loading={props.playbackLoading}
                      data-testid="simulation-open-playback-btn"
                    >
                      Ver recorrido
                    </Button>
                  </Card>
                }
              >
                <RoutePlaybackPanel
                  routes={props.playbackRoutes}
                  playback={props.playback}
                  scenarioId={props.scenarioId}
                  scenarioLabel={props.scenarioLabel}
                  operationDate={props.operationDate}
                  previewMode={props.playbackPreviewMode}
                  loading={props.playbackLoading}
                  error={props.playbackError}
                  onClose={props.onClosePlayback}
                  variant="inline"
                  title="Recorrido simulado"
                />
              </Show>
            </div>
          </div>
        </Show>

        <Show when={props.tab === 'operations'}>
          <div class="space-y-4" data-testid="simulation-results-panel-operations">
            <Show when={props.weeklyPlanApproved}>
              <PlanningContextualCta
                tone="info"
                message="Plan semanal aprobado — lleva el escenario al plan operativo del día."
                href={optimizationHref({ date: props.operationDate })}
                linkLabel="Ver en plan del día"
              />
            </Show>
            <LandfillKpiStrip kpis={props.kpis} />
            <DurationBreakdownPanel kpis={props.kpis} />
          </div>
        </Show>

        <Show when={props.tab === 'engine'}>
          <div data-testid="simulation-results-panel-engine">
            <EngineComputationPanel kpis={props.kpis} />
            <Show when={!props.kpis.engineMetrics}>
              <Card class="mt-4">
                <p class="py-8 text-center text-sm text-text-muted">
                  No hay métricas del motor para esta simulación.
                </p>
              </Card>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
}
