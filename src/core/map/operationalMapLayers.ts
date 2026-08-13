import maplibregl, { type FilterSpecification, type Map as MapLibreMap, type Marker, Popup } from 'maplibre-gl';
import type { ContainerCollection, RouteCollection } from '../types/geo';
import type { LiveVehicle } from '../api/monitoring';
import { OPERATIONAL_ROUTE_MAP_STYLES } from '../types/operationalRoute';

export const CONTAINER_BUCKET_COLORS: Record<string, string> = {
  critical: '#ef4444',
  full: '#f59e0b',
  normal: '#34D634',
  partial: '#94a3b8',
};

export const OPERATIONAL_ROUTES_SOURCE_ID = 'operational-routes';
export const OPERATIONAL_ROUTES_PENDING_LAYER_ID = 'operational-routes-pending';
export const OPERATIONAL_ROUTES_ACTIVE_LAYER_ID = 'operational-routes-active';

export type OperationalRouteFeatureProps = {
  id?: string;
  routeId?: number | string;
  label?: string;
  color?: string;
  status?: string;
  vehicleId?: string;
  routeKind?: string;
};

export type EnsureOperationalRouteLayerOptions = {
  splitByStatus?: boolean;
  singleLayerId?: string;
};

export function operationalRouteLayerIds(sourceId: string) {
  return {
    pending: `${sourceId}-pending`,
    active: `${sourceId}-active`,
  };
}

export function routeLayerStateKey(routeId: number | string): string {
  return `route-${routeId}`;
}

export function normalizeOperationalRoutes(routes: RouteCollection): RouteCollection {
  return {
    ...routes,
    features: routes.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        status:
          (feature.properties as OperationalRouteFeatureProps).status ??
          (feature.properties as { type?: string }).type === 'active'
            ? 'in_progress'
            : 'in_progress',
      },
    })),
  };
}

export function enabledOperationalRouteIds(
  routes: RouteCollection,
  layerState: Record<string, boolean>,
): Array<number | string> | null {
  if (!layerState.routes) return [];
  const features = routes.features;
  if (features.length === 0) return [];

  const enabled: Array<number | string> = [];
  for (const feature of features) {
    const props = feature.properties as OperationalRouteFeatureProps;
    const routeId = props.routeId ?? props.id;
    if (routeId == null) continue;
    const key = routeLayerStateKey(routeId);
    if (layerState[key] === false) continue;
    enabled.push(routeId);
  }
  if (enabled.length === features.length) return null;
  return enabled;
}

function routeIdVisibilityFilter(
  enabledRouteIds: Array<number | string> | null,
): FilterSpecification | null {
  if (enabledRouteIds === null) return null;
  if (enabledRouteIds.length === 0) {
    return ['==', ['get', 'routeId'], '__none__'];
  }
  return ['in', ['to-string', ['coalesce', ['get', 'routeId'], ['get', 'id']]], ['literal', enabledRouteIds.map(String)]];
}

function combineFilters(
  statusFilter: FilterSpecification,
  routeFilter: FilterSpecification | null,
): FilterSpecification {
  if (!routeFilter) return statusFilter;
  return ['all', statusFilter, routeFilter];
}

export function syncOperationalRouteLayerFilters(
  map: MapLibreMap,
  sourceId: string,
  options: {
    routesVisible: boolean;
    enabledRouteIds: Array<number | string> | null;
    splitByStatus?: boolean;
    singleLayerId?: string;
  },
) {
  const visibility = options.routesVisible ? 'visible' : 'none';
  const routeFilter = routeIdVisibilityFilter(options.enabledRouteIds);
  const splitByStatus = options.splitByStatus ?? sourceId === OPERATIONAL_ROUTES_SOURCE_ID;

  if (splitByStatus) {
    const { pending, active } = operationalRouteLayerIds(sourceId);
    for (const layerId of [pending, active]) {
      if (!map.getLayer(layerId)) continue;
      map.setLayoutProperty(layerId, 'visibility', visibility);
    }
    if (!options.routesVisible) return;

    if (map.getLayer(pending)) {
      map.setFilter(
        pending,
        combineFilters(['==', ['get', 'status'], 'pending'], routeFilter),
      );
    }
    if (map.getLayer(active)) {
      map.setFilter(
        active,
        combineFilters(
          [
            'any',
            ['==', ['get', 'status'], 'in_progress'],
            ['!', ['has', 'status']],
          ],
          routeFilter,
        ),
      );
    }
    return;
  }

  const layerId = options.singleLayerId;
  if (!layerId || !map.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, 'visibility', visibility);
  if (routeFilter) map.setFilter(layerId, routeFilter);
}

export function containerBucket(fillLevel: number): 'critical' | 'full' | 'normal' | 'partial' {
  if (fillLevel >= 80) return 'critical';
  if (fillLevel >= 60) return 'full';
  if (fillLevel >= 40) return 'normal';
  return 'partial';
}

export function vehicleStatusKey(status: string): string {
  return status.replace('-', '_');
}

export function ensureOperationalRouteLayer(
  map: MapLibreMap,
  routes: RouteCollection,
  sourceId = OPERATIONAL_ROUTES_SOURCE_ID,
  options: EnsureOperationalRouteLayerOptions | string = {},
) {
  const resolved: EnsureOperationalRouteLayerOptions =
    typeof options === 'string' ? { splitByStatus: false, singleLayerId: options } : options;

  const splitByStatus =
    resolved.splitByStatus ??
    (sourceId === OPERATIONAL_ROUTES_SOURCE_ID || sourceId === 'live-routes');
  const data = normalizeOperationalRoutes(routes);

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, { type: 'geojson', data });
    if (splitByStatus) {
      const { pending, active } = operationalRouteLayerIds(sourceId);
      const pendingStyle = OPERATIONAL_ROUTE_MAP_STYLES.pending;
      const activeStyle = OPERATIONAL_ROUTE_MAP_STYLES.in_progress;

      map.addLayer({
        id: pending,
        type: 'line',
        source: sourceId,
        filter: ['==', ['get', 'status'], 'pending'],
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#1143F3'],
          'line-width': 4,
          'line-opacity': pendingStyle.opacity,
          'line-dasharray': [2, 2],
        },
      });
      map.addLayer({
        id: active,
        type: 'line',
        source: sourceId,
        filter: [
          'any',
          ['==', ['get', 'status'], 'in_progress'],
          ['!', ['has', 'status']],
        ],
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#34D634'],
          'line-width': 4,
          'line-opacity': activeStyle.opacity,
        },
      });
      return;
    }

    const layerId = resolved.singleLayerId ?? `${sourceId}-line`;
    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#34D634'],
        'line-width': 4,
        'line-opacity': 0.9,
      },
    });
    return;
  }

  (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(data);
}

export interface FleetMarkerOptions {
  onSelect?: (vehicle: LiveVehicle) => void;
  buildPopupHtml?: (vehicle: LiveVehicle) => string;
  createMarkerElement: (vehicle: LiveVehicle) => HTMLElement;
}

export function syncFleetMarkers(
  map: MapLibreMap,
  fleet: LiveVehicle[],
  markersById: Map<string, Marker>,
  options: FleetMarkerOptions,
) {
  if (!map.isStyleLoaded()) return;

  const nextIds = new Set(fleet.map((vehicle) => vehicle.id));
  for (const [id, marker] of markersById.entries()) {
    if (!nextIds.has(id)) {
      marker.remove();
      markersById.delete(id);
    }
  }

  for (const vehicle of fleet) {
    const existing = markersById.get(vehicle.id);
    if (existing) {
      existing.setLngLat([vehicle.lng, vehicle.lat]);
      continue;
    }

    const element = options.createMarkerElement(vehicle);
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      options.onSelect?.(vehicle);
    });

    const marker = new maplibregl.Marker({ element }).setLngLat([vehicle.lng, vehicle.lat]);

    if (options.buildPopupHtml) {
      marker.setPopup(
        new Popup({ offset: 18, maxWidth: '280px' }).setHTML(options.buildPopupHtml(vehicle)),
      );
    }

    marker.addTo(map);
    markersById.set(vehicle.id, marker);
  }
}

export interface ContainerMarkerOptions {
  visibleBuckets?: Set<string>;
  createMarkerElement: (color: string) => HTMLElement;
  buildPopupHtml?: (feature: ContainerCollection['features'][number]) => string;
}

export function syncContainerMarkers(
  map: MapLibreMap,
  containers: ContainerCollection,
  markers: Marker[],
  options: ContainerMarkerOptions,
) {
  if (!map.isStyleLoaded()) return;

  markers.forEach((marker) => marker.remove());
  markers.length = 0;

  for (const feature of containers.features) {
    const bucket =
      (feature.properties as { bucket?: string }).bucket ??
      containerBucket(feature.properties.fillLevel);
    if (options.visibleBuckets && !options.visibleBuckets.has(bucket)) continue;

    const color = CONTAINER_BUCKET_COLORS[bucket] ?? CONTAINER_BUCKET_COLORS.normal;
    const element = options.createMarkerElement(color);
    const marker = new maplibregl.Marker({ element }).setLngLat(
      feature.geometry.coordinates as [number, number],
    );

    if (options.buildPopupHtml) {
      marker.setPopup(
        new Popup({ offset: 18, maxWidth: '280px' }).setHTML(options.buildPopupHtml(feature)),
      );
    }

    marker.addTo(map);
    markers.push(marker);
  }
}
