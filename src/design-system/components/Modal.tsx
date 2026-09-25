import { type JSX, Show } from 'solid-js';
import { useLocale } from '../../core/i18n/solid';
import { useFocusTrap } from './focusTrap';

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
  const tr = useLocale();
  let dialogRef: HTMLDivElement | undefined;

  useFocusTrap({
    open: () => props.open,
    container: () => dialogRef,
    onEscape: () => props.onClose(),
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
          tabindex="-1"
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
                aria-label={tr('ui.closeDialog')}
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
