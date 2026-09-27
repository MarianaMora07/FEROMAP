import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import type { RouteCollection } from '../types/geo';
import type { MapFacilities } from '../utils/landfillUx';

export const LANDFILL_SOURCE_ID = 'operational-landfill';
export const LANDFILL_LAYER_ID = 'operational-landfill-point';
export const ROUTE_LANDFILL_STOPS_SOURCE_ID = 'route-landfill-stops';

export function createLandfillMarkerElement(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'landfill-map-marker';
  el.setAttribute('data-testid', 'landfill-map-marker');
  el.innerHTML =
    '<span class="landfill-map-marker__pin" title="Vertedero">♻</span>';
  return el;
}

export function createRouteLandfillStopElement(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'route-landfill-stop-marker';
  el.setAttribute('data-testid', 'route-landfill-stop-marker');
  el.innerHTML = '<span class="route-landfill-stop-marker__dot">♻</span>';
  return el;
}

export function syncLandfillFacilityMarker(
  map: MapLibreMap,
  facilities: MapFacilities,
  markerHolder: { marker?: Marker },
) {
  if (!map.isStyleLoaded()) return;
  const lngLat: [number, number] = [facilities.landfillLon, facilities.landfillLat];
  if (!markerHolder.marker) {
    markerHolder.marker = new maplibregl.Marker({ element: createLandfillMarkerElement(), anchor: 'bottom' })
      .setLngLat(lngLat)
      .addTo(map);
    return;
  }
  markerHolder.marker.setLngLat(lngLat);
}

export function removeLandfillFacilityMarker(markerHolder: { marker?: Marker }) {
  markerHolder.marker?.remove();
  markerHolder.marker = undefined;
}

export function ensureLandfillGeoJsonLayer(map: MapLibreMap, facilities: MapFacilities) {
  const data = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: { label: 'Vertedero', kind: 'landfill' },
        geometry: {
          type: 'Point' as const,
          coordinates: [facilities.landfillLon, facilities.landfillLat],
        },
      },
    ],
  };

  if (!map.getSource(LANDFILL_SOURCE_ID)) {
    map.addSource(LANDFILL_SOURCE_ID, { type: 'geojson', data });
    map.addLayer({
      id: LANDFILL_LAYER_ID,
      type: 'circle',
      source: LANDFILL_SOURCE_ID,
      paint: {
        'circle-radius': 10,
        'circle-color': '#78716c',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });
    return;
  }
  (map.getSource(LANDFILL_SOURCE_ID) as maplibregl.GeoJSONSource).setData(data);
}

export function syncRouteLandfillStopMarkers(
  map: MapLibreMap,
  routes: RouteCollection,
  markers: Marker[],
) {
  if (!map.isStyleLoaded()) return;
  markers.forEach((marker) => marker.remove());
  markers.length = 0;

  for (const feature of routes.features) {
    for (const stop of feature.properties.stops ?? []) {
      if (stop.stopType !== 'landfill') continue;
      const marker = new maplibregl.Marker({
        element: createRouteLandfillStopElement(),
        anchor: 'center',
      })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map);
      markers.push(marker);
    }
  }
}
