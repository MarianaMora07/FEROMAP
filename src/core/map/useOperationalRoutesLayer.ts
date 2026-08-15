import { createEffect } from 'solid-js';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { RouteCollection } from '../types/geo';
import {
  ensureOperationalRouteLayer,
  operationalRouteLayerIds,
  syncOperationalRouteLayerFilters,
} from './operationalMapLayers';

export interface UseOperationalRoutesLayerOptions {
  map: () => MapLibreMap | undefined;
  mapReady: () => boolean;
  routes: () => RouteCollection;
  sourceId?: string;
  splitByStatus?: boolean;
  routesVisible?: () => boolean;
  enabledRouteIds?: () => Array<number | string> | null;
  playbackActive?: () => boolean;
  playbackOpacity?: { active: number; pending: number };
  onSync?: (map: MapLibreMap) => void;
}

const DEFAULT_PLAYBACK_OPACITY = { active: 0.2, pending: 0.12 };
const DEFAULT_NORMAL_OPACITY = { active: 0.95, pending: 0.75 };

export function useOperationalRoutesLayer(options: UseOperationalRoutesLayerOptions) {
  createEffect(() => {
    const map = options.map();
    if (!map?.isStyleLoaded() || !options.mapReady()) return;

    const routes = options.routes();
    const sourceId = options.sourceId ?? 'operational-routes';
    const splitByStatus = options.splitByStatus ?? true;

    ensureOperationalRouteLayer(map, routes, sourceId, { splitByStatus });

    syncOperationalRouteLayerFilters(map, sourceId, {
      routesVisible: options.routesVisible?.() ?? true,
      enabledRouteIds: options.enabledRouteIds?.() ?? null,
      splitByStatus,
    });

    const dimmed = options.playbackActive?.() ?? false;
    const opacity = dimmed
      ? (options.playbackOpacity ?? DEFAULT_PLAYBACK_OPACITY)
      : DEFAULT_NORMAL_OPACITY;
    const { active, pending } = operationalRouteLayerIds(sourceId);

    if (map.getLayer(active)) {
      map.setPaintProperty(active, 'line-opacity', opacity.active);
    }
    if (map.getLayer(pending)) {
      map.setPaintProperty(pending, 'line-opacity', opacity.pending);
    }

    options.onSync?.(map);
  });
}
