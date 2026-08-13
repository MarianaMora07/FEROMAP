import { describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  OPERATIONAL_ROUTES_PENDING_LAYER_ID,
  OPERATIONAL_ROUTES_ACTIVE_LAYER_ID,
  enabledOperationalRouteIds,
  normalizeOperationalRoutes,
  routeLayerStateKey,
  syncOperationalRouteLayerFilters,
} from './operationalMapLayers';
import type { RouteCollection } from '../types/geo';

const sampleRoutes: RouteCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        id: 'route-1',
        routeId: 1,
        label: 'Ruta TR-08',
        color: '#34D634',
        status: 'in_progress',
      },
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
      properties: {
        id: 'route-2',
        routeId: 2,
        label: 'Ruta TR-04',
        color: '#1143F3',
        status: 'pending',
      },
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

describe('operationalMapLayers', () => {
  it('normalizes legacy routes to in_progress status', () => {
    const normalized = normalizeOperationalRoutes({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 'route-legacy', color: '#34D634', type: 'active' },
          geometry: { type: 'LineString', coordinates: [[-62.715, 8.295], [-62.712, 8.297]] },
        },
      ],
    });
    expect(normalized.features[0].properties.status).toBe('in_progress');
  });

  it('builds stable layer state keys per routeId', () => {
    expect(routeLayerStateKey(12)).toBe('route-12');
  });

  it('returns null when all operational routes are enabled', () => {
    const layerState = {
      routes: true,
      'route-1': true,
      'route-2': true,
    };
    expect(enabledOperationalRouteIds(sampleRoutes, layerState)).toBeNull();
  });

  it('returns only enabled route ids when some are toggled off', () => {
    const layerState = {
      routes: true,
      'route-1': true,
      'route-2': false,
    };
    expect(enabledOperationalRouteIds(sampleRoutes, layerState)).toEqual([1]);
  });

  it('applies pending filter only to dashed layer', () => {
    const setFilter = vi.fn();
    const setLayoutProperty = vi.fn();
    const map = {
      getLayer: (id: string) =>
        id === OPERATIONAL_ROUTES_PENDING_LAYER_ID || id === OPERATIONAL_ROUTES_ACTIVE_LAYER_ID
          ? { id }
          : undefined,
      setFilter,
      setLayoutProperty,
    } as unknown as MapLibreMap;

    syncOperationalRouteLayerFilters(map, 'operational-routes', {
      routesVisible: true,
      enabledRouteIds: null,
    });

    expect(setFilter).toHaveBeenCalledWith(
      OPERATIONAL_ROUTES_PENDING_LAYER_ID,
      ['==', ['get', 'status'], 'pending'],
    );
    expect(setFilter).toHaveBeenCalledWith(
      OPERATIONAL_ROUTES_ACTIVE_LAYER_ID,
      ['any', ['==', ['get', 'status'], 'in_progress'], ['!', ['has', 'status']]],
    );
  });

  it('hides both route layers when routesVisible is false', () => {
    const setLayoutProperty = vi.fn();
    const map = {
      getLayer: (id: string) =>
        id === OPERATIONAL_ROUTES_PENDING_LAYER_ID || id === OPERATIONAL_ROUTES_ACTIVE_LAYER_ID
          ? { id }
          : undefined,
      setFilter: vi.fn(),
      setLayoutProperty,
    } as unknown as MapLibreMap;

    syncOperationalRouteLayerFilters(map, 'operational-routes', {
      routesVisible: false,
      enabledRouteIds: null,
    });

    expect(setLayoutProperty).toHaveBeenCalledWith(
      OPERATIONAL_ROUTES_PENDING_LAYER_ID,
      'visibility',
      'none',
    );
    expect(setLayoutProperty).toHaveBeenCalledWith(
      OPERATIONAL_ROUTES_ACTIVE_LAYER_ID,
      'visibility',
      'none',
    );
  });
});
