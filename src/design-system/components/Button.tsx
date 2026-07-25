import { type JSX, Show, splitProps } from 'solid-js';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'gradient';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: JSX.Element;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-fero-green-mid text-white hover:bg-fero-green-dark active:bg-fero-green-dark shadow-sm',
  secondary: 'bg-fero-blue text-white hover:bg-fero-blue-dark active:bg-fero-blue-dark shadow-sm',
  danger: 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700 shadow-sm',
  ghost: 'bg-transparent text-text-secondary hover:bg-surface-hover active:bg-surface-active',
  outline: 'bg-transparent text-text-primary border border-border hover:bg-surface-hover active:bg-surface-active',
  gradient:
    'bg-linear-to-r from-fero-green-dark via-fero-green-mid to-fero-green text-white hover:brightness-105 active:brightness-95 shadow-sm',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2.5',
};

export function Button(props: ButtonProps) {
  const [local, others] = splitProps(props, ['variant', 'size', 'loading', 'icon', 'class', 'children']);

  const variant = () => local.variant ?? 'primary';
  const size = () => local.size ?? 'md';

  return (
    <button
      class={`inline-flex items-center justify-center font-medium rounded-[var(--radius-lg)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant()]} ${sizeClasses[size()]} ${local.class ?? ''}`}
      disabled={others.disabled || local.loading}
      {...others}
    >
      <Show when={local.loading}>
        <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </Show>
      <Show when={!local.loading && local.icon}>
        {local.icon}
      </Show>
      {local.children}
    </button>
  );
}
