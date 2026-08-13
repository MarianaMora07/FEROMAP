import { type JSX, Show, createEffect, onCleanup, onMount } from 'solid-js';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'fullscreen';
  children: JSX.Element;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  fullscreen: 'max-w-[90vw] max-h-[90vh]',
};

export function Modal(props: ModalProps) {
  const titleId = () => `modal-title-${props.title?.replace(/\s+/g, '-').toLowerCase() ?? 'dialog'}`;
  let dialogRef: HTMLDivElement | undefined;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.onClose();
  };

  onMount(() => {
    document.addEventListener('keydown', handleKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });

  createEffect(() => {
    if (!props.open) return;
    queueMicrotask(() => {
      const focusTarget =
        dialogRef?.querySelector<HTMLElement>('[data-modal-autofocus]') ??
        dialogRef?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
      focusTarget?.focus();
    });
  });

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={props.onClose} />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={props.title ? titleId() : undefined}
          class={`relative bg-surface rounded-[var(--radius-xl)] shadow-xl border border-border p-6 ${sizeClasses[props.size ?? 'md']} w-full mx-4 dark:bg-dark-surface dark:border-dark-border animate-scale-in`}
        >
          <Show when={props.title}>
            <div class="flex items-center justify-between mb-4">
              <h2
                id={titleId()}
                class="font-heading text-lg font-semibold text-text-primary dark:text-white"
              >
                {props.title}
              </h2>
              <button
                type="button"
                onClick={props.onClose}
                class="text-text-muted hover:text-text-primary text-xl leading-none p-1"
                aria-label="Cerrar diálogo"
              >
                ×
              </button>
            </div>
          </Show>
          {props.children}
        </div>
      </div>
    </Show>
  );
}
