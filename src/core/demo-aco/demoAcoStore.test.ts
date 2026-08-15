import { createRoot } from 'solid-js';
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  createDemoAcoPlayback,
  DEMO_ACO_MS_PER_FRAME_AT_1X,
  formatDemoAcoStatusLabel,
  demoAcoViewFlags,
} from './demoAcoStore';

describe('demoAcoStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('formatea el panel de estado', () => {
    expect(formatDemoAcoStatusLabel(7, 20, 12, 24)).toBe(
      'Iteración 7/20 · Hormigas 12 · Mejor costo: 24',
    );
    expect(formatDemoAcoStatusLabel(0, 10, 6, Infinity)).toBe(
      'Iteración 0/10 · Hormigas 6 · Mejor costo: —',
    );
  });

  it('define flags de visualización por modo', () => {
    expect(demoAcoViewFlags('all')).toEqual({
      showPheromones: true,
      showAntTrails: true,
      showBestPath: true,
    });
    expect(demoAcoViewFlags('best')).toEqual({
      showPheromones: true,
      showAntTrails: false,
      showBestPath: true,
    });
    expect(demoAcoViewFlags('pheromones')).toEqual({
      showPheromones: true,
      showAntTrails: false,
      showBestPath: false,
    });
  });

  it('scrub de iteración es instantáneo y pausa el playback', () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    createRoot((dispose) => {
      const playback = createDemoAcoPlayback({ iterations: 8, patience: 0 });
      playback.setPresetId('simple');
      playback.startDemo();
      playback.play();
      expect(rafCallbacks.length).toBeGreaterThan(0);
      playback.setFrameIndex(3);
      expect(playback.frameIndex()).toBe(3);
      expect(playback.isPlaying()).toBe(false);
      dispose();
      playback.dispose();
    });
  });

  it('playback avanza iteraciones con requestAnimationFrame', () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    createRoot((dispose) => {
      const playback = createDemoAcoPlayback({ iterations: 5, patience: 0 });
      playback.setPresetId('simple');
      playback.startDemo();
      expect(playback.frameIndex()).toBe(0);
      playback.setSpeed(1);
      playback.play();

      const first = rafCallbacks[rafCallbacks.length - 1];
      first?.(0);
      const second = rafCallbacks[rafCallbacks.length - 1];
      second?.(DEMO_ACO_MS_PER_FRAME_AT_1X + 50);

      expect(playback.frameIndex()).toBeGreaterThan(0);
      dispose();
      playback.dispose();
    });
  });
});
