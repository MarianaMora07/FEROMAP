import { type JSX, splitProps } from 'solid-js';

interface CardProps {
  children: JSX.Element;
  class?: string;
  padding?: boolean;
  hover?: boolean;
  glass?: boolean;
}

export function Card(props: CardProps) {
  const [local, others] = splitProps(props, ['class', 'padding', 'hover', 'glass', 'children']);

  const padding = () => local.padding !== false;
  const hover = () => local.hover ?? false;
  const glass = () => local.glass ?? false;

  return (
    <div
      class={`rounded-[var(--radius-lg)] border transition-all duration-200 ${
        glass()
          ? 'glass shadow-md'
          : 'bg-surface border-border shadow-xs'
      } ${hover() ? 'hover:shadow-md hover:border-fero-blue/20 cursor-pointer' : ''} ${
        padding() ? 'p-4' : ''
      } dark:bg-dark-surface dark:border-dark-border ${local.class ?? ''}`}
      {...others}
    >
      {local.children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: JSX.Element;
  class?: string;
}

export function CardHeader(props: CardHeaderProps) {
  return (
    <div class={`flex items-center justify-between mb-4 ${props.class ?? ''}`}>
      <div>
        <h3 class="font-heading font-semibold text-text-primary dark:text-white">
          {props.title}
        </h3>
        {props.subtitle && (
          <p class="text-sm text-text-muted mt-0.5">{props.subtitle}</p>
        )}
      </div>
      {props.action && <div>{props.action}</div>}
    </div>
  );
}
