export type {
  DailyRoutePlaybackResponse,
  RoutePlaybackCoordinate,
  RoutePlaybackModel,
  RoutePlaybackStop,
} from './routePlaybackTypes';
export {
  ROUTE_PLAYBACK_DEMO_ROUTE_COUNT,
  ROUTE_PLAYBACK_MAX_ROUTES,
} from './routePlaybackTypes';

export {
  assertPlaybackRouteCount,
  isDailyRoutePlaybackResponse,
  isRoutePlaybackModel,
  isRoutePlaybackStop,
} from './routePlaybackValidation';

export type {
  MapContextPlaybackRouteFeature,
  MapContextPlaybackRouteProperties,
} from './mapContextRoutePlayback';
export {
  mapContextFeatureToPlaybackModel,
  mapContextRoutesToPlaybackModels,
} from './mapContextRoutePlayback';

export {
  fetchDailyRoutePlayback,
  fetchRoutePlaybackFromMapContext,
  type RoutePlaybackSource,
} from '../api/routePlayback';

export {
  buildPlaybackTimelines,
  buildRouteTimeline,
  globalProgressAtElapsed,
  interpolateAlongLine,
  playbackMaxDurationMs,
  primaryStopIndex,
  primaryStopLabel,
  routeStateAtElapsed,
  routeStatesAtElapsed,
  sliceLineCoordinates,
  stopLineProgress,
  DEFAULT_STOP_DWELL_MS,
  ROUTE_PLAYBACK_SPEEDS,
  type PlaybackTimelineSegment,
  type RoutePlaybackRouteState,
  type RoutePlaybackSpeed,
  type RoutePlaybackTimeline,
} from './routePlaybackMath';

export { useRoutePlayback, type RoutePlaybackController, type UseRoutePlaybackOptions } from './useRoutePlayback';
