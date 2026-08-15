/** Coordenada geográfica para animación de recorrido ([lng, lat]). */
export type RoutePlaybackCoordinate = readonly [lng: number, lat: number];

export interface RoutePlaybackStop {
  sequence: number;
  lng: number;
  lat: number;
  code: string;
  serviceMinutes: number;
  stopType?: 'collection' | 'landfill';
}

/**
 * Contrato de una ruta lista para animación (Fase 0).
 * Fuente canónica: `GET /api/v1/planning/daily/{id}/routes/playback`.
 */
export interface RoutePlaybackModel {
  routeId: number;
  vehicleId: number;
  vehicleLabel: string;
  color: string;
  lineCoordinates: RoutePlaybackCoordinate[];
  stops: RoutePlaybackStop[];
  totalDurationMinutes: number;
  startTime?: string | null;
}

export interface DailyRoutePlaybackResponse {
  dailyPlanId: number;
  operationDate: string;
  /** `true` cuando el plan aún no fue despachado (preview post-optimización). */
  previewMode: boolean;
  routes: RoutePlaybackModel[];
}

/** Límite operativo documentado para playback simultáneo (1–3 rutas demo, hasta 6 en API). */
export const ROUTE_PLAYBACK_MAX_ROUTES = 6;
export const ROUTE_PLAYBACK_DEMO_ROUTE_COUNT = 3;
