import { type JSX, splitProps } from 'solid-js';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'default' | 'outline';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  children: JSX.Element;
  class?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-fero-green/15 text-fero-green-dark border-fero-green/30',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-fero-blue/10 text-fero-blue border-fero-blue/20',
  default: 'bg-slate-50 text-slate-700 border-slate-200',
  outline: 'bg-transparent text-text-secondary border-border',
};

const dotColors: Record<BadgeVariant, string> = {
  success: 'bg-fero-green-dark',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-fero-blue',
  default: 'bg-slate-400',
  outline: 'bg-text-muted',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
};

export function Badge(props: BadgeProps) {
  const [local, others] = splitProps(props, ['variant', 'size', 'dot', 'class']);

  const variant = () => local.variant ?? 'default';
  const size = () => local.size ?? 'sm';

  return (
    <span
      class={`inline-flex items-center gap-1.5 font-medium rounded-full border ${variantClasses[variant()]} ${sizeClasses[size()]} ${local.class ?? ''}`}
      {...others}
    >
      {local.dot && (
        <span class={`w-1.5 h-1.5 rounded-full ${dotColors[variant()]}`} />
      )}
      {props.children}
    </span>
  );
}

// Predefined status badges
export function StatusBadge(props: { status: string; class?: string }) {
  const statusMap: Record<string, { variant: BadgeVariant; label: string }> = {
    activo: { variant: 'success', label: 'Activo' },
    'en-ruta': { variant: 'success', label: 'En ruta' },
    mantenimiento: { variant: 'warning', label: 'Mantenimiento' },
    'fuera-de-servicio': { variant: 'danger', label: 'Fuera de servicio' },
    lleno: { variant: 'warning', label: 'Lleno' },
    critico: { variant: 'danger', label: 'Crítico' },
    normal: { variant: 'success', label: 'Normal' },
    parcial: { variant: 'default', label: 'Parcial' },
    inactivo: { variant: 'default', label: 'Inactivo' },
    disponible: { variant: 'success', label: 'Disponible' },
    ocupado: { variant: 'warning', label: 'Ocupado' },
    detenido: { variant: 'danger', label: 'Detenido' },
    nueva: { variant: 'danger', label: 'Nueva' },
    'en-progreso': { variant: 'warning', label: 'En progreso' },
    informativa: { variant: 'info', label: 'Informativa' },
    resuelta: { variant: 'success', label: 'Resuelta' },
  };

  const config = () => statusMap[props.status] ?? { variant: 'default' as BadgeVariant, label: props.status };

  return (
    <Badge variant={config().variant} dot class={props.class}>
      {config().label}
    </Badge>
  );
}
