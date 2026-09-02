import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import type { CollectionPoint } from '../types/collectionPoint';
import { fillStatusColor } from '../types/collectionPoint';
import type { SectorCollection } from '../types/geo';

export const COLLECTION_POINTS_SOURCE_ID = 'catalog-collection-points';
export const COLLECTION_POINTS_LAYER_ID = 'catalog-collection-points-circles';
export const COLLECTION_POINTS_SECTORS_SOURCE_ID = 'catalog-collection-points-sectors';
export const COLLECTION_POINTS_SECTORS_FILL_ID = 'catalog-collection-points-sectors-fill';
export const COLLECTION_POINTS_SECTORS_LINE_ID = 'catalog-collection-points-sectors-line';

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

export function collectionPointsToGeoJson(
  points: CollectionPoint[],
  selectedId?: string,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      id: point.id,
      properties: {
        id: point.id,
        sector: point.sector,
        color: fillStatusColor(point.status),
        selected: point.id === selectedId,
      },
      geometry: {
        type: 'Point',
        coordinates: [point.lng, point.lat],
      },
    })),
  };
}

export function ensureCollectionPointMapLayers(map: MapLibreMap): void {
  if (!map.getSource(COLLECTION_POINTS_SOURCE_ID)) {
    map.addSource(COLLECTION_POINTS_SOURCE_ID, {
      type: 'geojson',
      data: EMPTY_COLLECTION,
    });
    map.addLayer({
      id: COLLECTION_POINTS_LAYER_ID,
      type: 'circle',
      source: COLLECTION_POINTS_SOURCE_ID,
      paint: {
        'circle-radius': [
          'case',
          ['boolean', ['get', 'selected'], false],
          9,
          6,
        ],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.92,
      },
    });
  }
}

export function ensureSectorContextLayers(map: MapLibreMap, sectors?: SectorCollection): void {
  if (!sectors?.features.length) return;

  ensureCollectionPointMapLayers(map);

  const data = JSON.parse(JSON.stringify(sectors)) as SectorCollection;

  if (!map.getSource(COLLECTION_POINTS_SECTORS_SOURCE_ID)) {
    map.addSource(COLLECTION_POINTS_SECTORS_SOURCE_ID, {
      type: 'geojson',
      data,
    });
    map.addLayer(
      {
        id: COLLECTION_POINTS_SECTORS_FILL_ID,
        type: 'fill',
        source: COLLECTION_POINTS_SECTORS_SOURCE_ID,
        paint: {
          'fill-color': '#34D634',
          'fill-opacity': 0.06,
        },
      },
      COLLECTION_POINTS_LAYER_ID,
    );
    map.addLayer(
      {
        id: COLLECTION_POINTS_SECTORS_LINE_ID,
        type: 'line',
        source: COLLECTION_POINTS_SECTORS_SOURCE_ID,
        paint: {
          'line-color': '#34D634',
          'line-opacity': 0.28,
          'line-width': 1,
        },
      },
      COLLECTION_POINTS_LAYER_ID,
    );
    return;
  }

  (map.getSource(COLLECTION_POINTS_SECTORS_SOURCE_ID) as GeoJSONSource).setData(data);
}

export function syncCollectionPointMapLayer(
  map: MapLibreMap,
  points: CollectionPoint[],
  selectedId?: string,
): void {
  if (!map.isStyleLoaded()) return;
  ensureCollectionPointMapLayers(map);
  const source = map.getSource(COLLECTION_POINTS_SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData(collectionPointsToGeoJson(points, selectedId));
}

export function bindCollectionPointMapInteractions(
  map: MapLibreMap,
  onSelect: (pointId: string) => void,
): () => void {
  const handleClick = (event: maplibregl.MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    const pointId = feature?.properties?.id;
    if (typeof pointId === 'string' && pointId.length > 0) {
      onSelect(pointId);
    }
  };

  const handleEnter = () => {
    map.getCanvas().style.cursor = 'pointer';
  };
  const handleLeave = () => {
    map.getCanvas().style.cursor = '';
  };

  map.on('click', COLLECTION_POINTS_LAYER_ID, handleClick);
  map.on('mouseenter', COLLECTION_POINTS_LAYER_ID, handleEnter);
  map.on('mouseleave', COLLECTION_POINTS_LAYER_ID, handleLeave);

  return () => {
    map.off('click', COLLECTION_POINTS_LAYER_ID, handleClick);
    map.off('mouseenter', COLLECTION_POINTS_LAYER_ID, handleEnter);
    map.off('mouseleave', COLLECTION_POINTS_LAYER_ID, handleLeave);
  };
}
