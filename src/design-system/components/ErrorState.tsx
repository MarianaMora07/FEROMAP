import { Show } from 'solid-js';
import { Button } from './Button';

interface ErrorStateProps {
  /** Mensaje de error ya resuelto (texto humano). */
  message: string;
  /** Si se define, se muestra el botón de reintento. */
  onRetry?: () => void;
  retryLabel?: string;
  testId?: string;
}

/**
 * Estado de error unificado del rol planificador (docs/design-system/contratos-ui.md §4).
 * Anunciable (`role="alert"`) y con acción de reintento opcional.
 */
export function ErrorState(props: ErrorStateProps) {
  return (
    <div
      role="alert"
      data-testid={props.testId}
      class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
    >
      <span class="min-w-0">{props.message}</span>
      <Show when={props.onRetry}>
        <Button
          variant="outline"
          size="sm"
          class="shrink-0"
          onClick={() => props.onRetry?.()}
        >
          {props.retryLabel ?? 'Reintentar'}
        </Button>
      </Show>
    </div>
  );
}
