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

const OSM_RASTER_TILES = [
  'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
];

/**
 * Estilo operativo local (`unare-local`).
 *
 * Los MBTiles locales solo cubren z12–14 del bbox de Unare; por eso se apoya en una capa OSM
 * regional por debajo (z<12), de modo que al alejarse se ve contexto en vez de un fondo vacío.
 * La operación diaria (z≥12) sigue sirviéndose 100% del backend local (offline-safe).
 */
export const unareLocalStyle: StyleSpecification = {
  version: 8,
  sources: {
    'wide-tiles': {
      type: 'raster',
      tiles: OSM_RASTER_TILES,
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
    'base-tiles': {
      type: 'raster',
      tiles: [localMapTileUrl()],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    { id: 'wide-tiles-layer', type: 'raster', source: 'wide-tiles', minzoom: 0, maxzoom: 12 },
    { id: 'base-tiles-layer', type: 'raster', source: 'base-tiles', minzoom: 12, maxzoom: 19 },
  ],
};

export const osmMapStyle: StyleSpecification = osmRaster(OSM_RASTER_TILES);

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

let unareTilesAvailable: boolean | null = null;

export function resetMapStyleCache(): void {
  unareTilesAvailable = null;
}

async function probeUnareTiles(): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/map/tiles/meta', { credentials: 'include' });
    if (!res.ok) return false;
    const meta = (await res.json()) as { available?: boolean };
    return Boolean(meta.available);
  } catch {
    return false;
  }
}

export function mapStyleForTheme(darkMode: boolean): StyleSpecification {
  if (unareTilesAvailable === false) {
    return darkMode ? mapStylesById.oscuro : mapStylesById.claro;
  }
  return mapStylesById[themeBaseStyleId(darkMode)];
}

/** Resuelve el estilo: Unare local si el backend tiene MBTiles; si no, OSM. */
export async function resolveMapStyle(darkMode: boolean): Promise<StyleSpecification> {
  if (unareTilesAvailable === null) {
    unareTilesAvailable = await probeUnareTiles();
  }
  return mapStyleForTheme(darkMode);
}
