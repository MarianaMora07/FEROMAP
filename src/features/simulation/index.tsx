import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { A, useSearchParams } from '@solidjs/router';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CloudRain,
  Leaf,
  Play,
  Plus,
  Square,
  Trash2,
  TrendingUp,
  Truck,
  Users,
  Wrench,
} from 'lucide-solid';
import {
  Button,
  Card,
  CardHeader,
  LoadingPanel,
} from '../../design-system/components';
import { fetchCollectionPointsSummary } from '../../core/api/collectionPoints';
import { countSimulationReadyVehicles, fetchVehicles } from '../../core/api/vehicles';
import { canOptimize } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { fetchMonitoringStatus } from '../../core/api/monitoring';
import { fetchCurrentWeeklyPlan } from '../../core/api/planning';
import { optimizationHref } from '../../core/planning/operationalLinks';
import { todayIso } from '../../core/planning/planningUx';
import {
  applySimulationScenario,
  cancelOptimization,
  currentKpis,
  executionNarrative,
  executionPhaseIndex,
  executionTotalPhases,
  initSimulationData,
  isSimulationBusy,
  kpiImpactRows,
  kpiSavingsSummary,
  loadSimulationFromHistory,
  runOptimization,
  simulationState,
  wasExecutionCancelled,
} from '../../core/stores/simulationStore';
import {
  deriveScenarioId,
  buildPerformanceIndicators,
  scenarioEfficiencyPct,
} from '../../core/utils/simulationScenario';
import {
  buildSimulationReadiness,
  buildSimulationRunParameters,
  describeDerivedScenario,
  type SimulationReadiness,
} from '../../core/utils/simulationWizard';
import { parseSimulationIdParam } from '../../core/utils/simulationLinks';
import { BreakdownReporter, ContingencyResultBanner } from '../contingency/BreakdownReporter';
import { RecentIncidentsPanel } from '../contingency/RecentIncidentsPanel';
import type { ScenarioId } from '../../data/types/simulation';
import { ConfigurationSummaryPanel } from './ConfigurationSummaryPanel';
import { ExecutiveSummary } from './ExecutiveSummary';
import { DurationBreakdownPanel } from './DurationBreakdownPanel';
import { EngineComputationPanel } from './EngineComputationPanel';
import { ExecutionPanel } from './ExecutionPanel';
import { PostSimulationActions } from './PostSimulationActions';
import { SimulationHistoryPanel } from './SimulationHistoryPanel';
import { WeeklyPlanTab } from './WeeklyPlanTab';
import { PlanningGlossaryStrip } from '../planning/PlanningGlossaryStrip';
import { PlanningContextualCta } from '../planning/PlanningContextualCta';
import { ThesisVsOperationsNotice } from '../planning/ThesisVsOperationsNotice';
import { WizardStepNav } from './WizardStepNav';
import { CancelExecutionConfirmDialog } from './CancelExecutionConfirmDialog';
import {
  EXECUTION_CANCEL_MESSAGES,
  formatWizardExecutionSubstatus,
  tryGetExecutionPhase,
} from './executionPhases';

import {
  conditionsForScenario,
  defaultConditions,
  durationOptions,
  operatorsShortageOptions,
  acoAntsOptions,
  acoIterationsOptions,
  acoPresetOptions,
  acoValuesForPreset,
  CREW_SHORTAGE_NARRATIVE,
  rainIntensityOptions,
  resolveDefaultAcoPreset,
  simulationConditions,
  wasteLevelOptions,
  type AcoPresetId,
  type ConditionId,
} from './simulationConfig';

type SimulationPageTab = 'flow' | 'history' | 'weekly';

const simulationPageTabs: { id: SimulationPageTab; label: string; hint: string }[] = [
  { id: 'flow', label: 'Evaluar escenarios', hint: 'Comparar condiciones con el motor ACO (sin despacho)' },
  { id: 'weekly', label: 'Plan semanal', hint: 'Directivo — aprobar la semana' },
  { id: 'history', label: 'Historial de simulaciones', hint: 'Escenarios ejecutados para análisis' },
];

function Toggle(props: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
  icon: JSX.Element;
}) {
  return (
    <div
      class="flex cursor-pointer items-start justify-between gap-3 py-2"
      role="button"
      tabIndex={0}
      aria-pressed={props.checked}
      onClick={props.onChange}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          props.onChange();
        }
      }}
    >
      <span class="flex min-w-0 items-start gap-2.5 text-sm text-text-secondary">
        <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-text-secondary dark:bg-dark-surface-hover">
          {props.icon}
        </span>
        <span class="min-w-0">
          <span class="block font-medium text-text-primary dark:text-white">{props.label}</span>
          <Show when={props.description}>
            <span class="mt-0.5 block text-xs text-text-muted">{props.description}</span>
          </Show>
        </span>
      </span>
      <span
        role="switch"
        aria-checked={props.checked}
        aria-label={props.label}
        class={`pointer-events-none relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          props.checked ? 'bg-fero-green-dark' : 'bg-slate-300 dark:bg-slate-600'
        }`}
      >
        <span
          class={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            props.checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </div>
  );
}

function ConditionRowIcon(props: { icon: (typeof simulationConditions)[number]['icon'] }) {
  switch (props.icon) {
    case 'cloud-rain':
      return <CloudRain size={14} />;
    case 'truck':
      return <Truck size={14} />;
    case 'trash':
      return <Trash2 size={14} />;
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

async function fetchReadiness() {
  const [vehicles, pointsSummary] = await Promise.all([
    fetchVehicles(),
    fetchCollectionPointsSummary(),
  ]);
  const activePoints = pointsSummary.kpis.total - pointsSummary.kpis.fueraDeServicio;
  return buildSimulationReadiness(countSimulationReadyVehicles(vehicles), activePoints);
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

  const initialAcoPreset = resolveDefaultAcoPreset();
  const initialAcoValues = acoValuesForPreset(initialAcoPreset);

  const [step, setStep] = createSignal(1);
  const [pageTab, setPageTab] = createSignal<SimulationPageTab>(
    params.view === 'history' ? 'history' : params.view === 'weekly' ? 'weekly' : 'flow',
  );
  const [conditions, setConditions] = createSignal(defaultConditions());
  const [rainIntensity, setRainIntensity] = createSignal('alta');
  const [wasteLevel, setWasteLevel] = createSignal('30');
  const [duration, setDuration] = createSignal('4');
  const [crewShortageEnabled, setCrewShortageEnabled] = createSignal(false);
  const [operatorsShortage, setOperatorsShortage] = createSignal('2');
  const [acoPreset, setAcoPreset] = createSignal<AcoPresetId>(initialAcoPreset);
  const [acoAnts, setAcoAnts] = createSignal(initialAcoValues.ants);
  const [acoIterations, setAcoIterations] = createSignal(initialAcoValues.iterations);
  const [hasResults, setHasResults] = createSignal(false);
  const [historyError, setHistoryError] = createSignal<string | null>(null);
  const [runError, setRunError] = createSignal<string | null>(null);
  const [runNotice, setRunNotice] = createSignal<string | null>(null);
  const [incidentsRefreshKey, setIncidentsRefreshKey] = createSignal(0);
  const [cancelConfirmOpen, setCancelConfirmOpen] = createSignal(false);
  const [weeklyPlanBridge] = createResource(() =>
    fetchCurrentWeeklyPlan().catch(() => null),
  );
  const [readiness, setReadiness] = createSignal<SimulationReadiness | undefined>();
  const [loadingReadiness, setLoadingReadiness] = createSignal(true);
  const [monitoringData, setMonitoringData] = createSignal<Awaited<ReturnType<typeof fetchMonitoringStatus>> | undefined>();

  const loadReadiness = async () => {
    setLoadingReadiness(true);
    try {
      setReadiness(await fetchReadiness());
    } catch {
      setReadiness(undefined);
    } finally {
      setLoadingReadiness(false);
    }
  };

  const loadMonitoring = async () => {
    try {
      setMonitoringData(await fetchMonitoringStatus());
    } catch {
      setMonitoringData(undefined);
    }
  };

  const fleetForBreakdown = () =>
    (monitoringData()?.liveFleet ?? []).map((v) => ({
      id: v.id,
      routeId: v.routeId,
      status: v.status,
    }));

  const derivedScenario = createMemo(() =>
    describeDerivedScenario(conditions(), simulationState.scenarios),
  );
  const simulationParams = () =>
    buildSimulationRunParameters({
      rainIntensity: rainIntensity(),
      wasteLevel: wasteLevel(),
      durationHours: duration(),
      conditions: conditions(),
      scenarioId: derivedScenario().scenarioId,
      crewShortageEnabled: crewShortageEnabled(),
      operatorsShortage: operatorsShortage(),
      acoPreset: acoPreset(),
      acoAnts: acoAnts(),
      acoIterations: acoIterations(),
    });

  const panelParams = () => ({
    rainIntensity: rainIntensity(),
    wasteLevel: wasteLevel(),
    durationHours: duration(),
    crewShortageEnabled: crewShortageEnabled(),
    operatorsShortage: operatorsShortage(),
    acoPreset: acoPreset(),
    acoAnts: acoAnts(),
    acoIterations: acoIterations(),
    fleetAssignableCount: vehiclesFromFleet(),
    criticalPointCount: criticalFromPoints(),
  });

  const applyAcoPreset = (preset: AcoPresetId) => {
    setAcoPreset(preset);
    const match = acoPresetOptions.find((option) => option.value === preset);
    if (match && preset !== 'custom') {
      setAcoAnts(String(match.ants));
      setAcoIterations(String(match.iterations));
    }
  };

  const handleAcoAntsChange = (value: string) => {
    setAcoAnts(value);
    setAcoPreset('custom');
  };

  const handleAcoIterationsChange = (value: string) => {
    setAcoIterations(value);
    setAcoPreset('custom');
  };
  const efficiencyValue = createMemo(() =>
    hasResults() ? scenarioEfficiencyPct(currentKpis()) : 0,
  );
  const performanceIndicators = createMemo(() =>
    hasResults() ? buildPerformanceIndicators(currentKpis()) : [],
  );
  const impactRows = () => kpiImpactRows(currentKpis());
  const savings = () => kpiSavingsSummary(currentKpis());
  const workdayWarning = () => {
    const kpis = currentKpis();
    if (!kpis.exceedsWorkday?.optimized) return null;
    const hours = kpis.workdayHours ?? 8;
    const optimized = kpis.durationHours.optimized;
    return `La duración optimizada (${optimized.toFixed(1)} h) supera la jornada de referencia (${hours} h). Revisa la dotación o el número de paradas.`;
  };
  const canRun = () => canOptimize(authUser()?.role) && (readiness()?.ready ?? false);

  const wizardExecutionSubstatus = createMemo(() => {
    if (step() !== 2 || !simulationState.isOptimizing || !simulationState.executionPhase) {
      return null;
    }
    const phase = tryGetExecutionPhase(simulationState.executionPhase);
    if (!phase) return null;
    return formatWizardExecutionSubstatus(phase.order, executionTotalPhases(), phase.label);
  });

  const requestCancelExecution = () => {
    if (!simulationState.isOptimizing) return;
    setCancelConfirmOpen(true);
  };

  const confirmCancelExecution = () => {
    cancelOptimization();
    setCancelConfirmOpen(false);
    setRunError(null);
    setRunNotice(EXECUTION_CANCEL_MESSAGES.done);
  };

  const applyDerivedScenario = () => {
    applySimulationScenario(deriveScenarioId(conditions()));
  };

  const toggleCondition = (id: ConditionId) => {
    const next = { ...conditions(), [id]: !conditions()[id] };
    setConditions(next);
    applySimulationScenario(deriveScenarioId(next));
  };

  const handleContinue = () => {
    setRunError(null);
    applyDerivedScenario();
    const ready = readiness();
    if (!ready?.ready) {
      setRunError(ready?.issues.join(' ') ?? 'No se pudo verificar los recursos del sistema.');
      void loadReadiness();
      return;
    }
    setStep(2);
  };

  const handleRun = async () => {
    setRunError(null);
    setRunNotice(null);
    applyDerivedScenario();
    const ready = readiness();
    if (!ready?.ready) {
      setRunError(ready?.issues.join(' ') ?? 'No se puede ejecutar la simulación.');
      return;
    }
    try {
      const completed = await runOptimization(simulationParams());
      if (!completed || wasExecutionCancelled()) {
        if (wasExecutionCancelled()) {
          setRunNotice(EXECUTION_CANCEL_MESSAGES.done);
        }
        return;
      }
      setHasResults(true);
      setStep(3);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'No se pudo ejecutar la simulación');
    }
  };

  const handleCancelExecution = () => {
    requestCancelExecution();
  };

  const handleNewSimulation = () => {
    setPageTab('flow');
    setStep(1);
    setHasResults(false);
    setRunError(null);
    setConditions(defaultConditions());
    applySimulationScenario('normal');
  };

  const handleViewHistory = async (simulationId: number) => {
    setHistoryError(null);
    try {
      await loadSimulationFromHistory(simulationId);
      setConditions(conditionsForScenario(simulationState.scenarioId));
      setHasResults(true);
      setPageTab('flow');
      setStep(3);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'No se pudo cargar la simulación');
    }
  };

  createEffect(() => {
    if (step() >= 2) {
      void loadMonitoring();
    }
  });

  onMount(() => {
    void loadReadiness();
    void initSimulationData().then(() => {
      const simulationId = parseSimulationIdParam(params.simulationId);
      if (simulationId) {
        void handleViewHistory(simulationId);
        return;
      }
      if (params.view === 'history') {
        setPageTab('history');
      }
      if (params.view === 'weekly') {
        setPageTab('weekly');
      }
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (step() !== 2 || !simulationState.isOptimizing || cancelConfirmOpen()) return;
      event.preventDefault();
      requestCancelExecution();
    };
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => {
      window.removeEventListener('keydown', onKeyDown);
      if (simulationState.isOptimizing) {
        cancelOptimization();
      }
    });
  });

  return (
    <div class="space-y-5">
      <Show when={simulationState.isLoadingDetail}>
        <Card>
          <LoadingPanel
            label="Cargando simulación guardada…"
            progress={simulationState.optimizationProgress}
            indeterminate={simulationState.optimizationProgress === 0}
            detail="Recuperando KPIs del historial."
          />
        </Card>
      </Show>
      <ContingencyResultBanner />

      <div class="flex gap-1 overflow-x-auto border-b border-border dark:border-dark-border">
        <For each={simulationPageTabs}>
          {(item) => (
            <button
              type="button"
              class={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                pageTab() === item.id
                  ? 'border-fero-green-mid text-fero-green-dark'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
              onClick={() => setPageTab(item.id)}
            >
              {item.label}
            </button>
          )}
        </For>
      </div>
      <Show when={pageTab() === 'weekly'}>
        <PlanningGlossaryStrip />
        <p class="text-xs text-text-muted">
          {simulationPageTabs.find((item) => item.id === 'weekly')?.hint}
        </p>
      </Show>
      <Show when={pageTab() === 'history'}>
        <p class="text-xs text-text-muted">
          {simulationPageTabs.find((item) => item.id === 'history')?.hint}
        </p>
      </Show>

      <Show when={pageTab() === 'flow'}>
      <div class="space-y-4">
      <div
        class="flex flex-col gap-2 rounded-lg border border-default bg-surface/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
        data-testid="simulation-flow-intro"
      >
        <p class="text-sm text-text-secondary">
          Compara condiciones con el motor ACO — evaluación de escenarios, sin despacho a campo.
        </p>
        <A
          href="/optimization"
          class="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-fero-blue hover:underline"
        >
          ¿Despachar hoy?
          <ArrowRight size={14} aria-hidden="true" />
          Planificación operativa
        </A>
      </div>
      <CancelExecutionConfirmDialog
        open={cancelConfirmOpen()}
        onConfirm={confirmCancelExecution}
        onDismiss={() => setCancelConfirmOpen(false)}
      />
      <div class="space-y-4">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <WizardStepNav
          step={step()}
          hasResults={hasResults()}
          onStepChange={setStep}
          executionSubstatus={wizardExecutionSubstatus()}
        />
      </div>

      <Show when={runError() && step() !== 2}>
        <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {runError()}
        </div>
      </Show>

      {/* Paso 1 — Configuración */}
      <Show when={step() === 1}>
        <div class="grid items-start gap-4 xl:grid-cols-12">
          <div class="xl:col-span-3">
            <ConfigurationSummaryPanel
              conditions={conditions()}
              scenarios={simulationState.scenarios}
              readiness={readiness()}
              loadingReadiness={loadingReadiness()}
              {...panelParams()}
            />
          </div>
          <div class="space-y-4 xl:col-span-9">
            <Card>
              <CardHeader
                title="Condiciones del escenario"
                subtitle="Activa condiciones; el escenario derivado se muestra en el resumen lateral."
              />
              <p class="mb-1 text-sm font-semibold text-text-primary dark:text-white">Condiciones a simular</p>
              <div class="mb-4 divide-y divide-border dark:divide-dark-border">
                <For each={simulationConditions}>
                  {(c) => (
                    <Toggle
                      label={c.label}
                      description={c.description}
                      icon={<ConditionRowIcon icon={c.icon} />}
                      checked={conditions()[c.id]}
                      onChange={() => toggleCondition(c.id)}
                    />
                  )}
                </For>
              </div>
              <p class="mb-1 mt-4 text-sm font-semibold text-text-primary dark:text-white">Personal del turno</p>
              <div class="mb-4 rounded-lg border border-border px-3 py-2.5 dark:border-dark-border">
                <Toggle
                  label="Ausentismo del turno"
                  description="Falta personal en cuadrillas. El conductor siempre está presente; el ausentismo afecta solo a los 5 operarios de campo."
                  icon={<Users size={14} />}
                  checked={crewShortageEnabled()}
                  onChange={() => setCrewShortageEnabled((value) => !value)}
                />
                <Show when={crewShortageEnabled()}>
                  <div class="mt-3 border-t border-border pt-3 dark:border-dark-border">
                    <label class="mb-1 block text-xs text-text-muted">Operarios de campo ausentes</label>
                    <select
                      value={operatorsShortage()}
                      onChange={(e) => setOperatorsShortage(e.currentTarget.value)}
                      class="w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
                    >
                      <For each={operatorsShortageOptions}>
                        {(o) => <option value={o.value}>{o.label}</option>}
                      </For>
                    </select>
                    <p class="mt-2 text-xs text-text-muted">{CREW_SHORTAGE_NARRATIVE}</p>
                  </div>
                </Show>
              </div>
              <div class="mb-4 rounded-lg border border-border px-3 py-2.5 dark:border-dark-border">
                <p class="mb-2 text-sm font-semibold text-text-primary dark:text-white">
                  Motor de optimización (ACO)
                </p>
                <p class="mb-3 text-xs text-text-muted">
                  Más hormigas e iteraciones exploran más soluciones (mejor calidad posible, más tiempo de cálculo).
                </p>
                <label class="mb-1 block text-xs text-text-muted">Perfil</label>
                <select
                  value={acoPreset()}
                  onChange={(e) => applyAcoPreset(e.currentTarget.value as AcoPresetId)}
                  class="mb-3 w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
                >
                  <For each={acoPresetOptions}>
                    {(option) => <option value={option.value}>{option.label}</option>}
                  </For>
                </select>
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label class="mb-1 block text-xs text-text-muted">Hormigas por iteración</label>
                    <select
                      value={acoAnts()}
                      onChange={(e) => handleAcoAntsChange(e.currentTarget.value)}
                      class="w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
                    >
                      <For each={acoAntsOptions}>
                        {(option) => <option value={option.value}>{option.label}</option>}
                      </For>
                    </select>
                  </div>
                  <div>
                    <label class="mb-1 block text-xs text-text-muted">Iteraciones</label>
                    <select
                      value={acoIterations()}
                      onChange={(e) => handleAcoIterationsChange(e.currentTarget.value)}
                      class="w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
                    >
                      <For each={acoIterationsOptions}>
                        {(option) => <option value={option.value}>{option.label}</option>}
                      </For>
                    </select>
                  </div>
                </div>
              </div>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div class="min-w-0">
                  <label class="mb-1 block text-xs text-text-muted">Intensidad de lluvia</label>
                  <select
                    value={rainIntensity()}
                    onChange={(e) => setRainIntensity(e.currentTarget.value)}
                    disabled={derivedScenario().scenarioId !== 'rain'}
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
                    disabled={derivedScenario().scenarioId !== 'saturated'}
                    class="w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm disabled:opacity-50 dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
                  >
                    <For each={wasteLevelOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
                  </select>
                </div>
                <div class="min-w-0">
                  <label class="mb-1 block text-xs text-text-muted">
                    Duración estimada <span class="text-text-muted">(informativo)</span>
                  </label>
                  <select
                    value={duration()}
                    onChange={(e) => setDuration(e.currentTarget.value)}
                    class="w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm dark:bg-dark-surface-hover dark:border-dark-border dark:text-white"
                  >
                    <For each={durationOptions}>{(o) => <option value={o.value}>{o.label}</option>}</For>
                  </select>
                </div>
              </div>
            </Card>
          </div>
        </div>
        <div class="flex justify-end border-t border-border pt-4 dark:border-dark-border">
          <Button
            variant="primary"
            class="gap-2 px-6"
            icon={<ArrowRight size={16} />}
            disabled={!canOptimize(authUser()?.role)}
            onClick={handleContinue}
          >
            Continuar
          </Button>
        </div>
      </Show>

      {/* Paso 2 — Revisión y ejecución */}
      <Show when={step() === 2}>
        <div class="grid items-start gap-4 xl:grid-cols-12">
          <div class="space-y-4 xl:col-span-3">
            <ConfigurationSummaryPanel
              conditions={conditions()}
              scenarios={simulationState.scenarios}
              readiness={readiness()}
              loadingReadiness={loadingReadiness()}
              {...panelParams()}
            />
            <Card>
              <CardHeader title="Revisión previa" />
              <ul class="space-y-2 text-sm text-text-secondary">
                <li>
                  <span class="font-semibold text-text-primary dark:text-white">Escenario:</span>{' '}
                  {derivedScenario().label}
                </li>
                <li>
                  <span class="font-semibold text-text-primary dark:text-white">Vehículos:</span>{' '}
                  {readiness()?.assignableVehicles ?? '—'}
                </li>
                <li>
                  <span class="font-semibold text-text-primary dark:text-white">Puntos activos:</span>{' '}
                  {readiness()?.activePoints ?? '—'}
                </li>
                <Show when={crewShortageEnabled()}>
                  <li>
                    <span class="font-semibold text-text-primary dark:text-white">Ausentismo:</span>{' '}
                    {operatorsShortage()} operario(s) de campo ausentes
                  </li>
                </Show>
                <li>
                  <span class="font-semibold text-text-primary dark:text-white">Motor ACO:</span>{' '}
                  {acoAnts()} hormigas × {acoIterations()} iteraciones
                </li>
              </ul>
            </Card>
          </div>
          <div class="space-y-4 xl:col-span-9">
            <ExecutionPanel
              isRunning={simulationState.isOptimizing}
              progress={simulationState.optimizationProgress}
              logs={simulationState.logs}
              error={runError()}
              notice={runNotice()}
              executionPhase={simulationState.executionPhase}
              executionPhaseIndex={executionPhaseIndex()}
              executionTotalPhases={executionTotalPhases()}
              executionNarrative={executionNarrative()}
              scenarioLabel={derivedScenario().label}
              acoConvergence={simulationState.acoConvergenceLive}
            />
            <Card>
              <CardHeader title="Reportar contingencia" />
              <BreakdownReporter
                vehicles={fleetForBreakdown()}
                onComplete={() => setIncidentsRefreshKey((value) => value + 1)}
              />
            </Card>
            <RecentIncidentsPanel refreshKey={incidentsRefreshKey()} compact />
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 dark:border-dark-border">
          <Button
            variant="outline"
            class="gap-2"
            icon={<ArrowLeft size={16} />}
            disabled={isSimulationBusy()}
            onClick={() => setStep(1)}
          >
            Anterior
          </Button>
          <div class="flex flex-wrap gap-2">
            <Show when={simulationState.isOptimizing}>
              <Button
                variant="outline"
                class="gap-2 border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/30"
                icon={<Square size={14} />}
                onClick={handleCancelExecution}
                data-testid="cancel-execution-btn"
              >
                Cancelar ejecución
              </Button>
            </Show>
            <Button
              variant="primary"
              class="gap-2 px-6"
              icon={<Play size={16} />}
              loading={simulationState.isOptimizing}
              disabled={!canRun() || simulationState.isOptimizing}
              onClick={() => void handleRun()}
              data-testid="execute-simulation-btn"
            >
              Ejecutar simulación
            </Button>
          </div>
        </div>
      </Show>

      {/* Paso 3 — Resultados e impacto */}
      <Show when={step() === 3}>
        <Show
          when={hasResults()}
          fallback={
            <Card>
              <p class="py-12 text-center text-sm text-text-muted">
                Aún no hay resultados. Vuelve al paso 2 y ejecuta una simulación.
              </p>
            </Card>
          }
        >
          <div class="space-y-4">
            <PostSimulationActions
              simulationId={simulationState.lastSimulationId}
              onNewSimulation={handleNewSimulation}
            />
            <Show when={weeklyPlanBridge()?.status === 'approved'}>
              <PlanningContextualCta
                tone="info"
                message="Plan semanal aprobado — lleva el escenario al plan operativo del día."
                href={optimizationHref({ date: todayIso() })}
                linkLabel="Ver en plan del día"
              />
            </Show>
            <Show when={workdayWarning()}>
              {(message) => (
                <div class="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                  <AlertTriangle size={18} class="mt-0.5 shrink-0" />
                  <p>{message()}</p>
                </div>
              )}
            </Show>
            <ExecutiveSummary kpis={currentKpis()} />
            <DurationBreakdownPanel kpis={currentKpis()} />
            <EngineComputationPanel kpis={currentKpis()} />
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
                <div class="mt-3 flex items-start gap-2.5 rounded-lg border border-fero-green/30 bg-fero-green/10 px-3 py-2.5">
                  <Leaf size={18} class="mt-0.5 shrink-0 text-fero-green-dark" />
                  <div>
                    <p class="text-xs font-semibold text-fero-green-dark">Ahorro estimado</p>
                    <p class="mt-0.5 text-sm font-medium text-text-primary dark:text-white">
                      {savings().distanceKm} km · {savings().timeMin} min · {savings().fuelL} L ·{' '}
                      {savings().co2Kg} kg CO₂ evitados
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
                  <EfficiencyGauge value={efficiencyValue()} />
                  <ul class="w-full flex-1 space-y-3">
                    <For each={performanceIndicators()}>
                      {(ind) => <MetricBar label={ind.label} value={ind.value} />}
                    </For>
                  </ul>
                </div>
              </Card>
            </div>
          </div>
        </Show>
        <div class="flex flex-wrap justify-between gap-2 border-t border-border pt-4 dark:border-dark-border">
          <Button
            variant="outline"
            class="gap-2"
            icon={<ArrowLeft size={16} />}
            disabled={isSimulationBusy()}
            onClick={() => setStep(2)}
          >
            Anterior
          </Button>
          <Button variant="outline" class="gap-2" icon={<Plus size={16} />} onClick={handleNewSimulation}>
            Nueva simulación
          </Button>
        </div>
      </Show>
      </div>
      </div>
      </Show>

      <Show when={pageTab() === 'weekly'}>
        <WeeklyPlanTab />
      </Show>

      <Show when={pageTab() === 'history'}>
        <ThesisVsOperationsNotice variant="thesis" class="mb-4" />
        <SimulationHistoryPanel
          error={historyError()}
          isLoading={isSimulationBusy()}
          onView={(id) => void handleViewHistory(id)}
        />
      </Show>
    </div>
  );
}
