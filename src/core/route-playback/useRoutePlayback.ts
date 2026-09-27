import { createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import type { RoutePlaybackModel } from './routePlaybackTypes';
import {
  buildPlaybackTimelines,
  elapsedMsAtGlobalProgress,
  globalProgressAtElapsed,
  playbackMaxDurationMs,
  primaryStopIndex,
  routeStatesAtElapsed,
  type RoutePlaybackRouteState,
  type RoutePlaybackSpeed,
  type RoutePlaybackTimeline,
} from './routePlaybackMath';

export interface UseRoutePlaybackOptions {
  /** Pausa mínima visible en cada parada (ms). */
  stopDwellMs?: number;
  /** Si es `false`, solo usa `serviceMinutes` sin dwell adicional. */
  pauseAtStops?: boolean;
  /** Reproducir automáticamente al montar. */
  autoPlay?: boolean;
}

export interface RoutePlaybackController {
  isPlaying: () => boolean;
  speed: () => RoutePlaybackSpeed;
  progress: () => number;
  elapsedMs: () => number;
  currentStopIndex: () => number;
  routeStates: () => RoutePlaybackRouteState[];
  timelines: () => RoutePlaybackTimeline[];
  maxDurationMs: () => number;
  isComplete: () => boolean;
  play: () => void;
  pause: () => void;
  reset: () => void;
  setSpeed: (speed: RoutePlaybackSpeed) => void;
  setProgress: (progress: number) => void;
  toggle: () => void;
}

export function useRoutePlayback(
  routes: () => RoutePlaybackModel[],
  options?: UseRoutePlaybackOptions,
): RoutePlaybackController {
  const [isPlaying, setIsPlaying] = createSignal(Boolean(options?.autoPlay));
  const [speed, setSpeedSignal] = createSignal<RoutePlaybackSpeed>(1);
  const [elapsedMs, setElapsedMs] = createSignal(0);
  const [frameTick, setFrameTick] = createSignal(0);

  const timelines = createMemo(() =>
    buildPlaybackTimelines(routes(), {
      stopDwellMs: options?.stopDwellMs,
      pauseAtStops: options?.pauseAtStops,
    }),
  );

  const maxDurationMs = createMemo(() => playbackMaxDurationMs(timelines()));

  const routeStates = createMemo(() => {
    frameTick();
    return routeStatesAtElapsed(routes(), timelines(), elapsedMs());
  });

  const progress = createMemo(() => globalProgressAtElapsed(elapsedMs(), maxDurationMs()));
  const currentStopIndex = createMemo(() => primaryStopIndex(routeStates()));
  const isComplete = createMemo(() => elapsedMs() >= maxDurationMs());

  let animationFrame: number | undefined;
  let lastTimestamp: number | undefined;

  const stopLoop = () => {
    if (animationFrame !== undefined) {
      cancelAnimationFrame(animationFrame);
      animationFrame = undefined;
    }
    lastTimestamp = undefined;
  };

  const step = (timestamp: number) => {
    if (!isPlaying()) {
      stopLoop();
      return;
    }

    if (lastTimestamp === undefined) {
      lastTimestamp = timestamp;
    }

    const delta = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    const nextElapsed = Math.min(elapsedMs() + delta * speed(), maxDurationMs());
    setElapsedMs(nextElapsed);
    setFrameTick((value) => value + 1);

    if (nextElapsed >= maxDurationMs()) {
      setIsPlaying(false);
      stopLoop();
      return;
    }

    animationFrame = requestAnimationFrame(step);
  };

  const play = () => {
    if (elapsedMs() >= maxDurationMs()) {
      setElapsedMs(0);
    }
    setIsPlaying(true);
    stopLoop();
    animationFrame = requestAnimationFrame(step);
  };

  const pause = () => {
    setIsPlaying(false);
    stopLoop();
  };

  const reset = () => {
    pause();
    setElapsedMs(0);
    setFrameTick((value) => value + 1);
  };

  const setSpeed = (nextSpeed: RoutePlaybackSpeed) => {
    setSpeedSignal(nextSpeed);
  };

  const setProgress = (nextProgress: number) => {
    const clamped = Math.min(1, Math.max(0, nextProgress));
    setElapsedMs(elapsedMsAtGlobalProgress(clamped, maxDurationMs()));
    setFrameTick((value) => value + 1);
    if (clamped >= 1) {
      pause();
    }
  };

  const toggle = () => {
    if (isPlaying()) pause();
    else play();
  };

  onCleanup(() => {
    stopLoop();
  });

  onMount(() => {
    if (options?.autoPlay) play();
  });

  return {
    isPlaying,
    speed,
    progress,
    elapsedMs,
    currentStopIndex,
    routeStates,
    timelines,
    maxDurationMs,
    isComplete,
    play,
    pause,
    reset,
    setSpeed,
    setProgress,
    toggle,
  };
}
