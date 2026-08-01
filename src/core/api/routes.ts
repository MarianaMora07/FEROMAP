import type { RouteCollection } from '../../data/types/geo';
import { routesMock } from '../../data/mock/routes';
import { apiGet, apiPost, withMockFallback } from './client';

export function fetchCurrentRoute(): Promise<RouteCollection> {
  return withMockFallback(
    'routes-current',
    () => apiGet<RouteCollection>('/api/v1/routes/current'),
    {
      type: 'FeatureCollection',
      features: routesMock.features.filter((f) => f.properties.type === 'current'),
    },
  );
}

export function fetchOptimizedRoute(): Promise<RouteCollection> {
  return withMockFallback(
    'routes-optimized',
    () => apiGet<RouteCollection>('/api/v1/routes/optimized'),
    {
      type: 'FeatureCollection',
      features: routesMock.features.filter((f) => f.properties.type === 'optimized'),
    },
  );
}

export async function fetchAllRoutes(): Promise<RouteCollection> {
  const [current, optimized] = await Promise.all([
    fetchCurrentRoute(),
    fetchOptimizedRoute(),
  ]);
  return {
    type: 'FeatureCollection',
    features: [...current.features, ...optimized.features],
  };
}

export function mergeRouteCollections(
  current: RouteCollection,
  optimized: RouteCollection,
): RouteCollection {
  return {
    type: 'FeatureCollection',
    features: [...current.features, ...optimized.features],
  };
}

export function dispatchRoutes(): Promise<{ dispatchedRouteIds: number[]; count: number }> {
  return apiPost('/api/v1/routes/dispatch', {});
}

export function advanceRoutes(): Promise<{ advanced: number; routes: unknown[] }> {
  return apiPost('/api/v1/routes/advance', {});
}
