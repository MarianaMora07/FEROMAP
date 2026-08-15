import { describe, expect, it } from 'vitest';
import {
  canShowMonitoringRoutePlayback,
  filterPlaybackRoutesForMonitoring,
  mergeRouteProgressWithPlayback,
  monitoringPlaybackInitialProgress,
} from './monitoringPlaybackUx';
import { mockDailyRoutePlayback } from '../../data/mock/routePlayback';

describe('monitoringPlaybackUx', () => {
  it('computes initial progress from route snapshot in field mode', () => {
    const progress = monitoringPlaybackInitialProgress({
      fieldMode: true,
      routeSnapshot: {
        routeId: 1,
        vehicleId: 'TR-08',
        stopsDone: 6,
        stopsTotal: 12,
        stops: [],
        nextStop: null,
      },
      routeProgress: [],
      operatorVehicle: null,
    });
    expect(progress).toBeCloseTo(0.5, 5);
  });

  it('filters routes to operator vehicle in field mode', () => {
    const routes = mockDailyRoutePlayback(1).routes;
    const filtered = filterPlaybackRoutesForMonitoring(routes, true, {
      id: 'TR-08',
      routeId: 1,
    } as never);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.vehicleLabel).toBe('TR-08');
  });

  it('merges playback state into route progress items', () => {
    const routes = mockDailyRoutePlayback(1).routes;
    const merged = mergeRouteProgressWithPlayback(
      [{ label: 'Ruta TR-08', done: 0, total: 18, pct: 0, color: 'green' }],
      [routes[0]!],
      [
        {
          routeId: routes[0]!.routeId,
          progress: 0.2,
          lineProgress: 0.2,
          currentStopIndex: 1,
          completedStops: 1,
          bearing: 0,
          position: [-62.715, 8.295],
          isAtStop: false,
        },
      ],
      true,
    );
    expect(merged[0]?.done).toBe(1);
    expect(merged[0]?.pct).toBeGreaterThan(0);
  });

  it('shows playback when fleet is in route', () => {
    expect(
      canShowMonitoringRoutePlayback({
        fieldMode: false,
        inRouteCount: 2,
      }),
    ).toBe(true);
  });
});
