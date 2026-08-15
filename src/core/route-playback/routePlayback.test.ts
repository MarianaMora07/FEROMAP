import { describe, expect, it } from 'vitest';
import { mockDailyRoutePlayback } from '../../data/mock/routePlayback';
import { mapContextFeatureToPlaybackModel } from './mapContextRoutePlayback';
import type { MapContextPlaybackRouteFeature } from './mapContextRoutePlayback';
import {
  assertPlaybackRouteCount,
  inferRoutePlaybackStopType,
  isDailyRoutePlaybackResponse,
  isLandfillPlaybackStop,
  isRoutePlaybackModel,
  normalizeRoutePlaybackStop,
} from './routePlaybackValidation';

describe('routePlayback validation', () => {
  it('accepts mock daily playback payload', () => {
    const payload = mockDailyRoutePlayback(42);
    expect(isDailyRoutePlaybackResponse(payload)).toBe(true);
    expect(payload.routes).toHaveLength(3);
    payload.routes.forEach((route) => {
      expect(isRoutePlaybackModel(route)).toBe(true);
    });
  });

  it('mock route 1 includes landfill stop for playback marker test', () => {
    const route = mockDailyRoutePlayback(1).routes[0]!;
    const landfill = route.stops.find((stop) => stop.stopType === 'landfill');
    expect(landfill).toBeDefined();
    expect(landfill?.code).toBe('VERTEDERO');
    expect(isLandfillPlaybackStop(landfill!)).toBe(true);
  });

  it('infers landfill stopType from VERTEDERO code when missing', () => {
    expect(inferRoutePlaybackStopType('VERTEDERO')).toBe('landfill');
    expect(inferRoutePlaybackStopType('CNT-001')).toBe('collection');
    const normalized = normalizeRoutePlaybackStop({
      sequence: 1,
      lng: -62.69,
      lat: 8.28,
      code: 'VERTEDERO',
      serviceMinutes: 15,
    });
    expect(normalized?.stopType).toBe('landfill');
  });

  it('rejects invalid stopType', () => {
    const invalid = {
      sequence: 1,
      lng: -62.718,
      lat: 8.296,
      code: 'CNT-001',
      serviceMinutes: 5,
      stopType: 'depot',
    };
    expect(isRoutePlaybackModel({
      routeId: 1,
      vehicleId: 1,
      vehicleLabel: 'TR-01',
      color: '#000',
      lineCoordinates: [
        [-62.715, 8.295],
        [-62.718, 8.296],
      ],
      stops: [invalid],
      totalDurationMinutes: 10,
    })).toBe(false);
  });

  it('rejects route without stops', () => {
    const invalid = {
      routeId: 1,
      vehicleId: 1,
      vehicleLabel: 'TR-01',
      color: '#000',
      lineCoordinates: [
        [-62.715, 8.295],
        [-62.718, 8.296],
      ],
      stops: [],
      totalDurationMinutes: 10,
    };
    expect(isRoutePlaybackModel(invalid)).toBe(false);
  });

  it('maps map context feature with playback properties', () => {
    const feature: MapContextPlaybackRouteFeature = {
      type: 'Feature',
      properties: {
        id: 'route-9',
        routeId: 9,
        label: 'Ruta TR-08',
        color: '#34D634',
        vehicleId: 'TR-08',
        vehicleDbId: 8,
        status: 'pending',
        routeKind: 'optimized',
        waypointsTotal: 2,
        waypointsDone: 0,
        stops: [
          {
            sequence: 1,
            lng: -62.718,
            lat: 8.296,
            code: 'CNT-001',
            serviceMinutes: 5,
            stopType: 'collection',
          },
        ],
        totalDurationMinutes: 45,
        startTime: '2026-08-14T06:00:00+00:00',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-62.715, 8.295],
          [-62.718, 8.296],
          [-62.715, 8.295],
        ],
      },
    };

    const route = mapContextFeatureToPlaybackModel(feature);
    expect(route).not.toBeNull();
    expect(route?.vehicleId).toBe(8);
    expect(route?.stops).toHaveLength(1);
  });

  it('asserts at least one route', () => {
    expect(() => assertPlaybackRouteCount([])).toThrow(/al menos una ruta/);
    expect(() => assertPlaybackRouteCount(mockDailyRoutePlayback(1).routes)).not.toThrow();
  });
});
