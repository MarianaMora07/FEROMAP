import { describe, expect, it } from 'vitest';
import { mockDailyRoutePlayback } from '../../data/mock/routePlayback';
import { mapContextFeatureToPlaybackModel } from './mapContextRoutePlayback';
import type { MapContextPlaybackRouteFeature } from './mapContextRoutePlayback';
import {
  assertPlaybackRouteCount,
  isDailyRoutePlaybackResponse,
  isRoutePlaybackModel,
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
          { sequence: 1, lng: -62.718, lat: 8.296, code: 'CNT-001', serviceMinutes: 5 },
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
