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
          : 'border-default bg-elevated shadow-xs'
      } ${hover() ? 'cursor-pointer hover:border-fero-blue/20 hover:shadow-md' : ''} ${
        padding() ? 'p-4' : ''
      } ${local.class ?? ''}`}
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
    <div class={`mb-4 flex items-center justify-between ${props.class ?? ''}`}>
      <div>
        <h3 class="font-heading font-semibold text-text-primary">{props.title}</h3>
        {props.subtitle && <p class="mt-0.5 text-sm text-text-muted">{props.subtitle}</p>}
      </div>
      {props.action && <div>{props.action}</div>}
    </div>
  );
}
