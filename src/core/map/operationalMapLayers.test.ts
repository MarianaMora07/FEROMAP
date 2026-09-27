import { describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  ACTIVE_ROUTE_STATUS_FILTER,
  OPERATIONAL_ROUTES_PENDING_LAYER_ID,
  OPERATIONAL_ROUTES_ACTIVE_LAYER_ID,
  PENDING_ROUTE_STATUS_FILTER,
  enabledOperationalRouteIds,
  normalizeOperationalRoutes,
  operationalRouteLayerIdsToFront,
  routeDisplayKind,
  routeLayerStateKey,
  syncOperationalRouteLayerFilters,
  toPlainRouteCollection,
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

  it('preserves pending and in_progress statuses from the API', () => {
    const normalized = normalizeOperationalRoutes(sampleRoutes);
    expect(normalized.features[0].properties.status).toBe('in_progress');
    expect(normalized.features[1].properties.status).toBe('pending');
  });

  it('maps routeKind to a paint kind so API routes are not filtered out', () => {
    expect(routeDisplayKind({ routeKind: 'optimized' })).toBe('optimized');
    expect(routeDisplayKind({ type: 'current' })).toBe('current');
    expect(routeDisplayKind({ kind: 'current', type: 'optimized' })).toBe('current');
    expect(routeDisplayKind({})).toBe('optimized');
  });

  it('clones route collections to plain JSON', () => {
    const plain = toPlainRouteCollection(sampleRoutes);
    expect(plain).toEqual(sampleRoutes);
    expect(plain).not.toBe(sampleRoutes);
    expect(plain.features[0]).not.toBe(sampleRoutes.features[0]);
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
      PENDING_ROUTE_STATUS_FILTER,
    );
    expect(setFilter).toHaveBeenCalledWith(
      OPERATIONAL_ROUTES_ACTIVE_LAYER_ID,
      ACTIVE_ROUTE_STATUS_FILTER,
    );
  });

  it('moves route layers to the top of the style', () => {
    const moveLayer = vi.fn();
    const map = {
      getLayer: (id: string) =>
        id === OPERATIONAL_ROUTES_PENDING_LAYER_ID || id === OPERATIONAL_ROUTES_ACTIVE_LAYER_ID
          ? { id }
          : undefined,
      moveLayer,
    } as unknown as MapLibreMap;

    operationalRouteLayerIdsToFront(map, 'operational-routes');

    expect(moveLayer).toHaveBeenCalledWith(OPERATIONAL_ROUTES_PENDING_LAYER_ID);
    expect(moveLayer).toHaveBeenCalledWith(OPERATIONAL_ROUTES_ACTIVE_LAYER_ID);
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
