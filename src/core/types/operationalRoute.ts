/** Estado de una ruta optimizada en BD (`optimized_routes.status`). */
export type OperationalRouteStatus = 'pending' | 'in_progress' | 'completed';

export type OperationalRouteLinePattern = 'solid' | 'dashed';

export type OperationalRouteMapVisibility = 'visible' | 'muted' | 'hidden';

/** Estilo de capa MapLibre por estado de ruta en mapas operativos. */
export interface OperationalRouteMapStyle {
  visibility: OperationalRouteMapVisibility;
  linePattern: OperationalRouteLinePattern;
  opacity: number;
}

/**
 * Estados incluidos por defecto en `/map/context` y mapas operativos.
 * `completed` es opcional (tenue); no se pide al API salvo modo histórico.
 */
export const OPERATIONAL_ROUTE_STATUSES_ON_MAP: readonly OperationalRouteStatus[] = [
  'pending',
  'in_progress',
] as const;

/** Reglas visuales acordadas para capas de rutas en mapa. */
export const OPERATIONAL_ROUTE_MAP_STYLES: Record<
  OperationalRouteStatus,
  OperationalRouteMapStyle
> = {
  pending: {
    visibility: 'visible',
    linePattern: 'dashed',
    opacity: 0.75,
  },
  in_progress: {
    visibility: 'visible',
    linePattern: 'solid',
    opacity: 0.95,
  },
  completed: {
    visibility: 'muted',
    linePattern: 'solid',
    opacity: 0.35,
  },
};

export function isOperationalRouteStatus(value: string): value is OperationalRouteStatus {
  return value === 'pending' || value === 'in_progress' || value === 'completed';
}

export function operationalRouteShownOnMap(status: OperationalRouteStatus): boolean {
  const style = OPERATIONAL_ROUTE_MAP_STYLES[status];
  return style.visibility !== 'hidden';
}
