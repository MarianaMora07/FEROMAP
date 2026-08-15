import { describe, expect, it } from 'vitest';
import { mockDailyRoutePlayback } from '../../data/mock/routePlayback';
import { applyPlaybackCamera, fitMapToPlaybackRoutes } from './playbackCameraUx';

describe('playbackCameraUx', () => {
  it('fits map bounds to all playback routes', () => {
    const routes = mockDailyRoutePlayback(1).routes;
    const calls: unknown[] = [];
    const map = {
      fitBounds: (...args: unknown[]) => {
        calls.push(args);
      },
    } as never;

    fitMapToPlaybackRoutes(map, routes);
    expect(calls.length).toBe(1);
  });

  it('does not move camera in free mode', () => {
    const map = {
      easeTo: () => {
        throw new Error('should not ease');
      },
      fitBounds: () => {
        throw new Error('should not fit');
      },
    } as never;

    expect(() =>
      applyPlaybackCamera(map, 'free', mockDailyRoutePlayback(1).routes, [], undefined),
    ).not.toThrow();
  });
});
