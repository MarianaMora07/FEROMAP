import { For, Show } from 'solid-js';
import type { DemoAcoAntDecision } from '../../core/demo-aco/demoAcoFrames';
import { formatDecisionCandidates } from '../../core/demo-aco/demoAcoFrames';
import { MAZE_ANT_TRAIL_COLORS } from '../../core/demo-aco/mazeCanvasDraw';

interface DemoAntDecisionPanelProps {
  decision: DemoAcoAntDecision | null | undefined;
}

export function DemoAntDecisionPanel(props: DemoAntDecisionPanelProps) {
  const decision = () => props.decision;

  return (
    <Show when={decision()}>
      {(current) => (
        <div
          class="rounded-lg border border-border bg-surface/80 p-3 dark:border-dark-border dark:bg-dark-surface/60"
          data-testid="demo-ant-decision-panel"
          role="status"
        >
          <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Decisión de la hormiga #{current().antId + 1} · paso {current().stepIndex}
          </p>
          <p class="mt-1 text-sm text-text-secondary">
            Desde ({current().from.x}, {current().from.y}) el ACO elige el siguiente paso con
            probabilidad según feromonas (τ) y distancia (η).
          </p>
          <ul class="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
            <For each={formatDecisionCandidates(current())}>
              {(option) => (
                <li
                  class={`rounded-md px-2.5 py-1.5 text-xs ${
                    option.chosen
                      ? 'border border-fero-blue/40 bg-fero-blue/10 font-semibold text-fero-blue'
                      : 'border border-border bg-app text-text-secondary dark:border-dark-border'
                  }`}
                >
                  <span
                    class="mr-1.5 inline-block h-2.5 w-2.5 rounded-full"
                    style={{
                      background: option.chosen
                        ? MAZE_ANT_TRAIL_COLORS[current().antId % MAZE_ANT_TRAIL_COLORS.length]
                        : '#94a3b8',
                    }}
                    aria-hidden="true"
                  />
                  {option.label}: {Math.round(option.probability * 100)}%
                  {option.chosen ? ' · elegida' : ''}
                </li>
              )}
            </For>
          </ul>
        </div>
      )}
    </Show>
  );
}
