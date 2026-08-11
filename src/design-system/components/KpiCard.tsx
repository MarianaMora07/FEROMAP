import { type JSX, Show, splitProps } from 'solid-js';

type IconTone = 'green' | 'blue' | 'purple' | 'amber' | 'red' | 'slate';

interface KpiCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon?: JSX.Element;
  iconTone?: IconTone;
  trend?: {
    value: number;
    direction: 'up' | 'down';
  };
  trendLabel?: string;
  footer?: JSX.Element;
  class?: string;
}

const iconToneClasses: Record<IconTone, string> = {
  green: 'bg-fero-green/15 text-fero-green-dark',
  blue: 'bg-fero-blue/10 text-fero-blue',
  purple: 'bg-violet-100 text-violet-600',
  amber: 'bg-amber-100 text-amber-600',
  red: 'bg-red-50 text-red-500',
  slate: 'bg-slate-100 text-slate-500',
};

export function KpiCard(props: KpiCardProps) {
  const [local, others] = splitProps(props, [
    'title',
    'value',
    'unit',
    'icon',
    'iconTone',
    'trend',
    'trendLabel',
    'footer',
    'class',
  ]);

  return (
    <div
      class={`rounded-lg border border-border bg-surface p-3 shadow-xs transition-all duration-200 hover:shadow-sm sm:p-4 dark:bg-dark-surface dark:border-dark-border ${local.class ?? ''}`}
      {...others}
    >
      <div class="flex items-start justify-between gap-2">
        <p class="min-w-0 flex-1 text-sm font-medium leading-snug text-text-muted break-words">
          {local.title}
        </p>
        <Show when={local.icon}>
          <div
            class={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconToneClasses[local.iconTone ?? 'green']}`}
          >
            {local.icon}
          </div>
        </Show>
      </div>

      <div class="mt-2 flex min-w-0 flex-wrap items-baseline gap-1.5">
        <span class="font-heading text-2xl font-bold leading-none text-text-primary sm:text-3xl dark:text-white">
          {local.value}
        </span>
        <Show when={local.unit}>
          <span class="text-sm font-medium text-text-muted">{local.unit}</span>
        </Show>
      </div>

      <Show when={local.trend}>
        {(trend) => (
          <div class="mt-3 flex items-center gap-1">
            <span
              class={`text-sm font-medium ${
                trend().direction === 'up' ? 'text-fero-green-dark' : 'text-red-500'
              }`}
            >
              {trend().direction === 'up' ? '+' : '-'}
              {Math.abs(trend().value)}%
            </span>
            <span class="text-xs text-text-muted">{local.trendLabel ?? 'vs anterior'}</span>
          </div>
        )}
      </Show>

      <Show when={local.footer}>
        <div class="mt-3">{local.footer}</div>
      </Show>
    </div>
  );
}
