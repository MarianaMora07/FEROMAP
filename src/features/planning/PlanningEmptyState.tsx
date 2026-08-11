import { Show, type JSX } from 'solid-js';
import { A } from '@solidjs/router';
import { Button } from '../../design-system/components';

export interface PlanningEmptyStateProps {
  title: string;
  description: string;
  icon?: JSX.Element;
  actionLabel?: string;
  actionHref?: string;
  testId?: string;
  compact?: boolean;
}

export function PlanningEmptyState(props: PlanningEmptyStateProps) {
  return (
    <div
      role="status"
      data-testid={props.testId}
      class={`flex flex-col items-center px-4 text-center ${props.compact ? 'py-6' : 'py-10'}`}
    >
      <Show when={props.icon}>
        <span
          class="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-text-muted dark:bg-dark-surface-hover"
          aria-hidden="true"
        >
          {props.icon}
        </span>
      </Show>
      <p class="text-sm font-semibold text-text-primary dark:text-white">{props.title}</p>
      <p class="mt-1 max-w-md text-sm text-text-secondary">{props.description}</p>
      <Show when={props.actionHref && props.actionLabel}>
        <A href={props.actionHref!} class="mt-4">
          <Button size="sm" variant="outline">
            {props.actionLabel}
          </Button>
        </A>
      </Show>
    </div>
  );
}
