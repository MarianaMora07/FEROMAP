import type { RoutePlaybackCoordinate, RoutePlaybackModel, RoutePlaybackStop } from './routePlaybackTypes';

export type RoutePlaybackSpeed = 1 | 2 | 4;

export const ROUTE_PLAYBACK_SPEEDS: RoutePlaybackSpeed[] = [1, 2, 4];

export const DEFAULT_STOP_DWELL_MS = 800;

export interface PlaybackTimelineSegment {
  kind: 'travel' | 'service';
  startMs: number;
  endMs: number;
  lineProgressStart: number;
  lineProgressEnd: number;
  /** Índice de parada en `stops` asociado al segmento. */
  stopIndex: number;
}

export interface RoutePlaybackTimeline {
  routeId: number;
  totalDurationMs: number;
  segments: PlaybackTimelineSegment[];
  stopLineProgress: number[];
}

export interface RoutePlaybackRouteState {
  routeId: number;
  progress: number;
  lineProgress: number;
  currentStopIndex: number;
  completedStops: number;
  position: RoutePlaybackCoordinate;
  isAtStop: boolean;
}

export function sliceLineCoordinates(
  coordinates: RoutePlaybackCoordinate[],
  progress: number,
): RoutePlaybackCoordinate[] {
  if (coordinates.length < 2) return [...coordinates];
  if (progress >= 1) return [...coordinates];
  if (progress <= 0) return [coordinates[0]!];

  const target = progress * (coordinates.length - 1);
  const index = Math.floor(target);
  const fraction = target - index;
  const start = coordinates[index]!;
  const end = coordinates[Math.min(index + 1, coordinates.length - 1)]!;

  return [
    ...coordinates.slice(0, index + 1),
    [start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction],
  ];
}

export function interpolateAlongLine(
  coordinates: RoutePlaybackCoordinate[],
  progress: number,
): RoutePlaybackCoordinate {
  const sliced = sliceLineCoordinates(coordinates, progress);
  return sliced[sliced.length - 1] ?? coordinates[0] ?? [0, 0];
}

function segmentLength(a: RoutePlaybackCoordinate, b: RoutePlaybackCoordinate): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.hypot(dx, dy);
}

export function polylineLength(coordinates: RoutePlaybackCoordinate[]): number {
  if (coordinates.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    total += segmentLength(coordinates[index - 1]!, coordinates[index]!);
  }
  return total;
}

/** Proyecta una parada sobre la polilínea y devuelve progreso normalizado [0, 1]. */
export function stopLineProgress(
  coordinates: RoutePlaybackCoordinate[],
  stop: RoutePlaybackStop,
): number {
  if (coordinates.length < 2) return 0;

  const target: RoutePlaybackCoordinate = [stop.lng, stop.lat];
  let bestProgress = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  const totalLength = polylineLength(coordinates);
  if (totalLength <= 0) return 0;

  let traversed = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1]!;
    const end = coordinates[index]!;
    const legLength = segmentLength(start, end);
    if (legLength <= 0) continue;

    const projection = projectPointOnSegment(target, start, end);
    const distanceToProjection = segmentLength(target, projection.point);
    if (distanceToProjection < bestDistance) {
      bestDistance = distanceToProjection;
      bestProgress = (traversed + legLength * projection.t) / totalLength;
    }
    traversed += legLength;
  }

  return clamp01(bestProgress);
}

function projectPointOnSegment(
  point: RoutePlaybackCoordinate,
  start: RoutePlaybackCoordinate,
  end: RoutePlaybackCoordinate,
): { point: RoutePlaybackCoordinate; t: number } {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0) return { point: start, t: 0 };
  const t = clamp01(((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lenSq);
  return {
    t,
    point: [start[0] + dx * t, start[1] + dy * t],
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function buildRouteTimeline(
  route: RoutePlaybackModel,
  options?: { stopDwellMs?: number; pauseAtStops?: boolean },
): RoutePlaybackTimeline {
  const stopDwellMs = options?.stopDwellMs ?? DEFAULT_STOP_DWELL_MS;
  const pauseAtStops = options?.pauseAtStops ?? true;
  const coordinates = route.lineCoordinates;
  const stops = [...route.stops].sort((a, b) => a.sequence - b.sequence);
  const stopLineProgresses = stops.map((stop) => stopLineProgress(coordinates, stop));

  const serviceMsTotal = stops.reduce((sum, stop) => {
    const serviceMs = stop.serviceMinutes * 60_000;
    const dwellMs = pauseAtStops ? Math.max(serviceMs, stopDwellMs) : serviceMs;
    return sum + dwellMs;
  }, 0);

  const totalDurationMs = Math.max(route.totalDurationMinutes * 60_000, serviceMsTotal + 1);
  const travelMsTotal = Math.max(1, totalDurationMs - serviceMsTotal);

  const legs: number[] = [];
  let previousProgress = 0;
  for (const progress of stopLineProgresses) {
    legs.push(Math.max(0, progress - previousProgress));
    previousProgress = progress;
  }
  const legsSum = legs.reduce((sum, leg) => sum + leg, 0) || 1;

  const segments: PlaybackTimelineSegment[] = [];
  let cursorMs = 0;
  let lineFrom = 0;

  stops.forEach((stop, index) => {
    const lineTo = stopLineProgresses[index] ?? lineFrom;
    const travelMs = (legs[index]! / legsSum) * travelMsTotal;
    if (travelMs > 0) {
      segments.push({
        kind: 'travel',
        startMs: cursorMs,
        endMs: cursorMs + travelMs,
        lineProgressStart: lineFrom,
        lineProgressEnd: lineTo,
        stopIndex: index,
      });
      cursorMs += travelMs;
    }

    const serviceMs = stop.serviceMinutes * 60_000;
    const dwellMs = pauseAtStops ? Math.max(serviceMs, stopDwellMs) : serviceMs;
    segments.push({
      kind: 'service',
      startMs: cursorMs,
      endMs: cursorMs + dwellMs,
      lineProgressStart: lineTo,
      lineProgressEnd: lineTo,
      stopIndex: index,
    });
    cursorMs += dwellMs;
    lineFrom = lineTo;
  });

  return {
    routeId: route.routeId,
    totalDurationMs: cursorMs,
    segments,
    stopLineProgress: stopLineProgresses,
  };
}

export function buildPlaybackTimelines(
  routes: RoutePlaybackModel[],
  options?: { stopDwellMs?: number; pauseAtStops?: boolean },
): RoutePlaybackTimeline[] {
  return routes.map((route) => buildRouteTimeline(route, options));
}

export function playbackMaxDurationMs(timelines: RoutePlaybackTimeline[]): number {
  if (timelines.length === 0) return 1;
  return Math.max(...timelines.map((timeline) => timeline.totalDurationMs), 1);
}

function interpolateSegmentProgress(segment: PlaybackTimelineSegment, elapsedMs: number): number {
  if (segment.endMs <= segment.startMs) return segment.lineProgressEnd;
  const local = clamp01((elapsedMs - segment.startMs) / (segment.endMs - segment.startMs));
  return (
    segment.lineProgressStart + (segment.lineProgressEnd - segment.lineProgressStart) * local
  );
}

export function routeStateAtElapsed(
  route: RoutePlaybackModel,
  timeline: RoutePlaybackTimeline,
  elapsedMs: number,
): RoutePlaybackRouteState {
  const clampedElapsed = Math.max(0, Math.min(elapsedMs, timeline.totalDurationMs));
  const progress = timeline.totalDurationMs > 0 ? clampedElapsed / timeline.totalDurationMs : 1;

  if (clampedElapsed >= timeline.totalDurationMs) {
    const lastStop = route.stops.length - 1;
    const position = interpolateAlongLine(route.lineCoordinates, 1);
    return {
      routeId: route.routeId,
      progress: 1,
      lineProgress: 1,
      currentStopIndex: lastStop,
      completedStops: route.stops.length,
      position,
      isAtStop: true,
    };
  }

  const activeSegment =
    timeline.segments.find(
      (segment) => clampedElapsed >= segment.startMs && clampedElapsed < segment.endMs,
    ) ?? timeline.segments[timeline.segments.length - 1]!;

  const lineProgress = interpolateSegmentProgress(activeSegment, clampedElapsed);
  const position = interpolateAlongLine(route.lineCoordinates, lineProgress);
  const completedStops =
    activeSegment.kind === 'service'
      ? activeSegment.stopIndex + 1
      : activeSegment.stopIndex;

  return {
    routeId: route.routeId,
    progress,
    lineProgress,
    currentStopIndex: activeSegment.stopIndex,
    completedStops: Math.min(completedStops, route.stops.length),
    position,
    isAtStop: activeSegment.kind === 'service',
  };
}

export function routeStatesAtElapsed(
  routes: RoutePlaybackModel[],
  timelines: RoutePlaybackTimeline[],
  elapsedMs: number,
): RoutePlaybackRouteState[] {
  return routes.map((route, index) =>
    routeStateAtElapsed(route, timelines[index]!, elapsedMs),
  );
}

export function globalProgressAtElapsed(elapsedMs: number, maxDurationMs: number): number {
  if (maxDurationMs <= 0) return 1;
  return clamp01(elapsedMs / maxDurationMs);
}

export function elapsedMsAtGlobalProgress(progress: number, maxDurationMs: number): number {
  return clamp01(progress) * maxDurationMs;
}

export function primaryStopIndex(routeStates: RoutePlaybackRouteState[]): number {
  if (routeStates.length === 0) return 0;
  return routeStates[0]!.currentStopIndex;
}

export function primaryStopLabel(
  routes: RoutePlaybackModel[],
  routeStates: RoutePlaybackRouteState[],
): string {
  if (routes.length === 0 || routeStates.length === 0) return '—';
  const route = routes[0]!;
  const state = routeStates[0]!;
  const stopNumber = Math.min(state.currentStopIndex + 1, route.stops.length);
  return `Parada ${stopNumber}/${route.stops.length}`;
}

export function resolvePrimaryStartTime(routes: RoutePlaybackModel[]): string | null {
  for (const route of routes) {
    if (route.startTime) return route.startTime;
  }
  return null;
}

export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function simulatedClockLabel(
  routes: RoutePlaybackModel[],
  elapsedMs: number,
  routeStates: RoutePlaybackRouteState[],
): string {
  const startIso = resolvePrimaryStartTime(routes);
  const base = startIso ? new Date(startIso) : new Date();
  const simulated = new Date(base.getTime() + elapsedMs);
  return `${formatClockTime(simulated)} — ${primaryStopLabel(routes, routeStates)}`;
}

export function formatDurationMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  if (hours <= 0) return `${mins} min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

export function playbackCompletionSummary(
  routes: RoutePlaybackModel[],
  maxDurationMs: number,
): string {
  const totalStops = routes.reduce((sum, route) => sum + route.stops.length, 0);
  const minutes = Math.max(1, Math.round(maxDurationMs / 60_000));
  return `Ruta completada en ${formatDurationMinutes(minutes)} · ${totalStops} paradas`;
}
