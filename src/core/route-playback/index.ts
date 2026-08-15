export type {
  DailyRoutePlaybackResponse,
  RoutePlaybackCoordinate,
  RoutePlaybackModel,
  RoutePlaybackStop,
  RoutePlaybackStopType,
} from './routePlaybackTypes';
export {
  ROUTE_PLAYBACK_DEMO_ROUTE_COUNT,
  ROUTE_PLAYBACK_LANDFILL_CODE,
  ROUTE_PLAYBACK_MAX_ROUTES,
  ROUTE_PLAYBACK_STOP_TYPES,
} from './routePlaybackTypes';

export {
  assertPlaybackRouteCount,
  inferRoutePlaybackStopType,
  isDailyRoutePlaybackResponse,
  isLandfillPlaybackStop,
  isRoutePlaybackModel,
  isRoutePlaybackStop,
  isRoutePlaybackStopType,
  normalizeRoutePlaybackStop,
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
  fetchSimulationRoutePlayback,
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
  densifyLineByDistance,
  getRouteLineMetrics,
  DEFAULT_STOP_DWELL_MS,
  ROUTE_PLAYBACK_SPEEDS,
  type PlaybackTimelineSegment,
  type RoutePlaybackRouteState,
  type RoutePlaybackSpeed,
  type RoutePlaybackTimeline,
} from './routePlaybackMath';

export { useRoutePlayback, type RoutePlaybackController, type UseRoutePlaybackOptions } from './useRoutePlayback';
