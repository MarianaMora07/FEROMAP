import { For, Show } from 'solid-js';
import { Loader2 } from 'lucide-solid';
import { Card, CardHeader, ProgressBar } from '../../design-system/components';
import type { SimulationLogEntry } from '../../data/types/simulation';
import type { ExecutionPhaseId } from './executionPhases';
import { formatExecutionPhaseTitle, getExecutionPhase } from './executionPhases';
import { SimulationExecutionStepper } from './SimulationExecutionStepper';

interface ExecutionNarrative {
  whatItDoes: string;
  whyItMatters: string;
}

interface ExecutionPanelProps {
  isRunning: boolean;
  progress: number;
  logs: SimulationLogEntry[];
  error: string | null;
  notice?: string | null;
  executionPhase: ExecutionPhaseId | null;
  executionPhaseIndex: number;
  executionTotalPhases: number;
  executionNarrative: ExecutionNarrative | null;
  scenarioLabel: string;
}

export function ExecutionPanel(props: ExecutionPanelProps) {
  const panelTitle = () => {
    if (props.isRunning && props.executionPhase) {
      return formatExecutionPhaseTitle(props.executionPhase);
    }
    if (!props.isRunning && props.executionPhase === 'listo') {
      return 'Simulación completada';
    }
    return 'Cálculo de rutas optimizadas';
  };

  const panelSubtitle = () => {
    if (props.isRunning && props.executionPhase) {
      const remaining = Math.max(0, props.executionTotalPhases - props.executionPhaseIndex);
      return `Escenario «${props.scenarioLabel}» · quedan ${remaining} etapa${remaining === 1 ? '' : 's'}`;
    }
    if (!props.isRunning && props.logs.length > 0) {
      return `Última ejecución — escenario «${props.scenarioLabel}»`;
    }
    return 'El sistema busca rutas más cortas sobre las calles reales de Unare';
  };

  const livePhaseAnnouncement = () => {
    if (!props.isRunning || !props.executionPhase) return '';
    return `${formatExecutionPhaseTitle(props.executionPhase)}. Progreso ${props.progress} por ciento.`;
  };

  const showExecution = () => props.isRunning || props.logs.length > 0;

  return (
    <Card data-testid="execution-panel">
      <div class="sr-only" aria-live="polite" aria-atomic="true" data-testid="execution-phase-live">
        {livePhaseAnnouncement()}
      </div>
      <CardHeader title={panelTitle()} subtitle={panelSubtitle()} />
      <Show when={props.notice}>
        <div class="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          {props.notice}
        </div>
      </Show>
      <Show when={props.error}>
        <div class="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {props.error}
        </div>
      </Show>
      <Show
        when={showExecution()}
        fallback={
          <p class="py-6 text-center text-sm text-text-muted">
            Pulsa «Ejecutar simulación» para que el sistema calcule rutas optimizadas paso a paso.
          </p>
        }
      >
        <div class="grid gap-4 lg:grid-cols-[minmax(0,13rem)_1fr]">
          <SimulationExecutionStepper
            currentPhaseId={props.executionPhase}
            isRunning={props.isRunning}
            completed={!props.isRunning && props.executionPhase === 'listo'}
          />

          <div class="min-w-0 space-y-4">
            <Show when={props.isRunning}>
              <div>
                <div class="mb-2 flex items-center justify-between text-xs text-text-muted">
                  <span class="inline-flex items-center gap-1.5">
                    <Loader2 size={14} class="animate-spin" />
                    Fase {props.executionPhaseIndex}/{props.executionTotalPhases}
                  </span>
                  <span>{props.progress}%</span>
                </div>
                <ProgressBar value={props.progress} color="green" />
              </div>
            </Show>

            <Show when={props.executionNarrative}>
              {(narrative) => (
                <div class="rounded-lg border border-fero-green/25 bg-fero-green/5 px-3 py-2.5 dark:border-fero-green/20">
                  <p class="text-[10px] font-semibold uppercase tracking-wide text-fero-green-dark">
                    Qué está haciendo ahora
                  </p>
                  <p class="mt-1 text-sm text-text-primary dark:text-white">{narrative().whatItDoes}</p>
                  <p class="mt-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    Por qué importa
                  </p>
                  <p class="mt-1 text-xs text-text-secondary">{narrative().whyItMatters}</p>
                </div>
              )}
            </Show>

            <div>
              <p class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                Registro del cálculo
              </p>
              <ul class="max-h-48 space-y-1.5 overflow-y-auto text-xs" aria-live="polite" aria-relevant="additions">
                <For each={props.logs}>
                  {(log) => {
                    const phaseLabel = () =>
                      log.phaseId ? getExecutionPhase(log.phaseId).label : null;

                    return (
                      <li
                        class={`flex gap-2 rounded-md px-1.5 py-1 ${
                          log.phaseId && log.phaseId === props.executionPhase && props.isRunning
                            ? 'bg-fero-green/10'
                            : ''
                        }`}
                      >
                        <span class="shrink-0 font-mono text-[10px] text-text-muted">{log.timestamp}</span>
                        <span class="min-w-0 flex-1">
                          <Show when={phaseLabel()}>
                            {(label) => (
                              <span class="mr-1.5 inline-flex rounded bg-slate-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-text-muted dark:bg-dark-surface">
                                {label()}
                              </span>
                            )}
                          </Show>
                          <span
                            class={
                              log.type === 'success'
                                ? 'text-fero-green-dark'
                                : log.type === 'warning'
                                  ? 'text-amber-600'
                                  : 'text-text-secondary'
                            }
                          >
                            {log.message}
                          </span>
                        </span>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </div>
          </div>
        </div>
      </Show>
    </Card>
  );
}
