# Fase 0 — Contrato de datos para playback de rutas

## Objetivo

Definir el payload de solo lectura que alimentará la animación de recorrido (Fases 1–2), sin UI todavía.

## Fuentes de datos

| Fuente | URL | Uso |
|--------|-----|-----|
| **Canónica** | `GET /api/v1/planning/daily/{dailyPlanId}/routes/playback` | Cliente de playback (`fetchDailyRoutePlayback`) |
| **Alternativa** | `GET /api/v1/map/context?dailyPlanId={id}&playbackDetails=true` | Mismo contrato vía propiedades GeoJSON (`fetchRoutePlaybackFromMapContext`) |

Ambas fuentes son **solo lectura** y no mutan la base de datos.

## Tipo `RoutePlaybackModel` (frontend)

```ts
interface RoutePlaybackStop {
  sequence: number;
  lng: number;
  lat: number;
  code: string;
  serviceMinutes: number;
}

interface RoutePlaybackModel {
  routeId: number;
  vehicleId: number;
  vehicleLabel: string;
  color: string;
  lineCoordinates: [lng: number, lat: number][];
  stops: RoutePlaybackStop[];
  totalDurationMinutes: number;
  startTime?: string | null;
}
```

Implementación: `src/core/route-playback/routePlaybackTypes.ts`

## Criterios de aceptación

1. **1–3 rutas simultáneas (demo):** el mock y los seeds de defensa incluyen hasta 3 rutas; la API admite hasta 6 (`MAX_PLAYBACK_ROUTES`).
2. **Preview sin despacho:** `previewMode: true` cuando el plan está en `draft`, `open` u `optimized`; las rutas `pending` se incluyen sin requerir despacho.
3. **Solo lectura:** ningún endpoint de playback escribe en BD; la animación futura no debe llamar a `advance` durante el preview.
4. **Geometría vial real:** `lineCoordinates` proviene de `build_route_linestring_cached` (red OSMnx/NetworkX con fallback a línea recta).
5. **Paradas con coordenadas:** cada `stop` incluye `lng`, `lat`, `code` y `serviceMinutes` derivado de dotación (`crew_service_time`).
6. **Validación en cliente:** `isRoutePlaybackModel` / `isDailyRoutePlaybackResponse` rechazan payloads incompletos antes de animar.

## Riesgo validado

`map/context` **no** traía paradas antes de esta fase. Se resolvió con:

- Propiedades `stops`, `totalDurationMinutes`, `startTime` cuando `playbackDetails=true`
- Endpoint dedicado `/routes/playback` como fuente canónica

## Archivos clave

| Capa | Ruta |
|------|------|
| Backend servicio | `backend/app/services/route_playback_service.py` |
| Backend API | `backend/app/api/v1/planning.py` |
| Map context extendido | `backend/app/services/map_context_service.py` |
| Tipos TS | `src/core/route-playback/` |
| API cliente | `src/core/api/routePlayback.ts` |
| Mock | `src/data/mock/routePlayback.ts` |
| Tests | `backend/tests/test_route_playback_service.py`, `src/core/route-playback/routePlayback.test.ts` |

## Próxima fase

Fase 1: `useRoutePlayback` + capa MapLibre reutilizando `interpolateAlongLine` de `simulationMapExecution.ts`.
