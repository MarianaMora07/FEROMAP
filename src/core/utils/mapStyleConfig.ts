import type { StyleSpecification } from 'maplibre-gl';
import type { MapBaseStyleId } from '../../data/mock/mapGis';

function localMapTileUrl(): string {
  const apiBase = import.meta.env.PROD
    ? (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
    : '';
  const path = '/api/v1/map/tiles/{z}/{x}/{y}.png';
  return apiBase ? `${apiBase}${path}` : path;
}

const osmRaster = (
  tiles: string[],
  options?: { minzoom?: number; maxzoom?: number },
): StyleSpecification => ({
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
      minzoom: options?.minzoom ?? 0,
      maxzoom: options?.maxzoom ?? 19,
    },
  ],
});

export const unareLocalStyle: StyleSpecification = osmRaster(
  [localMapTileUrl()],
  { minzoom: 12, maxzoom: 16 },
);

export const osmMapStyle: StyleSpecification = osmRaster([
  'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
]);

export const mapStylesById: Record<MapBaseStyleId, StyleSpecification> = {
  'unare-local': unareLocalStyle,
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

/** Estilo operativo por defecto: tiles locales Unare servidos por el backend. */
export function themeBaseStyleId(_darkMode: boolean): MapBaseStyleId {
  return 'unare-local';
}

export function mapStyleForTheme(darkMode: boolean): StyleSpecification {
  return mapStylesById[themeBaseStyleId(darkMode)];
}
