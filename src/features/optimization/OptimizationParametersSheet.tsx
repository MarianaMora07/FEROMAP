import { Show, onCleanup, onMount, type JSX } from 'solid-js';
import { X } from 'lucide-solid';

interface OptimizationParametersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: JSX.Element;
}

export function OptimizationParametersSheet(props: OptimizationParametersSheetProps) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && props.open) props.onOpenChange(false);
  };

  onMount(() => document.addEventListener('keydown', handleKeyDown));
  onCleanup(() => document.removeEventListener('keydown', handleKeyDown));

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 xl:hidden" data-testid="optimization-parameters-sheet">
        <div
          class="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={() => props.onOpenChange(false)}
        />
        <div class="absolute bottom-0 left-0 right-0 max-h-[88vh] overflow-y-auto rounded-t-2xl border-t border-default bg-surface p-4 shadow-xl dark:bg-dark-surface">
          <div class="mb-3 flex items-center justify-between gap-2">
            <p class="text-sm font-semibold text-text-primary">Parámetros</p>
            <button
              type="button"
              class="rounded-md p-1 text-text-muted hover:bg-app hover:text-text-primary"
              aria-label="Cerrar parámetros"
              onClick={() => props.onOpenChange(false)}
            >
              <X size={18} />
            </button>
          </div>
          {props.children}
        </div>
      </div>
    </Show>
  );
}
