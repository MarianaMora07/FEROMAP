import { createEffect, createMemo, createSignal, onCleanup, untrack } from 'solid-js';
import type { DaySimulation, DaySimulationStep } from '../../core/api/daySimulation';
import type { RoutePlaybackModel } from '../../core/route-playback/routePlaybackTypes';
import {
  useRoutePlayback,
  type RoutePlaybackController,
} from '../../core/route-playback/useRoutePlayback';
import type {
  RoutePlaybackSpeed,
  RoutePlaybackRouteState,
  RoutePlaybackTimeline,
} from '../../core/route-playback/routePlaybackMath';
import {
  buildPausePoints,
  mergeStepRoutes,
  nextPausePoint,
  playbackTotalMs,
  stepFraction,
} from './daySimulationUx';

/**
 * Controlador de la animación del día: reproduce la jornada comprimida (~5 min) y
 * **pausa** en cada contingencia guionada. Al continuar, el paso **fusiona** su plan
 * alternativo con el tramo actual: se conservan las rutas no afectadas.
 *
 * Es compatible con `RoutePlaybackController` para poder reutilizar la capa de mapa
 * (`RoutePlaybackLayer`) y los controles.
 */
export interface DaySimulationController extends RoutePlaybackController {
  /** Rutas del tramo actual (base no afectadas + plan alternativo del último paso). */
  routes: () => RoutePlaybackModel[];
  /** Paso sobre el que está pausada la animación (null si no hay pausa activa). */
  activeStep: () => DaySimulationStep | null;
  completedStepIds: () => string[];
  /** Jornada base en minutos (eje de la compresión). */
  operationMinutes: () => number;
  /** Aplica el paso pendiente y reanuda la animación. */
  continueStep: () => void;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function useDaySimulation(
  simulation: () => DaySimulation | null,
): DaySimulationController {
  const [currentRoutes, setCurrentRoutes] = createSignal<RoutePlaybackModel[]>([]);
  const [pendingStep, setPendingStep] = createSignal<DaySimulationStep | null>(null);
  const [completedStepIds, setCompletedStepIds] = createSignal<string[]>([]);
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [elapsedMs, setElapsedMsSignal] = createSignal(0);

  // Motor de estados de ruta (posición, paradas, rumbo) sobre el tramo actual.
  const playback = useRoutePlayback(() => currentRoutes(), {
    autoPlay: false,
    pauseAtStops: true,
  });

  const totalMs = createMemo(() =>
    playbackTotalMs(simulation()?.playbackDurationMinutes ?? 0),
  );
  const operationMinutes = createMemo(() => simulation()?.operationMinutes ?? 0);
  const pausePoints = createMemo(() => {
    const sim = simulation();
    return sim ? buildPausePoints(sim) : [];
  });
  const progress = createMemo(() => clamp01(elapsedMs() / totalMs()));

  let frame: number | undefined;
  let lastTimestamp: number | undefined;

  const stopLoop = () => {
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
      frame = undefined;
    }
    lastTimestamp = undefined;
  };

  const tick = (timestamp: number) => {
    if (!isPlaying()) {
      stopLoop();
      return;
    }
    if (lastTimestamp === undefined) lastTimestamp = timestamp;
    const delta = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    const total = totalMs();
    const nextElapsed = Math.min(elapsedMs() + delta, total);
    const nextProgress = clamp01(nextElapsed / total);

    // Pausa en el próximo evento guionado alcanzado.
    const crossing = nextPausePoint(pausePoints(), nextProgress, completedStepIds());
    if (crossing) {
      setElapsedMsSignal(crossing.atMs);
      playback.setProgress(crossing.fraction);
      setPendingStep(crossing.step);
      setIsPlaying(false);
      stopLoop();
      return;
    }

    setElapsedMsSignal(nextElapsed);
    playback.setProgress(nextProgress);

    if (nextElapsed >= total) {
      setIsPlaying(false);
      stopLoop();
      return;
    }
    frame = requestAnimationFrame(tick);
  };

  const startLoop = () => {
    stopLoop();
    setIsPlaying(true);
    frame = requestAnimationFrame(tick);
  };

  const applySimulation = (sim: DaySimulation | null) => {
    setCurrentRoutes(sim?.baseRoutes ?? []);
    setCompletedStepIds([]);
    setPendingStep(null);
    setIsPlaying(false);
    stopLoop();
    setElapsedMsSignal(0);
    playback.reset();
  };

  createEffect(() => {
    const sim = simulation();
    untrack(() => applySimulation(sim));
  });

  const pause = () => {
    setIsPlaying(false);
    stopLoop();
  };

  const continueStep = () => {
    const step = pendingStep();
    if (!step) return;
    setCurrentRoutes((routes) => mergeStepRoutes(routes, step));
    setCompletedStepIds((ids) => [...ids, step.id]);
    setPendingStep(null);
    playback.setProgress(stepFraction(step.atMinutes, operationMinutes()));
    lastTimestamp = undefined;
    startLoop();
  };

  const play = () => {
    if (pendingStep()) {
      continueStep();
      return;
    }
    if (elapsedMs() >= totalMs()) {
      setElapsedMsSignal(0);
      playback.setProgress(0);
    }
    startLoop();
  };

  const reset = () => {
    applySimulation(simulation());
  };

  const setProgress = (value: number) => {
    const clamped = clamp01(value);
    setElapsedMsSignal(clamped * totalMs());
    playback.setProgress(clamped);
    if (clamped >= 1) {
      setIsPlaying(false);
      stopLoop();
    }
  };

  onCleanup(stopLoop);

  return {
    routes: () => currentRoutes(),
    activeStep: pendingStep,
    completedStepIds,
    operationMinutes,
    continueStep,

    isPlaying,
    speed: (): RoutePlaybackSpeed => 1,
    progress,
    elapsedMs,
    currentStopIndex: () => playback.currentStopIndex(),
    routeStates: (): RoutePlaybackRouteState[] => playback.routeStates(),
    timelines: (): RoutePlaybackTimeline[] => playback.timelines(),
    maxDurationMs: () => totalMs(),
    isComplete: () => progress() >= 1,
    play,
    pause,
    reset,
    setSpeed: () => {
      // La compresión es uniforme: la velocidad la fija la duración objetivo.
    },
    setProgress,
    toggle: () => (isPlaying() ? pause() : play()),
  };
}
