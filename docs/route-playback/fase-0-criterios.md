# Fase 0 — Contrato de datos para playback de rutas

> **Actualización Fase 10.0:** se añade `stopType` obligatorio en payloads nuevos y matriz de aceptación de movimiento. Ver [docs/fase-10/README.md](../fase-10/README.md).

## Objetivo

Definir el payload de solo lectura que alimentará la animación de recorrido (Fases 1–2 y Fase 10), sin depender de una pantalla concreta.

## Fuentes de datos

| Fuente | URL | Uso |
|--------|-----|-----|
| **Canónica** | `GET /api/v1/planning/daily/{dailyPlanId}/routes/playback` | Cliente de playback (`fetchDailyRoutePlayback`) |
| **Alternativa** | `GET /api/v1/map/context?dailyPlanId={id}&playbackDetails=true` | Mismo contrato vía propiedades GeoJSON (`fetchRoutePlaybackFromMapContext`) |

Ambas fuentes son **solo lectura** y no mutan la base de datos.

## Tipo `RoutePlaybackModel` (frontend)

```ts
type RoutePlaybackStopType = 'collection' | 'landfill';

interface RoutePlaybackStop {
  sequence: number;
  lng: number;
  lat: number;
  code: string;
  serviceMinutes: number;
  stopType: RoutePlaybackStopType;
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

interface DailyRoutePlaybackResponse {
  dailyPlanId: number;
  operationDate: string;
  previewMode: boolean;
  routes: RoutePlaybackModel[];  // máx. 6
}
```

Implementación: `src/core/route-playback/routePlaybackTypes.ts`

### `stopType` (Fase 10)

| Valor | Significado | UI en playback |
|-------|-------------|----------------|
| `collection` | Parada en contenedor / punto de recolección | ○ ● ✓ según progreso |
| `landfill` | Descarga en vertedero (`code: "VERTEDERO"`) | ♻ |

**Retrocompatibilidad:** payloads sin `stopType` se normalizan en cliente con `normalizeRoutePlaybackStop()` / `inferRoutePlaybackStopType()` usando `code`.

## Criterios de aceptación (contrato de datos)

1. **1–3 rutas simultáneas (demo):** el mock y los seeds de defensa incluyen hasta 3 rutas; la API admite hasta 6 (`MAX_PLAYBACK_ROUTES` / `ROUTE_PLAYBACK_MAX_ROUTES`).
2. **Preview sin despacho:** `previewMode: true` cuando el plan está en `draft`, `open` u `optimized`; las rutas `pending` se incluyen sin requerir despacho.
3. **Solo lectura:** ningún endpoint de playback escribe en BD; la animación no debe llamar a `advance` durante el preview.
4. **Geometría vial real:** `lineCoordinates` proviene de `build_route_linestring_cached` (red OSMnx/NetworkX con fallback a línea recta).
5. **Paradas con coordenadas:** cada `stop` incluye `lng`, `lat`, `code`, `serviceMinutes` y `stopType`.
6. **Vertedero en playback:** paradas `landfill` usan coordenadas del vertedero operativo y `serviceMinutes` según `landfillUnloadMinutes`.
7. **Validación en cliente:** `isRoutePlaybackModel` / `isDailyRoutePlaybackResponse` rechazan payloads incompletos antes de animar.

## Criterios de aceptación — movimiento visible (Fase 10)

| ID | Criterio | Estado |
|----|----------|--------|
| M1 | Parada ♻ en rutas con vertedero | Contrato ✅ · UI en Optimización/Monitoreo |
| M2 | Velocidad visual ±10 % vs distancia real | ✅ Fase 10.1 |
| M3 | `previewMode` en plan `optimized` | ✅ |
| M4 | 6 camiones sin FPS degradado | QA manual Fase 10.5 |

Detalle completo: [docs/fase-10/README.md](../fase-10/README.md).

## Riesgo validado

`map/context` **no** traía paradas antes de la Fase 0 playback. Se resolvió con:

- Propiedades `stops`, `totalDurationMinutes`, `startTime` cuando `playbackDetails=true`
- Endpoint dedicado `/routes/playback` como fuente canónica

## Archivos clave

| Capa | Ruta |
|------|------|
| Backend servicio | `backend/app/services/route_playback_service.py` |
| Backend schema | `backend/app/schemas/route_playback.py` |
| Backend API | `backend/app/api/v1/planning.py` |
| Map context extendido | `backend/app/services/map_context_service.py` |
| Tipos TS | `src/core/route-playback/` |
| API cliente | `src/core/api/routePlayback.ts` |
| Mock | `src/data/mock/routePlayback.ts` |
| Tests | `backend/tests/test_route_playback_service.py`, `src/core/route-playback/routePlayback.test.ts` |

## Próxima fase

**Fase 10.2:** geometría unificada en vista operador (misma polyline API que GIS).
