import { For, Show } from 'solid-js';
import { Button, Card, CardHeader, ProgressBar } from '../../design-system/components';
import { optimizationState, cancelOptimization } from '../../core/stores/optimizationStore';
import { getExecutionPhase } from '../simulation/executionPhases';

export function OptimizationProgressPanel() {
  const phase = () => optimizationState.optimizationPhase;
  const phaseLabel = () => {
    const current = phase();
    return current ? getExecutionPhase(current).panelTitle : 'Iniciando motor…';
  };
  const lastLog = () => {
    const logs = optimizationState.logs;
    return logs.length > 0 ? logs[logs.length - 1]!.message : 'Preparando optimización…';
  };

  return (
    <Show when={optimizationState.isOptimizing}>
      <Card data-testid="optimization-progress-panel">
        <CardHeader title="Progreso del motor" />
        <p class="mb-2 text-xs font-medium text-fero-green-dark" aria-live="polite">
          {phaseLabel()} · {optimizationState.optimizationProgress}%
        </p>
        <ProgressBar value={optimizationState.optimizationProgress} color="green" />
        <div class="mt-3 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            data-testid="optimization-cancel"
            onClick={() => void cancelOptimization()}
          >
            Cancelar
          </Button>
        </div>
        <p class="mt-2 text-xs text-text-muted" aria-live="polite">
          {lastLog()}
        </p>
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
  );
}
