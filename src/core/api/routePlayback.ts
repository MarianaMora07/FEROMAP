import { apiGet, withMockFallback } from './client';
import { fetchMapContext } from './map';
import type { MapContextFilters } from '../types/mapContext';
import {
  mapContextFeatureToPlaybackModel,
  type MapContextPlaybackRouteFeature,
} from '../route-playback/mapContextRoutePlayback';
import type {
  DailyRoutePlaybackResponse,
  RoutePlaybackModel,
  SimulationRoutePlaybackResponse,
} from '../route-playback/routePlaybackTypes';
import { isDailyRoutePlaybackResponse, isSimulationRoutePlaybackResponse } from '../route-playback/routePlaybackValidation';
import { mockDailyRoutePlayback } from '../../data/mock/routePlayback';

export type RoutePlaybackSource = 'playback-endpoint' | 'map-context';

export function fetchDailyRoutePlayback(
  dailyPlanId: number,
): Promise<DailyRoutePlaybackResponse> {
  return withMockFallback(
    `route-playback-daily-${dailyPlanId}`,
    async () => {
      const payload = await apiGet<unknown>(
        `/api/v1/planning/daily/${dailyPlanId}/routes/playback`,
      );
      if (!isDailyRoutePlaybackResponse(payload)) {
        throw new Error('Respuesta inválida del endpoint de playback.');
      }
      return payload;
    },
    mockDailyRoutePlayback(dailyPlanId),
  );
}

export function fetchSimulationRoutePlayback(
  simulationId: number,
): Promise<SimulationRoutePlaybackResponse> {
  return withMockFallback(
    `route-playback-simulation-${simulationId}`,
    async () => {
      const payload = await apiGet<unknown>(
        `/api/v1/simulations/${simulationId}/routes/playback`,
      );
      if (!isSimulationRoutePlaybackResponse(payload)) {
        throw new Error('Respuesta inválida del playback de simulación.');
      }
      return payload;
    },
    {
      simulationId,
      operationDate: new Date().toISOString().slice(0, 10),
      previewMode: true,
      routes: mockDailyRoutePlayback(simulationId).routes,
    },
  );
}

export async function fetchRoutePlaybackFromMapContext(
  dailyPlanId: number,
  filters?: Omit<MapContextFilters, 'dailyPlanId' | 'playbackDetails'>,
): Promise<{ routes: RoutePlaybackModel[]; source: RoutePlaybackSource }> {
  const context = await fetchMapContext({
    ...filters,
    dailyPlanId,
    playbackDetails: true,
  });

  const routes = context.routes.features
    .map((feature) =>
      mapContextFeatureToPlaybackModel(feature as MapContextPlaybackRouteFeature),
    )
    .filter((route): route is RoutePlaybackModel => route !== null);

  if (routes.length === 0) {
    const fallback = await fetchDailyRoutePlayback(dailyPlanId);
    return { routes: fallback.routes, source: 'playback-endpoint' };
  }

  return { routes, source: 'map-context' };
}
