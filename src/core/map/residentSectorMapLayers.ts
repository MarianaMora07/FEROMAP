import maplibregl, { type LngLatBoundsLike, type Map as MapLibreMap, type Marker, Popup } from 'maplibre-gl';
import type { ContainerCollection, RouteCollection, SectorCollection, SectorFeature } from '../types/geo';
import type { ResidentCollectionPoint } from '../api/resident';
import type { LiveVehicle } from '../api/monitoring';
import { containerBucket, ensureOperationalRouteLayer } from './operationalMapLayers';

export const RESIDENT_SECTOR_ROUTE_SOURCE_ID = 'resident-sector-route';
export const RESIDENT_SECTOR_ROUTE_LAYER_ID = 'resident-sector-route-line';
export const RESIDENT_SECTOR_ROUTE_GLOW_LAYER_ID = 'resident-sector-route-glow';
export const RESIDENT_SECTOR_HIGHLIGHT_SOURCE_ID = 'resident-sector-highlight';
export const RESIDENT_SECTOR_HIGHLIGHT_FILL_ID = 'resident-sector-highlight-fill';
export const RESIDENT_SECTOR_HIGHLIGHT_LINE_ID = 'resident-sector-highlight-line';

export type ResidentMapFocus = 'truck' | 'sector' | 'routes';

export interface ResidentMapStop {
  code: string;
  lng: number;
  lat: number;
  sectorName?: string;
}

export function parseResidentMapFocus(value: string | string[] | undefined): ResidentMapFocus {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'truck' || raw === 'routes' || raw === 'sector') return raw;
  return 'sector';
}

export function parseResidentScope(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'sector';
}

export function findSectorFeature(
  sectors: SectorCollection,
  sectorName: string,
): SectorFeature | undefined {
  const normalized = sectorName.trim().toLowerCase();
  return sectors.features.find(
    (feature) => feature.properties.name.trim().toLowerCase() === normalized,
  );
}

export function containersFromResidentPoints(
  points: ResidentCollectionPoint[],
  sectorName: string,
): ContainerCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((point) => {
      const bucket = containerBucket(point.fillLevel);
      return {
        type: 'Feature',
        properties: {
          id: point.id,
          sector: sectorName,
          fillLevel: point.fillLevel,
          priority: point.fillLevel >= 80 ? 'critica' : point.fillLevel >= 60 ? 'alta' : 'media',
          lastCollection: point.lastEmptiedAt ?? '—',
          capacityKg: 1200,
          bucket,
        },
        geometry: {
          type: 'Point',
          coordinates: [point.lng, point.lat],
        },
      };
    }),
  };
}

export function filterRoutesForSector(
  routes: RouteCollection,
  routeIds: number[],
): RouteCollection {
  if (routeIds.length === 0) {
    return { type: 'FeatureCollection', features: [] };
  }
  const allowed = new Set(routeIds);
  return {
    type: 'FeatureCollection',
    features: routes.features.filter((feature) => {
      const routeId = (feature.properties as { routeId?: number }).routeId;
      return routeId != null && allowed.has(routeId);
    }),
  };
}

export function ensureResidentSectorRouteLayer(map: MapLibreMap, routes: RouteCollection) {
  ensureOperationalRouteLayer(
    map,
    routes,
    RESIDENT_SECTOR_ROUTE_SOURCE_ID,
    RESIDENT_SECTOR_ROUTE_LAYER_ID,
  );

  if (!map.getLayer(RESIDENT_SECTOR_ROUTE_GLOW_LAYER_ID)) {
    map.addLayer(
      {
        id: RESIDENT_SECTOR_ROUTE_GLOW_LAYER_ID,
        type: 'line',
        source: RESIDENT_SECTOR_ROUTE_SOURCE_ID,
        paint: {
          'line-color': '#34D634',
          'line-width': 10,
          'line-opacity': 0.18,
        },
      },
      RESIDENT_SECTOR_ROUTE_LAYER_ID,
    );
  }

  if (map.getLayer(RESIDENT_SECTOR_ROUTE_LAYER_ID)) {
    map.setPaintProperty(RESIDENT_SECTOR_ROUTE_LAYER_ID, 'line-color', '#34D634');
    map.setPaintProperty(RESIDENT_SECTOR_ROUTE_LAYER_ID, 'line-width', 5);
  }
}

export function ensureResidentSectorHighlight(map: MapLibreMap, sectorFeature: SectorFeature | undefined) {
  const data: SectorCollection = sectorFeature
    ? { type: 'FeatureCollection', features: [sectorFeature] }
    : { type: 'FeatureCollection', features: [] };

  if (!map.getSource(RESIDENT_SECTOR_HIGHLIGHT_SOURCE_ID)) {
    map.addSource(RESIDENT_SECTOR_HIGHLIGHT_SOURCE_ID, { type: 'geojson', data });
    map.addLayer({
      id: RESIDENT_SECTOR_HIGHLIGHT_FILL_ID,
      type: 'fill',
      source: RESIDENT_SECTOR_HIGHLIGHT_SOURCE_ID,
      paint: {
        'fill-color': '#34D634',
        'fill-opacity': 0.12,
      },
    });
    map.addLayer({
      id: RESIDENT_SECTOR_HIGHLIGHT_LINE_ID,
      type: 'line',
      source: RESIDENT_SECTOR_HIGHLIGHT_SOURCE_ID,
      paint: {
        'line-color': '#34D634',
        'line-width': 2.5,
        'line-opacity': 0.85,
      },
    });
    return;
  }

  (map.getSource(RESIDENT_SECTOR_HIGHLIGHT_SOURCE_ID) as maplibregl.GeoJSONSource).setData(data);
}

export function syncResidentNextStopMarker(
  map: MapLibreMap,
  stop: ResidentMapStop | null | undefined,
  holder: { marker?: Marker },
) {
  if (holder.marker) {
    holder.marker.remove();
    holder.marker = undefined;
  }
  if (!stop) return;

  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'gis-marker';
  el.setAttribute('aria-label', `Próxima parada ${stop.code}`);
  el.innerHTML =
    '<span style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9999px;background:#34D634;box-shadow:0 0 0 6px rgba(52,214,52,.35);border:3px solid #fff;font-size:11px;font-weight:700;color:#fff">★</span>';

  holder.marker = new maplibregl.Marker({ element: el })
    .setLngLat([stop.lng, stop.lat])
    .setPopup(
      new Popup({ offset: 16, maxWidth: '240px' }).setHTML(
        `<strong>Próxima parada en tu sector</strong><br/><span style="font-size:12px;color:#64748b">${stop.code}${stop.sectorName ? ` · ${stop.sectorName}` : ''}</span>`,
      ),
    )
    .addTo(map);
}

export function boundsFromPoints(points: Array<{ lng: number; lat: number }>): maplibregl.LngLatBounds | null {
  const bounds = new maplibregl.LngLatBounds();
  let count = 0;
  for (const point of points) {
    bounds.extend([point.lng, point.lat]);
    count += 1;
  }
  if (count === 0) return null;
  return bounds;
}

export function boundsFromSectorFeature(feature: SectorFeature): maplibregl.LngLatBounds {
  const bounds = new maplibregl.LngLatBounds();
  for (const ring of feature.geometry.coordinates) {
    for (const coord of ring) {
      bounds.extend(coord as [number, number]);
    }
  }
  return bounds;
}

export function fitMapToSector(
  map: MapLibreMap,
  options: {
    sectorFeature?: SectorFeature;
    points?: Array<{ lng: number; lat: number }>;
    padding?: number;
  },
) {
  const padding = options.padding ?? 56;
  if (options.sectorFeature) {
    map.fitBounds(boundsFromSectorFeature(options.sectorFeature) as LngLatBoundsLike, {
      padding,
      maxZoom: 15,
      duration: 800,
    });
    return;
  }
  const pointBounds = options.points ? boundsFromPoints(options.points) : null;
  if (!pointBounds) return;
  if (options.points?.length === 1) {
    const only = options.points[0];
    map.flyTo({ center: [only.lng, only.lat], zoom: 14.5, essential: true });
    return;
  }
  map.fitBounds(pointBounds as LngLatBoundsLike, { padding, maxZoom: 15, duration: 800 });
}

export function resolveResidentNextStop(
  overview: {
    sectorName: string;
    proximity: { nextStopInSector: string | null };
    collectionPoints: Array<{ id: string; lng: number; lat: number }>;
  },
): ResidentMapStop | null {
  const code = overview.proximity.nextStopInSector;
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  const point = overview.collectionPoints.find(
    (item) =>
      item.id.trim().toUpperCase() === normalized ||
      item.id.replace(/^CNT-/i, '').toUpperCase() === normalized.replace(/^CNT-/i, ''),
  );
  if (!point) return null;
  return { code, lng: point.lng, lat: point.lat, sectorName: overview.sectorName };
}

export function resolveResidentTruck(
  fleet: LiveVehicle[],
  vehicleCode: string | null | undefined,
): LiveVehicle | undefined {
  if (!vehicleCode) return undefined;
  const normalized = vehicleCode.trim().toUpperCase();
  return fleet.find((vehicle) => vehicle.id.trim().toUpperCase() === normalized);
}

export function residentMapMetrics(params: {
  totalPoints: number;
  criticalPoints: number;
  activeRoutes: number;
  truckCode?: string | null;
}) {
  return [
    {
      id: 'sector-points',
      label: 'Contenedores en sector',
      value: String(params.totalPoints),
      tone: 'green' as const,
      icon: 'trash' as const,
    },
    {
      id: 'sector-critical',
      label: 'Críticos en sector',
      value: String(params.criticalPoints),
      tone: 'red' as const,
      icon: 'trash' as const,
    },
    {
      id: 'sector-routes',
      label: 'Rutas activas',
      value: String(params.activeRoutes),
      tone: 'green' as const,
      icon: 'route' as const,
    },
    {
      id: 'sector-truck',
      label: 'Camión asignado',
      value: params.truckCode ?? '—',
      tone: 'blue' as const,
      icon: 'truck' as const,
    },
  ];
}
