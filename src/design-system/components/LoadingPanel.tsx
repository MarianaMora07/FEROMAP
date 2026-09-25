import { Show } from 'solid-js';
import { useLocale } from '../../core/i18n/solid';
import { ProgressBar } from './ProgressBar';

interface LoadingPanelProps {
  label: string;
  progress?: number;
  indeterminate?: boolean;
  detail?: string;
  class?: string;
}

export function LoadingPanel(props: LoadingPanelProps) {
  const tr = useLocale();
  const showDeterminate = () => props.progress !== undefined && !props.indeterminate;

  return (
    <div
      class={`flex flex-col items-center gap-3 px-4 py-10 text-center ${props.class ?? ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={props.label}
    >
      <p class="text-sm font-medium text-text-primary dark:text-white">{props.label}</p>
      <div class="w-full max-w-sm">
        <Show
          when={showDeterminate()}
          fallback={<ProgressBar value={0} indeterminate color="green" />}
        >
          <ProgressBar value={props.progress!} color="green" showLabel />
        </Show>
      </div>
      <Show when={props.detail}>
        <p class="text-xs text-text-muted">{props.detail}</p>
      </Show>
      <Show when={!showDeterminate() && !props.detail}>
        <p class="text-xs text-text-muted">{tr('ui.loadingWorking')}</p>
      </Show>
    </div>
  );
}
