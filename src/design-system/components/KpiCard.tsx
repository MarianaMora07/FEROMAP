import { type JSX, splitProps } from 'solid-js';

interface KpiCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon?: JSX.Element;
  trend?: {
    value: number;
    direction: 'up' | 'down';
  };
  class?: string;
}

export function KpiCard(props: KpiCardProps) {
  const [local, others] = splitProps(props, ['title', 'value', 'unit', 'icon', 'trend', 'class']);

  return (
    <div
      class={`rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-xs transition-all duration-200 hover:shadow-sm dark:bg-dark-surface dark:border-dark-border ${local.class ?? ''}`}
      {...others}
    >
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <p class="text-sm font-medium text-text-muted">{local.title}</p>
          <div class="flex items-baseline gap-1.5 mt-2">
            <span class="font-heading text-[42px] font-bold leading-none text-text-primary dark:text-white">
              {local.value}
            </span>
            {local.unit && (
              <span class="text-sm font-medium text-text-muted">{local.unit}</span>
            )}
          </div>
        </div>
        {local.icon && (
          <div class="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-fero-green/10 text-fero-green-dark">
            {local.icon}
          </div>
        )}
      </div>
      {local.trend && (
        <div class="mt-3 flex items-center gap-1">
          <span
            class={`text-sm font-medium ${
              local.trend.direction === 'up' ? 'text-fero-green-dark' : 'text-red-500'
            }`}
          >
            {local.trend.direction === 'up' ? '↑' : '↓'} {Math.abs(local.trend.value)}%
          </span>
          <span class="text-xs text-text-muted">vs anterior</span>
        </div>
      )}
    </div>
  );
}
