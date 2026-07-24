import { type JSX, Show, onMount, onCleanup } from 'solid-js';

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
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.onClose();
  };

  onMount(() => {
    document.addEventListener('keydown', handleKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={props.onClose} />
        <div
          class={`relative bg-surface rounded-[var(--radius-xl)] shadow-xl border border-border p-6 ${sizeClasses[props.size ?? 'md']} w-full mx-4 dark:bg-dark-surface dark:border-dark-border animate-scale-in`}
        >
          <Show when={props.title}>
            <div class="flex items-center justify-between mb-4">
              <h2 class="font-heading text-lg font-semibold text-text-primary dark:text-white">
                {props.title}
              </h2>
              <button
                type="button"
                onClick={props.onClose}
                class="text-text-muted hover:text-text-primary text-xl leading-none p-1"
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
