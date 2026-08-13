import { type JSX, Show, onCleanup, onMount } from 'solid-js';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  side?: 'left' | 'right';
  children: JSX.Element;
}

export function Drawer(props: DrawerProps) {
  const side = () => props.side ?? 'right';
  const titleId = () => `drawer-title-${props.title?.replace(/\s+/g, '-').toLowerCase() ?? 'panel'}`;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && props.open) props.onClose();
  };

  onMount(() => {
    document.addEventListener('keydown', handleKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50">
        <div class="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={props.onClose} />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={props.title ? titleId() : undefined}
          class={`fixed top-0 ${side() === 'right' ? 'right-0' : 'left-0'} h-full w-full max-w-md bg-surface border-border shadow-xl transition-transform duration-300 dark:bg-dark-surface dark:border-dark-border ${
            side() === 'right' ? 'translate-x-0' : '-translate-x-0'
          }`}
        >
          <Show when={props.title}>
            <div class="flex items-center justify-between px-6 py-4 border-b border-border dark:border-dark-border">
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
                aria-label="Cerrar panel"
              >
                ×
              </button>
            </div>
          </Show>
          <div class="p-6 overflow-y-auto h-[calc(100%-65px)]">{props.children}</div>
        </div>
      </div>
    </Show>
  );
}
