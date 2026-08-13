import maplibregl, { type Map as MapLibreMap, type Marker, Popup } from 'maplibre-gl';
import type { RouteCollection } from '../types/geo';
import type { OperatorRouteStop } from '../api/operator';
import { ensureOperationalRouteLayer } from './operationalMapLayers';

export const OPERATOR_ROUTE_SOURCE_ID = 'operator-my-route';
export const OPERATOR_ROUTE_LAYER_ID = 'operator-my-route-line';
export const OPERATOR_ROUTE_GLOW_LAYER_ID = 'operator-my-route-glow';

export function routeCollectionFromStops(
  stops: OperatorRouteStop[],
  options?: { color?: string; label?: string },
): RouteCollection {
  const color = options?.color ?? '#1143F3';
  const coordinates = [...stops]
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
    .filter((stop) => stop.lng != null && stop.lat != null)
    .map((stop) => [stop.lng!, stop.lat!]);

  if (coordinates.length < 2) {
    return { type: 'FeatureCollection', features: [] };
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          id: 'my-route-today',
          color,
          label: options?.label ?? 'Mi ruta hoy',
        },
        geometry: {
          type: 'LineString',
          coordinates,
        },
      },
    ],
  };
}

export function ensureOperatorRouteLayer(map: MapLibreMap, routes: RouteCollection) {
  ensureOperationalRouteLayer(map, routes, OPERATOR_ROUTE_SOURCE_ID, OPERATOR_ROUTE_LAYER_ID);

  if (!map.getLayer(OPERATOR_ROUTE_GLOW_LAYER_ID)) {
    map.addLayer(
      {
        id: OPERATOR_ROUTE_GLOW_LAYER_ID,
        type: 'line',
        source: OPERATOR_ROUTE_SOURCE_ID,
        paint: {
          'line-color': '#1143F3',
          'line-width': 10,
          'line-opacity': 0.15,
        },
      },
      OPERATOR_ROUTE_LAYER_ID,
    );
  }

  if (map.getLayer(OPERATOR_ROUTE_LAYER_ID)) {
    map.setPaintProperty(OPERATOR_ROUTE_LAYER_ID, 'line-color', '#1143F3');
    map.setPaintProperty(OPERATOR_ROUTE_LAYER_ID, 'line-width', 5);
  }
}

export function syncNextStopMarker(
  map: MapLibreMap,
  stop: OperatorRouteStop | null | undefined,
  holder: { marker?: Marker },
) {
  if (holder.marker) {
    holder.marker.remove();
    holder.marker = undefined;
  }
  if (!stop || stop.lng == null || stop.lat == null) return;

  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'gis-marker';
  el.setAttribute('aria-label', `Próxima parada ${stop.code}`);
  el.innerHTML =
    '<span style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9999px;background:#1143F3;box-shadow:0 0 0 6px rgba(17,67,243,.35);border:3px solid #fff;font-size:11px;font-weight:700;color:#fff">★</span>';

  holder.marker = new maplibregl.Marker({ element: el })
    .setLngLat([stop.lng, stop.lat])
    .setPopup(
      new Popup({ offset: 16, maxWidth: '240px' }).setHTML(
        `<strong>Próxima parada</strong><br/><span style="font-size:12px;color:#64748b">${stop.code} · ${stop.sectorName ?? ''}</span>`,
      ),
    )
    .addTo(map);
}

export function fitMapToStops(map: MapLibreMap, stops: OperatorRouteStop[], padding = 48) {
  const bounds = new maplibregl.LngLatBounds();
  let count = 0;
  for (const stop of stops) {
    if (stop.lng == null || stop.lat == null) continue;
    bounds.extend([stop.lng, stop.lat]);
    count += 1;
  }
  if (count === 0) return;
  if (count === 1) {
    const first = stops.find((stop) => stop.lng != null && stop.lat != null);
    if (first?.lng != null && first.lat != null) {
      map.flyTo({ center: [first.lng, first.lat], zoom: 14.5, essential: true });
    }
    return;
  }
  map.fitBounds(bounds, { padding, maxZoom: 15, duration: 800 });
}
