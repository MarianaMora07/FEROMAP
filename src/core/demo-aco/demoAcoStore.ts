import { createMemo, createSignal } from 'solid-js';
import type { DemoAcoOptions } from './demoAcoEngine';
import {
  formatDecisionCandidates,
  frameToSnapshot,
  runDemoAcoWithFrames,
  type DemoAcoAntDecision,
  type DemoAcoFrame,
  type DemoAcoRunWithFrames,
} from './demoAcoFrames';
import { DEMO_MAZE_PRESETS } from './mazes';
import type { MazeDefinition, MazePresetId } from './mazeTypes';

export type DemoAcoPlaybackSpeed = 0.25 | 0.5 | 1 | 2;

export type DemoAcoViewMode = 'all' | 'best' | 'pheromones';

export const DEMO_ACO_PLAYBACK_SPEEDS: DemoAcoPlaybackSpeed[] = [0.25, 0.5, 1, 2];

/** Duración base por frame (paso de hormiga) a velocidad 1× (ms). */
export const DEMO_ACO_MS_PER_FRAME_AT_1X = 520;

export const DEMO_ACO_DEFAULT_RUN_OPTIONS: DemoAcoOptions = {
  ants: 12,
  iterations: 25,
  patience: 6,
  seed: 42,
  includeInitialSnapshot: true,
};

export const DEMO_PRESENTATION_PRESET_ID: MazePresetId = 'complex';

export const DEMO_PRESENTATION_DURATION_MS = 60_000;

export function formatDemoAcoStatusLabel(
  iteration: number,
  maxIteration: number,
  ants: number,
  bestCost: number,
): string {
  const costLabel = Number.isFinite(bestCost) ? String(bestCost) : '—';
  return `Iteración ${iteration}/${maxIteration} · Hormigas ${ants} · Mejor costo: ${costLabel}`;
}

export function formatDemoAcoFrameLabel(
  frame: DemoAcoFrame,
  frameIndex: number,
  maxFrameIndex: number,
  maxIteration: number,
  antCount: number,
): string {
  const base = formatDemoAcoStatusLabel(frame.iteration, maxIteration, antCount, frame.bestCost);
  const progress = `Frame ${frameIndex + 1}/${maxFrameIndex + 1}`;

  if (frame.phase === 'initial') {
    return `${progress} · Inicio · ${base}`;
  }

  if (frame.phase === 'iteration_end') {
    const suffix = frame.improved ? ' · Mejoró el costo global' : '';
    return `${progress} · Fin iteración ${frame.iteration}${suffix} · ${base}`;
  }

  if (frame.decision) {
    const candidates = formatDecisionCandidates(frame.decision);
    const chosen = candidates.find((item) => item.chosen);
    const pct = chosen ? Math.round(chosen.probability * 100) : 0;
    return `${progress} · Hormiga #${frame.decision.antId + 1} paso ${frame.decision.stepIndex} → ${chosen?.label ?? '—'} (${pct}%) · ${base}`;
  }

  return `${progress} · ${base}`;
}

export function demoAcoViewFlags(mode: DemoAcoViewMode): {
  showPheromones: boolean;
  showAntTrails: boolean;
  showBestPath: boolean;
} {
  switch (mode) {
    case 'all':
      return { showPheromones: true, showAntTrails: true, showBestPath: true };
    case 'best':
      return { showPheromones: true, showAntTrails: false, showBestPath: true };
    case 'pheromones':
      return { showPheromones: true, showAntTrails: false, showBestPath: false };
  }
}

export interface DemoAcoPlaybackController {
  presetId: () => MazePresetId;
  maze: () => MazeDefinition;
  runResult: () => DemoAcoRunWithFrames | null;
  frames: () => DemoAcoFrame[];
  frameIndex: () => number;
  currentFrame: () => DemoAcoFrame | null;
  currentSnapshot: () => ReturnType<typeof frameToSnapshot> | null;
  currentDecision: () => DemoAcoAntDecision | null;
  activeAntId: () => number | null;
  viewMode: () => DemoAcoViewMode;
  isPlaying: () => boolean;
  speed: () => DemoAcoPlaybackSpeed;
  hasRun: () => boolean;
  statusLabel: () => string;
  maxFrameIndex: () => number;
  maxSnapshotIndex: () => number;
  maxIteration: () => number;
  antCount: () => number;
  viewFlags: () => ReturnType<typeof demoAcoViewFlags>;
  isPresentationMode: () => boolean;
  setPresetId: (id: MazePresetId) => void;
  startDemo: () => void;
  startPresentationMode: () => void;
  resetDemo: () => void;
  setFrameIndex: (index: number) => void;
  setSnapshotIndex: (index: number) => void;
  stepFrameForward: () => void;
  stepFrameBackward: () => void;
  setActiveAntId: (id: number | null) => void;
  setViewMode: (mode: DemoAcoViewMode) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  setSpeed: (speed: DemoAcoPlaybackSpeed) => void;
  dispose: () => void;
}

export function createDemoAcoPlayback(
  options?: Partial<DemoAcoOptions>,
): DemoAcoPlaybackController {
  const runOptions: DemoAcoOptions = { ...DEMO_ACO_DEFAULT_RUN_OPTIONS, ...options };

  const [presetId, setPresetIdSignal] = createSignal<MazePresetId>('complex');
  const [runResult, setRunResult] = createSignal<DemoAcoRunWithFrames | null>(null);
  const [frameIndex, setFrameIndexSignal] = createSignal(0);
  const [activeAntId, setActiveAntIdSignal] = createSignal<number | null>(null);
  const [viewMode, setViewModeSignal] = createSignal<DemoAcoViewMode>('all');
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [speed, setSpeedSignal] = createSignal<DemoAcoPlaybackSpeed>(0.5);
  const [isPresentationMode, setIsPresentationMode] = createSignal(false);
  const [frameTick, setFrameTick] = createSignal(0);

  let animationFrame: number | undefined;
  let lastTimestamp: number | undefined;
  let carryMs = 0;
  let presentationTimeout: ReturnType<typeof setTimeout> | undefined;

  const clearPresentationTimer = () => {
    if (presentationTimeout !== undefined) {
      clearTimeout(presentationTimeout);
      presentationTimeout = undefined;
    }
  };

  const maze = createMemo(
    () => DEMO_MAZE_PRESETS.find((preset) => preset.id === presetId()) ?? DEMO_MAZE_PRESETS[0]!,
  );

  const frames = () => runResult()?.frames ?? [];

  const maxFrameIndex = () => Math.max(0, frames().length - 1);

  const currentFrame = createMemo(() => {
    frameTick();
    const list = frames();
    if (list.length === 0) return null;
    const index = Math.min(Math.max(frameIndex(), 0), list.length - 1);
    return list[index] ?? null;
  });

  const currentSnapshot = createMemo(() => {
    const frame = currentFrame();
    return frame ? frameToSnapshot(frame) : null;
  });

  const currentDecision = createMemo(() => currentFrame()?.decision ?? null);

  const maxIteration = createMemo(() => {
    const list = frames();
    if (list.length === 0) {
      return runOptions.iterations ?? DEMO_ACO_DEFAULT_RUN_OPTIONS.iterations!;
    }
    return list[list.length - 1]?.iteration ?? 0;
  });

  const antCount = () => runOptions.ants ?? DEMO_ACO_DEFAULT_RUN_OPTIONS.ants!;

  const statusLabel = createMemo(() => {
    const frame = currentFrame();
    if (!frame) {
      return 'Sin ejecución — inicia la demostración';
    }
    return formatDemoAcoFrameLabel(
      frame,
      frameIndex(),
      maxFrameIndex(),
      maxIteration(),
      antCount(),
    );
  });

  const viewFlags = createMemo(() => demoAcoViewFlags(viewMode()));

  const stopLoop = () => {
    if (animationFrame !== undefined) {
      cancelAnimationFrame(animationFrame);
      animationFrame = undefined;
    }
    lastTimestamp = undefined;
    carryMs = 0;
  };

  const pause = () => {
    setIsPlaying(false);
    stopLoop();
    clearPresentationTimer();
    setIsPresentationMode(false);
  };

  const setFrameIndex = (index: number) => {
    pause();
    const clamped = Math.min(Math.max(index, 0), maxFrameIndex());
    setFrameIndexSignal(clamped);
    setFrameTick((value) => value + 1);
  };

  const stepFrameForward = () => {
    setFrameIndex(Math.min(frameIndex() + 1, maxFrameIndex()));
  };

  const stepFrameBackward = () => {
    setFrameIndex(Math.max(frameIndex() - 1, 0));
  };

  const resetDemo = () => {
    pause();
    setFrameIndexSignal(0);
    setActiveAntIdSignal(null);
    setFrameTick((value) => value + 1);
  };

  const clearRun = () => {
    pause();
    setRunResult(null);
    setFrameIndexSignal(0);
    setActiveAntIdSignal(null);
  };

  const stepPlayback = (timestamp: number) => {
    if (!isPlaying()) {
      stopLoop();
      return;
    }

    if (lastTimestamp === undefined) {
      lastTimestamp = timestamp;
    }

    const delta = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    carryMs += delta;

    const stepMs = DEMO_ACO_MS_PER_FRAME_AT_1X / speed();
    const maxIndex = maxFrameIndex();

    while (carryMs >= stepMs) {
      carryMs -= stepMs;
      const nextIndex = frameIndex() + 1;
      if (nextIndex > maxIndex) {
        if (isPresentationMode()) {
          setFrameIndexSignal(0);
          setFrameTick((value) => value + 1);
          continue;
        }
        setFrameIndexSignal(maxIndex);
        setFrameTick((value) => value + 1);
        pause();
        return;
      }
      setFrameIndexSignal(nextIndex);
      setFrameTick((value) => value + 1);
    }

    animationFrame = requestAnimationFrame(stepPlayback);
  };

  const play = () => {
    if (!runResult()) return;
    if (frameIndex() >= maxFrameIndex()) {
      setFrameIndexSignal(0);
      setFrameTick((value) => value + 1);
    }
    setIsPlaying(true);
    stopLoop();
    animationFrame = requestAnimationFrame(stepPlayback);
  };

  const toggle = () => {
    if (isPlaying()) pause();
    else play();
  };

  const setSpeed = (nextSpeed: DemoAcoPlaybackSpeed) => {
    setSpeedSignal(nextSpeed);
  };

  const startDemo = () => {
    pause();
    const result = runDemoAcoWithFrames(maze(), runOptions);
    setRunResult(result);
    setFrameIndexSignal(0);
    setActiveAntIdSignal(null);
    setViewModeSignal('all');
    setFrameTick((value) => value + 1);
  };

  const startPresentationMode = () => {
    setIsPlaying(false);
    stopLoop();
    clearPresentationTimer();
    setIsPresentationMode(false);
    setPresetIdSignal(DEMO_PRESENTATION_PRESET_ID);
    const result = runDemoAcoWithFrames(maze(), runOptions);
    setRunResult(result);
    setFrameIndexSignal(0);
    setActiveAntIdSignal(null);
    setViewModeSignal('all');
    setSpeedSignal(0.5);
    setFrameTick((value) => value + 1);
    setIsPresentationMode(true);
    play();
    presentationTimeout = setTimeout(() => {
      pause();
    }, DEMO_PRESENTATION_DURATION_MS);
  };

  const setPresetId = (id: MazePresetId) => {
    setPresetIdSignal(id);
    clearRun();
  };

  const dispose = () => {
    pause();
    clearPresentationTimer();
  };

  return {
    presetId,
    maze,
    runResult,
    frames,
    frameIndex,
    currentFrame,
    currentSnapshot,
    currentDecision,
    activeAntId,
    viewMode,
    isPlaying,
    speed,
    hasRun: () => runResult() !== null,
    statusLabel,
    maxFrameIndex,
    maxSnapshotIndex: maxFrameIndex,
    maxIteration,
    antCount,
    viewFlags,
    isPresentationMode,
    setPresetId,
    startDemo,
    startPresentationMode,
    resetDemo,
    setFrameIndex,
    setSnapshotIndex: setFrameIndex,
    stepFrameForward,
    stepFrameBackward,
    setActiveAntId: setActiveAntIdSignal,
    setViewMode: setViewModeSignal,
    play,
    pause,
    toggle,
    setSpeed,
    dispose,
  };
}
