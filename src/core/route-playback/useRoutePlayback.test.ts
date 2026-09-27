import { createRoot } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDailyRoutePlayback } from '../../data/mock/routePlayback';
import { useRoutePlayback } from './useRoutePlayback';

describe('useRoutePlayback', () => {
  let rafCallbacks: FrameRequestCallback[] = [];
  let now = 0;
  let rafId = 0;
  let requestFrame: ReturnType<typeof vi.fn>;
  let cancelFrame: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rafCallbacks = [];
    now = 0;
    rafId = 0;
    requestFrame = vi.fn((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      rafId += 1;
      return rafId;
    });
    cancelFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function flushFrames(count: number, stepMs: number) {
    for (let index = 0; index < count; index += 1) {
      const callback = rafCallbacks.shift();
      if (!callback) break;
      now += stepMs;
      callback(now);
    }
  }

  it('play/pause/reset without leaving pending animation frames', () => {
    const routes = mockDailyRoutePlayback(1).routes;

    createRoot((dispose) => {
      const playback = useRoutePlayback(() => routes, { pauseAtStops: false });
      expect(playback.isPlaying()).toBe(false);

      playback.play();
      expect(playback.isPlaying()).toBe(true);
      expect(requestFrame).toHaveBeenCalled();

      playback.pause();
      expect(playback.isPlaying()).toBe(false);

      playback.reset();
      expect(playback.progress()).toBe(0);
      expect(cancelFrame).toHaveBeenCalled();

      dispose();
    });
  });

  it('advances progress when animation frames run', () => {
    const routes = mockDailyRoutePlayback(1).routes;

    createRoot((dispose) => {
      const playback = useRoutePlayback(() => routes, { pauseAtStops: false });
      playback.setSpeed(2);
      playback.play();

      const before = playback.progress();
      flushFrames(3, 500);
      const after = playback.progress();

      expect(after).toBeGreaterThan(before);
      dispose();
    });
  });
});
