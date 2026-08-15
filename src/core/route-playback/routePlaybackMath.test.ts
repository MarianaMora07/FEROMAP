import { describe, expect, it } from 'vitest';
import { mockDailyRoutePlayback } from '../../data/mock/routePlayback';
import type { RoutePlaybackModel } from './routePlaybackTypes';
import {
  buildRouteTimeline,
  densifyLineByDistance,
  elapsedMsAtGlobalProgress,
  getRouteLineMetrics,
  globalProgressAtElapsed,
  interpolateAlongLine,
  playbackMaxDurationMs,
  playbackCompletionSummary,
  routeStateAtElapsed,
  routeStatesAtElapsed,
  simulatedClockLabel,
  sliceLineCoordinates,
  stopLineProgress,
  truckMarkerLabel,
  bearingAlongLine,
} from './routePlaybackMath';

const LINE: Array<[number, number]> = [
  [-62.715, 8.295],
  [-62.718, 8.296],
  [-62.721, 8.297],
  [-62.724, 8.298],
];

function buildTestRoute(
  lineCoordinates: Array<[number, number]>,
  stops: RoutePlaybackModel['stops'],
): RoutePlaybackModel {
  return {
    routeId: 99,
    vehicleId: 1,
    vehicleLabel: 'TR-TEST',
    color: '#000000',
    lineCoordinates,
    stops,
    totalDurationMinutes: 60,
    startTime: '2026-08-14T06:00:00+00:00',
  };
}

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

  it('getRouteLineMetrics precomputes cumulative distances', () => {
    const metrics = getRouteLineMetrics(LINE);
    expect(metrics).not.toBeNull();
    expect(metrics!.cumulativeDistancesKm[0]).toBe(0);
    expect(metrics!.cumulativeDistancesKm.at(-1)).toBeCloseTo(metrics!.totalLengthKm, 8);
    expect(metrics!.totalLengthKm).toBeGreaterThan(0);
  });

  it('stopLineProgress projects stops onto the route line', () => {
    const route = mockDailyRoutePlayback(1).routes[0]!;
    const progress = stopLineProgress(route.lineCoordinates, route.stops[0]!);
    expect(progress).toBeGreaterThanOrEqual(0);
    expect(progress).toBeLessThanOrEqual(1);
  });

  it('uses distance not vertex count: sparse vs dense line share stop progress', () => {
    const start = LINE[0]!;
    const end = LINE[LINE.length - 1]!;
    const sparse = [start, end] as Array<[number, number]>;
    const dense = densifyLineByDistance(start, end, 20);

    const midpoint = interpolateAlongLine(sparse, 0.5);
    const stop = {
      sequence: 1,
      lng: midpoint[0],
      lat: midpoint[1],
      code: 'CNT-MID',
      serviceMinutes: 5,
      stopType: 'collection' as const,
    };

    const sparseProgress = stopLineProgress(sparse, stop);
    const denseProgress = stopLineProgress(dense, stop);
    expect(sparseProgress).toBeCloseTo(0.5, 4);
    expect(denseProgress).toBeCloseTo(0.5, 4);
    expect(denseProgress).toBeCloseTo(sparseProgress, 4);
  });

  it('uses distance not vertex count: same travel time for sparse and dense lines', () => {
    const start = LINE[0]!;
    const end = LINE[LINE.length - 1]!;
    const sparse = [start, end] as Array<[number, number]>;
    const dense = densifyLineByDistance(start, end, 20);
    const midpoint = interpolateAlongLine(sparse, 0.5);
    const stop = {
      sequence: 1,
      lng: midpoint[0],
      lat: midpoint[1],
      code: 'CNT-MID',
      serviceMinutes: 5,
      stopType: 'collection' as const,
    };

    const sparseTimeline = buildRouteTimeline(buildTestRoute(sparse, [stop]), {
      pauseAtStops: false,
    });
    const denseTimeline = buildRouteTimeline(buildTestRoute(dense, [stop]), {
      pauseAtStops: false,
    });

    const sparseTravel = sparseTimeline.segments.find((segment) => segment.kind === 'travel');
    const denseTravel = denseTimeline.segments.find((segment) => segment.kind === 'travel');
    expect(sparseTravel).toBeDefined();
    expect(denseTravel).toBeDefined();
    expect(denseTravel!.endMs - denseTravel!.startMs).toBeCloseTo(
      sparseTravel!.endMs - sparseTravel!.startMs,
      0,
    );
  });

  it('projects landfill stop onto the polyline vertex', () => {
    const route = mockDailyRoutePlayback(1).routes[0]!;
    const landfill = route.stops.find((stop) => stop.stopType === 'landfill');
    expect(landfill).toBeDefined();

    const progress = stopLineProgress(route.lineCoordinates, landfill!);
    const position = interpolateAlongLine(route.lineCoordinates, progress);
    expect(position[0]).toBeCloseTo(landfill!.lng, 5);
    expect(position[1]).toBeCloseTo(landfill!.lat, 5);
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

  it('computes geographic bearing along the polyline', () => {
    const heading = bearingAlongLine(LINE, 0.5);
    expect(Number.isFinite(heading)).toBe(true);
  });

  it('includes bearing in route state at elapsed time', () => {
    const route = buildTestRoute(LINE, [
      {
        sequence: 1,
        lng: LINE[0]![0],
        lat: LINE[0]![1],
        code: 'CNT-01',
        serviceMinutes: 5,
        stopType: 'collection',
      },
    ]);
    const timeline = buildRouteTimeline(route);
    const state = routeStateAtElapsed(route, timeline, timeline.totalDurationMs / 2);
    expect(Number.isFinite(state.bearing)).toBe(true);
  });

  it('formats truck label with plate and simulated time when startTime exists', () => {
    const route = buildTestRoute(LINE, []);
    const state = {
      routeId: route.routeId,
      progress: 0.5,
      lineProgress: 0.5,
      bearing: 90,
      currentStopIndex: 0,
      completedStops: 0,
      position: LINE[1]!,
      isAtStop: false,
    };
    expect(truckMarkerLabel(route, state)).toMatch(/TR-TEST · \d{2}:\d{2}/);
  });
});
