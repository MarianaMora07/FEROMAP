import { describe, expect, it } from 'vitest';
import { mockDailyRoutePlayback } from '../../data/mock/routePlayback';
import {
  buildRouteTimeline,
  elapsedMsAtGlobalProgress,
  globalProgressAtElapsed,
  interpolateAlongLine,
  playbackMaxDurationMs,
  playbackCompletionSummary,
  routeStateAtElapsed,
  routeStatesAtElapsed,
  simulatedClockLabel,
  sliceLineCoordinates,
  stopLineProgress,
} from './routePlaybackMath';

const LINE: Array<[number, number]> = [
  [-62.715, 8.295],
  [-62.718, 8.296],
  [-62.721, 8.297],
  [-62.724, 8.298],
];

describe('routePlaybackMath geometry', () => {
  it('sliceLineCoordinates returns endpoints', () => {
    expect(sliceLineCoordinates(LINE, 0)).toEqual([LINE[0]]);
    expect(sliceLineCoordinates(LINE, 1)).toEqual(LINE);
  });

  it('interpolateAlongLine moves along the polyline', () => {
    const midpoint = interpolateAlongLine(LINE, 0.5);
    const lngValues = LINE.map((coord) => coord[0]);
    expect(midpoint[0]).toBeGreaterThanOrEqual(Math.min(...lngValues));
    expect(midpoint[0]).toBeLessThanOrEqual(Math.max(...lngValues));
  });

  it('stopLineProgress projects stops onto the route line', () => {
    const route = mockDailyRoutePlayback(1).routes[0]!;
    const progress = stopLineProgress(route.lineCoordinates, route.stops[0]!);
    expect(progress).toBeGreaterThanOrEqual(0);
    expect(progress).toBeLessThanOrEqual(1);
  });
});

describe('routePlaybackMath timeline', () => {
  it('buildRouteTimeline covers service and travel segments', () => {
    const route = mockDailyRoutePlayback(1).routes[0]!;
    const timeline = buildRouteTimeline(route, { pauseAtStops: true, stopDwellMs: 800 });
    expect(timeline.segments.length).toBeGreaterThanOrEqual(route.stops.length * 2 - 1);
    expect(timeline.totalDurationMs).toBeGreaterThan(0);
    expect(timeline.segments[0]?.kind).toBe('travel');
  });

  it('routeStateAtElapsed advances stop index over time', () => {
    const routes = mockDailyRoutePlayback(1).routes;
    const timelines = routes.map((route) => buildRouteTimeline(route));
    const maxMs = playbackMaxDurationMs(timelines);

    const start = routeStatesAtElapsed(routes, timelines, 0);
    const end = routeStatesAtElapsed(routes, timelines, maxMs);

    expect(start[0]?.completedStops).toBe(0);
    expect(end[0]?.completedStops).toBe(routes[0]!.stops.length);
    expect(end[0]?.progress).toBe(1);
  });

  it('routeStateAtElapsed holds position during service segments', () => {
    const route = mockDailyRoutePlayback(1).routes[0]!;
    const timeline = buildRouteTimeline(route, { pauseAtStops: true, stopDwellMs: 800 });
    const serviceSegment = timeline.segments.find((segment) => segment.kind === 'service');
    expect(serviceSegment).toBeDefined();

    const duringService = routeStateAtElapsed(
      route,
      timeline,
      serviceSegment!.startMs + 10,
    );
    expect(duringService.isAtStop).toBe(true);
    expect(duringService.lineProgress).toBeCloseTo(serviceSegment!.lineProgressStart, 5);
  });

  it('global progress helpers are reversible', () => {
    const maxMs = 120_000;
    const progress = 0.42;
    const elapsed = elapsedMsAtGlobalProgress(progress, maxMs);
    expect(globalProgressAtElapsed(elapsed, maxMs)).toBeCloseTo(progress, 5);
  });
});

describe('routePlaybackMath multi-route', () => {
  it('supports up to three simultaneous demo routes', () => {
    const routes = mockDailyRoutePlayback(1).routes;
    expect(routes.length).toBe(3);
    const timelines = routes.map((route) => buildRouteTimeline(route));
    const states = routeStatesAtElapsed(routes, timelines, 30_000);
    expect(states).toHaveLength(3);
    states.forEach((state) => {
      expect(state.progress).toBeGreaterThanOrEqual(0);
      expect(state.progress).toBeLessThanOrEqual(1);
    });
  });
});

describe('routePlaybackMath presentation', () => {
  it('formats simulated clock with stop progress', () => {
    const routes = mockDailyRoutePlayback(1).routes;
    const timelines = routes.map((route) => buildRouteTimeline(route));
    const states = routeStatesAtElapsed(routes, timelines, 45 * 60_000);
    const label = simulatedClockLabel(routes, 45 * 60_000, states);
    expect(label).toMatch(/^\d{2}:\d{2} — Parada \d+\/\d+$/);
  });

  it('formats completion summary with duration and stops', () => {
    const routes = mockDailyRoutePlayback(1).routes;
    const maxMs = playbackMaxDurationMs(routes.map((route) => buildRouteTimeline(route)));
    const summary = playbackCompletionSummary(routes, maxMs);
    expect(summary).toContain('Ruta completada en');
    expect(summary).toContain('paradas');
  });
});
