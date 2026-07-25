import type { StyleSpecification } from 'maplibre-gl';
import type { MapBaseStyleId } from '../../data/mock/mapGis';

const osmRaster = (tiles: string[]): StyleSpecification => ({
  version: 8,
  sources: {
    'base-tiles': {
      type: 'raster',
      tiles,
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'base-tiles-layer',
      type: 'raster',
      source: 'base-tiles',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
});

export const osmMapStyle: StyleSpecification = osmRaster([
  'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
]);

export const mapStylesById: Record<MapBaseStyleId, StyleSpecification> = {
  claro: osmMapStyle,
  oscuro: osmRaster([
    'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  ]),
  satelital: osmRaster([
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  ]),
  terreno: osmRaster([
    'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
    'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
    'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
  ]),
};
