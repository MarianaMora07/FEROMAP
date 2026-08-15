import { describe, expect, it } from 'vitest';
import {
  canOpenMapGisPlayback,
  filterPlaybackRoutesForMapGis,
  resolveFollowTruckPosition,
} from './mapPlaybackUx';
import { mockDailyRoutePlayback } from '../../data/mock/routePlayback';

describe('mapPlaybackUx', () => {
  const routes = mockDailyRoutePlayback(1).routes;

  it('allows playback for optimized daily plans', () => {
    expect(
      canOpenMapGisPlayback({
        residentMode: false,
        dailyPlan: {
          id: 1,
          operationDate: '2026-08-15',
          status: 'optimized',
          scenarioId: 'normal',
          scheduledPoints: [],
          pendingPoints: [],
          pendingPointIds: [],
          finalPointIds: [],
        },
        playbackRouteCount: 0,
      }),
    ).toBe(true);
  });

  it('blocks playback in resident mode', () => {
    expect(
      canOpenMapGisPlayback({
        residentMode: true,
        dailyPlan: { id: 1, status: 'dispatched' } as never,
        playbackRouteCount: 2,
      }),
    ).toBe(false);
  });

  it('filters playback routes by enabled route ids', () => {
    const filtered = filterPlaybackRoutesForMapGis(routes, {
      enabledRouteIds: [routes[0]!.routeId],
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.routeId).toBe(routes[0]!.routeId);
  });

  it('filters playback routes to focused vehicle', () => {
    const filtered = filterPlaybackRoutesForMapGis(routes, {
      enabledRouteIds: null,
      focusVehicleId: routes[1]!.vehicleLabel,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.vehicleLabel).toBe(routes[1]!.vehicleLabel);
  });

  it('resolves follow-truck position from route state', () => {
    const position = resolveFollowTruckPosition(
      [routes[0]!],
      [
        {
          routeId: routes[0]!.routeId,
          progress: 0.3,
          lineProgress: 0.3,
          currentStopIndex: 1,
          completedStops: 1,
          bearing: 45,
          position: [-62.71, 8.29],
          isAtStop: false,
        },
      ],
      routes[0]!.vehicleLabel,
    );
    expect(position).toEqual([-62.71, 8.29]);
  });
});
