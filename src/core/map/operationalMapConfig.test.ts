import { describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';

const { MockLngLatBounds } = vi.hoisted(() => {
  class MockLngLatBounds {
    extend(_coord: [number, number]) {
      return this;
    }
  }
  return { MockLngLatBounds };
});

vi.mock('maplibre-gl', () => ({
  default: {
    LngLatBounds: MockLngLatBounds,
  },
}));

import {
  OPERATIONAL_MAP_FIT_MAX_ZOOM,
  OPERATIONAL_MAP_FIT_PADDING,
  OPERATIONAL_MAP_MAX_ZOOM,
  OPERATIONAL_MAP_MIN_ZOOM,
  createOperationalMapOptions,
  fitMapToOperationalData,
  operationalMapContextFilters,
} from './operationalMapConfig';
import { UNARE_BBOX_QUERY, UNARE_BOUNDS, UNARE_CENTER, UNARE_ZOOM } from '../types/geo';
import type { RouteCollection } from '../types/geo';

function createMockMap(initialZoom = 13): MapLibreMap {
  return {
    getZoom: () => initialZoom,
    flyTo: vi.fn(),
    fitBounds: vi.fn(),
  } as unknown as MapLibreMap;
}

const multiRouteCollection: RouteCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 'route-1', status: 'pending' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-62.715, 8.295],
          [-62.712, 8.297],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'route-2', status: 'in_progress' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-62.718, 8.298],
          [-62.706, 8.289],
        ],
      },
    },
  ],
};

describe('operationalMapConfig', () => {
  it('builds shared MapLibre options with Unare bounds', () => {
    const options = createOperationalMapOptions({
      container: 'operational-map-test',
      style: { version: 8, sources: {}, layers: [] },
    });

    expect(options.center).toEqual(UNARE_CENTER);
    expect(options.zoom).toBe(UNARE_ZOOM);
    expect(options.minZoom).toBe(OPERATIONAL_MAP_MIN_ZOOM);
    expect(options.maxZoom).toBe(OPERATIONAL_MAP_MAX_ZOOM);
    expect(options.maxBounds).toEqual(UNARE_BOUNDS);
  });

  it('merges bbox filter with optional map context filters', () => {
    expect(operationalMapContextFilters()).toEqual({ bbox: UNARE_BBOX_QUERY });
    expect(operationalMapContextFilters({ sector: 'Unare I' })).toEqual({
      bbox: UNARE_BBOX_QUERY,
      sector: 'Unare I',
    });
  });
});

describe('fitMapToOperationalData', () => {
  it('centra en Unare cuando no hay features operativas', () => {
    const map = createMockMap();

    fitMapToOperationalData(map, {});

    expect(map.flyTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: UNARE_CENTER,
        zoom: UNARE_ZOOM,
        essential: true,
      }),
    );
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it('enfoca un solo punto con zoom de detalle', () => {
    const map = createMockMap(12);

    fitMapToOperationalData(map, {
      vehicles: [{ lng: -62.715, lat: 8.295 }],
    });

    expect(map.flyTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [-62.715, 8.295],
        zoom: 14,
      }),
    );
  });

  it('ajusta bounds cuando hay múltiples coordenadas', () => {
    const map = createMockMap();

    fitMapToOperationalData(map, { routes: multiRouteCollection });

    expect(map.fitBounds).toHaveBeenCalledWith(
      expect.any(MockLngLatBounds),
      expect.objectContaining({
        padding: OPERATIONAL_MAP_FIT_PADDING,
        maxZoom: OPERATIONAL_MAP_FIT_MAX_ZOOM,
      }),
    );
  });
});
