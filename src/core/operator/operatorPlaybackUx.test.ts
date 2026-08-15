import { describe, expect, it } from 'vitest';
import { mockDailyRoutePlayback } from '../../data/mock/routePlayback';
import {
  deriveOperatorPlaybackSync,
  filterOperatorPlaybackRoute,
  operatorPlaybackCanStart,
  operatorPlaybackInitialProgress,
} from './operatorPlaybackUx';

describe('operatorPlaybackUx', () => {
  const routes = mockDailyRoutePlayback(1).routes;

  it('filters playback to a single operator vehicle', () => {
    const filtered = filterOperatorPlaybackRoute(routes, 'TR-08');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.vehicleLabel).toBe('TR-08');
  });

  it('derives next stop from playback route state', () => {
    const route = routes[0]!;
    const sync = deriveOperatorPlaybackSync(
      route,
      {
        routeId: route.routeId,
        progress: 0.25,
        lineProgress: 0.25,
        bearing: 0,
        currentStopIndex: 1,
        completedStops: 1,
        position: [-62.718, 8.296],
        isAtStop: false,
      },
      false,
    );
    expect(sync?.nextPoint).toBeTruthy();
    expect(sync?.progress).toBe(25);
  });

  it('computes initial progress from snapshot stops done', () => {
    expect(
      operatorPlaybackInitialProgress({
        stopsDone: 3,
        stopsTotal: 12,
      } as never),
    ).toBeCloseTo(0.25, 5);
  });

  it('allows playback when daily plan and stops exist', () => {
    expect(
      operatorPlaybackCanStart({
        dailyPlanId: 1,
        snapshot: { stopsTotal: 5 } as never,
      }),
    ).toBe(true);
  });
});
