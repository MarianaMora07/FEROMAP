import { For, Show, createSignal } from 'solid-js';
import { AlertTriangle, CheckCircle2, Eye, ListChecks, Loader2 } from 'lucide-solid';
import { Button, SelectField } from '../../design-system/components';
import { fetchDaySimulation, type DaySimulation, type DaySimulationStep } from '../../core/api/daySimulation';
import { optimizationState, markDaySimulated } from '../../core/stores/optimizationStore';
import type { DaySimulationCondition } from '../../core/planning/operationalLinks';

type SimulationMode = 'watch' | 'background';

const CONDITION_OPTIONS: Array<{ id: DaySimulationCondition; label: string }> = [
  { id: 'none', label: 'Sin incidencias' },
  { id: 'all', label: 'Con incidencias extraordinarias' },
];

function formatKm(value: number | null | undefined): string {
  return value == null ? '—' : `${value.toFixed(1)} km`;
}

function stepTitle(step: DaySimulationStep): string {
  return step.type === 'breakdown' ? 'Avería de camión' : 'Contenedor crítico';
}

/**
 * Diálogo «Simular día» (dentro del plan del día). Permite indicar si hay condiciones
 * extraordinarias y elegir cómo ver el resultado:
 * - **Ver la animación** → abre `/optimization/simulation` (recorrido del día).
 * - **Calcular en 2º plano** → calcula la secuencia y muestra solo los resultados aquí.
 *
 * Es de **solo lectura**: reutiliza la simulación guionada (dry-run) del backend.
 */
export function DaySimulationDialog(props: {
  onWatch: (condition: DaySimulationCondition, scenario: string | null) => void;
  onClose: () => void;
}) {
  const [condition, setCondition] = createSignal<DaySimulationCondition>('all');
  const [mode, setMode] = createSignal<SimulationMode>('watch');
  const [simulation, setSimulation] = createSignal<DaySimulation | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  // Escenario a simular: es un *what-if*, no cambia el escenario del día (la simulación es de
  // solo lectura). `null` = el del plan vigente.
  const [scenarioChoice, setScenarioChoice] = createSignal<string | null>(null);

  const hasResults = () => simulation() != null;
  const extraSteps = () => (condition() === 'all' ? (simulation()?.steps ?? []) : []);

  const currentScenarioId = () =>
    optimizationState.dailyPlan?.scenarioId ?? optimizationState.preset.scenarioId;
  const selectedScenarioId = () => scenarioChoice() ?? currentScenarioId();
  // Solo se reoptimiza si el escenario elegido difiere del que ya tiene el plan del día: así
  // «Simular día» responde a la pregunta «¿y si hoy llueve?» sin recalcular cuando no cambia.
  const scenarioOverride = () => {
    const chosen = selectedScenarioId();
    return chosen && chosen !== currentScenarioId() ? chosen : null;
  };
  const planDistanceKm = () => optimizationState.kpis?.distanceKm.optimized ?? null;

  const points = () =>
    optimizationState.dailyPlan?.finalPointIds.length ?? optimizationState.context?.pointsToVisit ?? 0;
  const distanceKm = () => optimizationState.kpis?.distanceKm.optimized ?? null;
  const durationHours = () => optimizationState.kpis?.durationHours.optimized ?? null;

  const selectCondition = (value: DaySimulationCondition) => {
    setCondition(value);
    setSimulation(null);
    setError(null);
  };

  const run = async () => {
    const operationDate = optimizationState.dailyPlan?.operationDate;
    if (mode() === 'watch') {
      // Ver la animación abre el recorrido (que recalcula en su propia página):
      // se marca el día como simulado al iniciar el flujo.
      if (operationDate) markDaySimulated(operationDate);
      props.onWatch(condition(), scenarioOverride());
      return;
    }
    const dailyPlanId = optimizationState.dailyPlan?.id;
    if (!dailyPlanId) {
      setError('No hay un plan del día para simular.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSimulation(await fetchDaySimulation(dailyPlanId, scenarioOverride()));
      if (operationDate) markDaySimulated(operationDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calcular la simulación del día');
    } finally {
      setLoading(false);
    }
  };

  const modeCardClass = (value: SimulationMode) =>
    `rounded-lg border px-3 py-2.5 text-left transition-colors ${
      mode() === value
        ? 'border-fero-blue/50 bg-fero-blue/5'
        : 'border-default bg-elevated hover:border-fero-blue/40'
    }`;

  return (
    <div class="space-y-5" data-testid="day-simulation-dialog">
      <p class="text-sm text-text-secondary">
        Simula la jornada antes de comprometer rutas. Elige el escenario del día, indica si hay
        condiciones extraordinarias y cómo quieres ver el resultado.
      </p>

      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Escenario del día</p>
        <SelectField
          label="Escenario a simular"
          name="scenario"
          value={selectedScenarioId()}
          onChange={(e) => setScenarioChoice(e.currentTarget.value)}
        >
          <For each={optimizationState.context?.scenarios ?? []}>
            {(scenario) => <option value={scenario.id}>{scenario.label}</option>}
          </For>
        </SelectField>
        <p class="text-xs text-text-muted">
          Escenario heredado del plan semanal (lluvia, saturación y ventanas horarias se configuran
          allí). Si eliges uno distinto al del día, «Simular día» <span class="font-semibold">recalcula
          la jornada</span> bajo ese escenario (puede tardar un poco); el plan del día no cambia.
        </p>
      </div>

      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Condiciones extraordinarias
        </p>
        <div class="flex flex-wrap gap-2">
          <For each={CONDITION_OPTIONS}>
            {(option) => (
              <Button
                size="sm"
                variant={condition() === option.id ? 'primary' : 'outline'}
                data-testid={`day-sim-condition-${option.id}`}
                disabled={loading()}
                onClick={() => selectCondition(option.id)}
              >
                {option.label}
              </Button>
            )}
          </For>
        </div>
      </div>

      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Cómo verlo</p>
        <div class="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            class={modeCardClass('watch')}
            data-testid="day-sim-mode-watch"
            onClick={() => setMode('watch')}
          >
            <span class="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Eye size={15} aria-hidden="true" /> Ver la animación
            </span>
            <span class="mt-0.5 block text-xs text-text-muted">
              Abre el recorrido del día y se detiene en cada contingencia.
            </span>
          </button>
          <button
            type="button"
            class={modeCardClass('background')}
            data-testid="day-sim-mode-background"
            onClick={() => setMode('background')}
          >
            <span class="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <ListChecks size={15} aria-hidden="true" /> Calcular en 2º plano
            </span>
            <span class="mt-0.5 block text-xs text-text-muted">
              Sin animación: solo el resumen de resultados del día.
            </span>
          </button>
        </div>
      </div>

      <Show when={error()}>
        <p class="text-sm text-red-600 dark:text-red-300" role="alert" data-testid="day-sim-error">
          {error()}
        </p>
      </Show>

      <Show when={mode() === 'background' && hasResults()}>
        <div class="space-y-3" data-testid="day-sim-result">
          <Show when={simulation()?.scenario}>
            {(scenario) => (
              <div
                class="space-y-1 rounded-xl border border-fero-blue/40 bg-fero-blue/5 px-4 py-3"
                data-testid="day-sim-scenario-result"
              >
                <p class="text-xs font-semibold uppercase tracking-wide text-fero-blue">
                  Escenario simulado · {scenario().label}
                </p>
                <p class="text-sm text-text-primary">
                  Día recalculado: {formatKm(scenario().distanceKm)} ·{' '}
                  {scenario().durationHours != null ? `${scenario().durationHours!.toFixed(1)} h` : '—'}
                </p>
                <Show when={planDistanceKm() != null && scenario().distanceKm != null}>
                  <p class="text-xs text-text-muted">
                    Plan vigente (sin el escenario): {formatKm(planDistanceKm())}
                  </p>
                </Show>
                <p class="text-xs text-text-muted">
                  Recálculo de solo lectura: no sustituye el plan del día.
                </p>
              </div>
            )}
          </Show>

          <Show
            when={condition() === 'all' && extraSteps().length > 0}
            fallback={
              <div class="space-y-1 rounded-xl border border-default bg-elevated px-4 py-3">
                <p class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <CheckCircle2 size={14} class="text-fero-green-dark" aria-hidden="true" />
                  Plan base — sin incidencias
                </p>
                <p class="text-sm text-text-primary">
                  {points()} puntos · {formatKm(distanceKm())} ·{' '}
                  {durationHours() != null ? `${durationHours()!.toFixed(1)} h` : '—'}
                </p>
                <p class="text-xs text-text-muted">
                  El plan ya está calculado; no hay contingencias que simular.
                </p>
              </div>
            }
          >
            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Incidencias simuladas ({extraSteps().length})
              </p>
              <ul class="space-y-2">
                <For each={extraSteps()}>
                  {(step) => (
                    <li class="space-y-1 rounded-xl border border-amber-300/70 bg-amber-50/80 px-3 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/25">
                      <p class="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
                        <AlertTriangle size={14} class="text-amber-600" aria-hidden="true" />
                        {stepTitle(step)}
                        <Show when={step.target.vehicleId || step.target.pointCode}>
                          <span class="font-mono text-xs font-normal text-text-muted">
                            {step.target.vehicleId ?? step.target.pointCode}
                          </span>
                        </Show>
                      </p>
                      <p class="text-xs text-text-secondary">{step.message}</p>
                      <Show when={step.beforeDistanceKm != null && step.afterDistanceKm != null}>
                        <p class="text-xs text-text-secondary" data-testid="day-sim-step-distance">
                          Distancia del día: {formatKm(step.beforeDistanceKm)} →{' '}
                          {formatKm(step.afterDistanceKm)}
                          <Show when={step.distanceDeltaKm != null}>
                            {' '}(
                            {step.distanceDeltaKm! >= 0 ? '+' : '−'}
                            {Math.abs(step.distanceDeltaKm!).toFixed(1)} km)
                          </Show>
                        </p>
                      </Show>
                      <Show when={(step.reassignedPoints ?? 0) > 0}>
                        <p class="text-xs text-text-muted">
                          {step.reassignedPoints} puntos reasignados
                        </p>
                      </Show>
                      <Show when={step.droppedPoints.length > 0}>
                        <p class="text-xs text-amber-900 dark:text-amber-100">
                          Sin atender: {step.droppedPoints.join(', ')}
                        </p>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </Show>

          <Button
            variant="outline"
            size="sm"
            class="gap-2"
            icon={<Eye size={14} />}
            onClick={() => props.onWatch(condition(), scenarioOverride())}
          >
            Ver la animación
          </Button>
        </div>
      </Show>

      <div class="flex flex-wrap justify-end gap-2 border-t border-default pt-4">
        <Button variant="outline" onClick={props.onClose}>
          Cerrar
        </Button>
        <Show when={mode() === 'watch' || !hasResults()}>
          <Button
            variant="primary"
            class="gap-2"
            icon={loading() ? <Loader2 size={14} class="animate-spin" /> : undefined}
            loading={loading()}
            disabled={loading()}
            data-testid="day-sim-run"
            onClick={() => void run()}
          >
            {mode() === 'watch' ? 'Ver la animación' : 'Calcular en 2º plano'}
          </Button>
        </Show>
      </div>
    </div>
  );
}
