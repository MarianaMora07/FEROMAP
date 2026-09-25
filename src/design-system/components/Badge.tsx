import { type JSX, splitProps } from 'solid-js';
import { useLocale } from '../../core/i18n/solid';

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
  warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  danger: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
  info: 'bg-fero-blue/10 text-fero-blue border-fero-blue/20',
  default: 'bg-app text-text-secondary border-default',
  outline: 'border-default bg-transparent text-text-secondary',
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
  const tr = useLocale();
  const statusMap: Record<string, { variant: BadgeVariant; key: string; label: string }> = {
    activo: { variant: 'success', key: 'status.activo', label: 'Activo' },
    'en-ruta': { variant: 'success', key: 'status.enRuta', label: 'En ruta' },
    mantenimiento: { variant: 'warning', key: 'status.mantenimiento', label: 'Mantenimiento' },
    'fuera-de-servicio': { variant: 'danger', key: 'status.fueraDeServicio', label: 'Fuera de servicio' },
    lleno: { variant: 'warning', key: 'status.lleno', label: 'Lleno' },
    critico: { variant: 'danger', key: 'status.critico', label: 'Crítico' },
    normal: { variant: 'success', key: 'status.normal', label: 'Normal' },
    parcial: { variant: 'default', key: 'status.parcial', label: 'Parcial' },
    inactivo: { variant: 'default', key: 'status.inactivo', label: 'Inactivo' },
    disponible: { variant: 'success', key: 'status.disponible', label: 'Disponible' },
    ocupado: { variant: 'warning', key: 'status.ocupado', label: 'Ocupado' },
    detenido: { variant: 'danger', key: 'status.detenido', label: 'Detenido' },
    nueva: { variant: 'danger', key: 'status.nueva', label: 'Nueva' },
    'en-progreso': { variant: 'warning', key: 'status.enProgreso', label: 'En progreso' },
    informativa: { variant: 'info', key: 'status.informativa', label: 'Informativa' },
    resuelta: { variant: 'success', key: 'status.resuelta', label: 'Resuelta' },
  };

  const config = () =>
    statusMap[props.status] ?? { variant: 'default' as BadgeVariant, key: '', label: props.status };

  return (
    <Badge variant={config().variant} dot class={props.class}>
      {config().key ? tr(config().key, config().label) : config().label}
    </Badge>
  );
}
