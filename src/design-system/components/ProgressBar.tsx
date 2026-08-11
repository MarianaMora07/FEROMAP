import { Show } from 'solid-js';

interface ProgressBarProps {
  value: number;
  max?: number;
  color?: 'green' | 'blue' | 'amber' | 'red';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  indeterminate?: boolean;
  class?: string;
}

const colorClasses = {
  green: 'bg-fero-green-dark',
  blue: 'bg-fero-blue',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
};

const sizeClasses = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

export function ProgressBar(props: ProgressBarProps) {
  const max = () => props.max ?? 100;
  const percentage = () => Math.min((props.value / max()) * 100, 100);
  const color = () => {
    if (props.color) return props.color;
    const pct = percentage();
    if (pct >= 80) return 'red';
    if (pct >= 60) return 'amber';
    return 'green';
  };

  return (
    <div class={`w-full ${props.class ?? ''}`}>
      {props.showLabel && !props.indeterminate && (
        <div class="flex justify-between mb-1">
          <span class="text-xs text-text-muted">{props.value} / {max()}</span>
          <span class="text-xs font-medium text-text-secondary">{Math.round(percentage())}%</span>
        </div>
      )}
      <Show
        when={props.indeterminate}
        fallback={
          <div class={`w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 ${sizeClasses[props.size ?? 'md']}`}>
            <div
              class={`${colorClasses[color()]} ${sizeClasses[props.size ?? 'md']} rounded-full transition-all duration-500 ease-out`}
              style={{ width: `${percentage()}%` }}
            />
          </div>
        }
      >
        <div
          class={`relative w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 ${sizeClasses[props.size ?? 'md']}`}
          role="progressbar"
          aria-valuetext="En progreso"
        >
          <div class={`progress-indeterminate absolute inset-y-0 w-1/3 rounded-full ${colorClasses[color()]}`} />
        </div>
      </Show>
    </div>
  );
}
