import maplibregl, { type Map as MapLibreMap, type Marker, Popup } from 'maplibre-gl';
import type { ContainerCollection, RouteCollection } from '../types/geo';
import type { LiveVehicle } from '../api/monitoring';

export const CONTAINER_BUCKET_COLORS: Record<string, string> = {
  critical: '#ef4444',
  full: '#f59e0b',
  normal: '#34D634',
  partial: '#94a3b8',
};

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
  sourceId = 'operational-routes',
  layerId = 'operational-routes-line',
) {
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, { type: 'geojson', data: routes });
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
  (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(routes);
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
