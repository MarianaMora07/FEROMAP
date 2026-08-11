import { For, Show } from 'solid-js';
import { Loader2 } from 'lucide-solid';
import { Card, CardHeader, ProgressBar } from '../../design-system/components';
import type { SimulationLogEntry } from '../../data/types/simulation';

interface ExecutionPanelProps {
  isRunning: boolean;
  progress: number;
  logs: SimulationLogEntry[];
  error: string | null;
}

export function ExecutionPanel(props: ExecutionPanelProps) {
  return (
    <Card>
      <CardHeader
        title={props.isRunning ? 'Ejecutando simulación…' : 'Motor de simulación'}
        subtitle="Progreso y registros del algoritmo ACO sobre la red vial"
      />
      <Show when={props.error}>
        <div class="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {props.error}
        </div>
      </Show>
      <Show
        when={props.isRunning || props.logs.length > 0}
        fallback={
          <p class="py-6 text-center text-sm text-text-muted">
            Pulse «Ejecutar simulación» para iniciar el cálculo de rutas.
          </p>
        }
      >
        <Show when={props.isRunning}>
          <div class="mb-4">
            <div class="mb-2 flex items-center justify-between text-xs text-text-muted">
              <span class="inline-flex items-center gap-1.5">
                <Loader2 size={14} class="animate-spin" />
                Procesando…
              </span>
              <span>{props.progress}%</span>
            </div>
            <ProgressBar value={props.progress} color="green" />
          </div>
        </Show>
        <ul class="max-h-48 space-y-1.5 overflow-y-auto text-xs">
          <For each={props.logs}>
            {(log) => (
              <li class="flex gap-2 text-text-secondary">
                <span class="shrink-0 font-mono text-[10px] text-text-muted">{log.timestamp}</span>
                <span
                  class={
                    log.type === 'success'
                      ? 'text-fero-green-dark'
                      : log.type === 'warning'
                        ? 'text-amber-600'
                        : ''
                  }
                >
                  {log.message}
                </span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </Card>
  );
}
