# Fase 10 — Visualización de movimiento de flota

**Estado:** Fase 10.7 completada (vista operador móvil)  
**Fecha inicio:** 2026-08-15

## Objetivo

Definir qué significa **“ver el movimiento”** de los camiones en el mapa antes de implementar mejoras de motor (Fase 10.1+) y despliegue en todas las pantallas. El mapa base sigue siendo **MapLibre**; los datos vienen de la **API**; la animación es **cliente**.

## Alcance por subfases

| Fase | Alcance | Estado |
|------|---------|--------|
| **10.0** | Contrato `stopType`, matriz de aceptación, docs | ✅ Completada |
| **10.1** | Motor de movimiento por distancia (Turf) | ✅ Completada |
| **10.2** | Geometría unificada (operador = API) | ✅ Completada |
| **10.3** | Playback en simulación post-ejecución | ✅ Completada |
| **10.4** | Playback en mapa GIS | ✅ Completada |
| **10.5** | Pulido visual (rotación camión, cámara, rastro) | ✅ Completada |
| **10.6** | Componente `<OperationalMap>` compartido | ✅ Completada |
| **10.7** | Vista operador móvil (opcional) | ✅ Completada |

## Entregables Fase 10.1

| Entregable | Ubicación |
|------------|-----------|
| Geometría por distancia (Turf) | `src/core/route-playback/routePlaybackGeometry.ts` |
| Timeline usa progreso por metros | `src/core/route-playback/routePlaybackMath.ts` |
| Reutilización en simulación | `src/features/simulation/simulationMapExecution.ts` |
| Tests sparse vs dense + vertedero | `src/core/route-playback/routePlaybackMath.test.ts` |

## Entregables Fase 10.0

| Entregable | Ubicación |
|------------|-----------|
| Matriz de aceptación (este doc) | `docs/fase-10/README.md` |
| Contrato playback ampliado | `docs/route-playback/fase-0-criterios.md` |
| Tipo `RoutePlaybackStop.stopType` | `src/core/route-playback/routePlaybackTypes.ts` |
| Validación y normalización | `src/core/route-playback/routePlaybackValidation.ts` |
| Schema Pydantic | `backend/app/schemas/route_playback.py` |
| Mock con vertedero | `src/data/mock/routePlayback.ts` |

## Contrato `RoutePlaybackStop` (Fase 10)

```ts
type RoutePlaybackStopType = 'collection' | 'landfill';

interface RoutePlaybackStop {
  sequence: number;
  lng: number;
  lat: number;
  code: string;           // "VERTEDERO" para vertedero
  serviceMinutes: number;
  stopType: RoutePlaybackStopType;  // obligatorio en payloads nuevos
}
```

- **Backend:** `route_playback_service._build_stop` emite `stopType` en cada parada.
- **Retrocompat:** si un payload legacy omite `stopType`, el cliente infiere desde `code === "VERTEDERO"` (`inferRoutePlaybackStopType`).
- **Límite:** máximo **6 rutas** simultáneas (`ROUTE_PLAYBACK_MAX_ROUTES`).

## Matriz de aceptación — “ver el movimiento”

| ID | Criterio | Verificación | Fase que lo cumple |
|----|----------|--------------|-------------------|
| **M1** | Ruta con vertedero muestra parada ♻ en el mapa durante playback | Mock ruta 1 incluye `stopType: landfill`; `RoutePlaybackMarkers` renderiza símbolo ♻ | 10.0 (contrato) · UI ya en Optimización/Monitoreo |
| **M2** | Velocidad visual constante en rectas y curvas (±10 % vs distancia real) | Test: misma distancia con 2 vs 20 vértices → mismo tiempo de viaje | **10.1** |
| **M3** | Preview con plan `optimized` sin despacho (`previewMode: true`) | `build_daily_route_playback` + test backend; botón playback en Optimización | 10.0 (contrato) · ya operativo |
| **M4** | Hasta 6 camiones simultáneos sin caída visible de FPS | Manual: DevTools Performance, 6 rutas en playback 1× | **10.1–10.5** (manual QA) |
| **M5** | Geometría vial real (`lineCoordinates` desde OSMnx) | `build_route_linestring_cached` en backend | Fase 0 playback (previo) |
| **M6** | Paradas con coordenadas y tiempos de servicio | `stops[]` con `lng`, `lat`, `serviceMinutes` | Fase 0 + Fase 9 vertedero |
| **M7** | Solo lectura: playback no muta BD en preview | Ningún endpoint de playback escribe | Fase 0 (previo) |
| **M8** | Mismo contrato en `/routes/playback` y `map/context?playbackDetails=true` | Tests cliente + `mapContextRoutePlayback` | 10.0 |

### Definición operativa de “movimiento visible”

1. El usuario ve la **polyline** sobre calles (o fallback recto).
2. Un **marcador de camión** avanza a lo largo de la polyline respetando tiempos de viaje y servicio.
3. Las **paradas** cambian de estado: pendiente ○ → actual ● → completada ✓; vertedero ♻.
4. El usuario puede **pausar**, cambiar velocidad (1×/2×/4×) y (futuro) arrastrar la barra de tiempo.

## Verificación Fase 10.0

```bash
# Backend — contrato playback + stopType
cd backend && python -m pytest tests/test_route_playback_service.py -v

# Frontend — validación, normalización, mock con vertedero
npm test -- src/core/route-playback/routePlayback.test.ts
```

| Test / check | Verifica |
|--------------|----------|
| `test_build_daily_route_playback_returns_stops_and_geometry` | Payload base con `stopType: collection` |
| `test_build_daily_route_playback_includes_stop_type` | Cada stop trae `stopType` válido |
| `accepts mock daily playback payload` | Mock 3 rutas, ruta 1 con vertedero |
| `infers landfill stopType from VERTEDERO code` | Retrocompat sin `stopType` |
| `rejects invalid stopType` | Solo `collection` \| `landfill` |

## Guion manual (smoke test actual)

1. **Optimización** → plan en estado `optimized` → abrir playback.
2. Confirmar ruta con parada **VERTEDERO** (cuando el escenario incluye multi-viaje).
3. Play → el marcador ♻ aparece en la secuencia de paradas.
4. `previewMode: true` en respuesta de red (sin despacho previo).

## Archivos clave

| Capa | Ruta |
|------|------|
| Contrato playback (origen) | `docs/route-playback/fase-0-criterios.md` |
| Tipos TS | `src/core/route-playback/routePlaybackTypes.ts` |
| Validación | `src/core/route-playback/routePlaybackValidation.ts` |
| Backend servicio | `backend/app/services/route_playback_service.py` |
| Marcadores UI | `src/features/route-playback/RoutePlaybackMarkers.tsx` |
| Mock defensa | `src/data/mock/routePlayback.ts` |

## Verificación Fase 10.1

```bash
npm test -- src/core/route-playback/routePlaybackMath.test.ts
```

| Test | Verifica |
|------|----------|
| `uses distance not vertex count: sparse vs dense line share stop progress` | M2 — mismo progreso con 2 vs 20 vértices |
| `uses distance not vertex count: same travel time for sparse and dense lines` | Timeline de viaje proporcional a distancia |
| `projects landfill stop onto the polyline vertex` | Parada vertedero en la polyline |

## Entregables Fase 10.2

| Entregable | Ubicación |
|------------|-----------|
| `lineCoordinates` en snapshot operador | `backend/app/services/operator_service.py` |
| Capa mapa con geometría API + fallback | `src/core/map/operatorRouteMapLayers.ts` |
| Mapa GIS operador | `src/features/map/index.tsx` |
| Tests backend + frontend | `backend/tests/test_operator_service.py`, `src/core/map/operatorRouteMapLayers.test.ts` |

## Verificación Fase 10.2

```bash
cd backend && .venv/bin/python -m pytest tests/test_operator_service.py -v
npm test -- src/core/map/operatorRouteMapLayers.test.ts
```

## Entregables Fase 10.3

| Entregable | Ubicación |
|------------|-----------|
| Endpoint playback por simulación | `GET /api/v1/simulations/{id}/routes/playback` |
| Servicio compartido daily + simulation | `backend/app/services/route_playback_service.py` |
| Cliente API simulación | `src/core/api/routePlayback.ts` → `fetchSimulationRoutePlayback` |
| Panel genérico de controles | `src/features/route-playback/RoutePlaybackPanel.tsx` |
| Mapa simulación + capa playback | `src/features/simulation/SimulationMapPanel.tsx` |
| Orquestación post-ejecución | `src/features/simulation/index.tsx` |
| Store: `lastDailyPlanId` + rutas en mapa | `src/core/stores/simulationStore.ts` |

### Comportamiento

1. Durante la ejecución ACO (`fase aco`): overlay decorativo (líneas exploratorias + camiones animados).
2. Al terminar (`listo`): overlay ACO se oculta; rutas optimizadas quedan en el mapa.
3. Paso 3 abre playback automáticamente; prioriza `fetchDailyRoutePlayback(dailyPlanId)` si existe, si no `fetchSimulationRoutePlayback(simulationId)`.
4. `RoutePlaybackLayer` + `RoutePlaybackPanel` (play / pausa / velocidad / barra de tiempo) igual que en Optimización.

## Verificación Fase 10.3

```bash
# Backend — playback por simulación
cd backend && .venv/bin/python -m pytest tests/test_route_playback_service.py -v

# Frontend — contrato playback
npm test -- src/core/route-playback/routePlayback.test.ts
```

| Test / check | Verifica |
|--------------|----------|
| `test_build_simulation_route_playback_returns_routes` | Payload con `simulationId`, `previewMode`, `stopType` |
| Guion manual: escenario `saturated` → ejecutar → paso 3 | Playback auto-abierto, camiones sobre geometría vial |
| Play en panel de controles | Marcadores avanzan; paradas ♻ visibles en multi-viaje vertedero |
| Botón «Ver recorrido» (paso 2, tras resultados) | Reabre playback sin re-ejecutar |

## Guion demo defensa (10.3)

1. Simulación → escenario **saturado** → paso 2 → **Ejecutar simulación**.
2. Al finalizar, paso 3 muestra mapa con **Recorrido simulado** y panel lateral.
3. **Play** → camión(s) siguen la polyline real; en rutas con vertedero, paradas **♻** en secuencia.
4. Escenarios multi-viaje: contador **Vertederos** > 1 en el resumen del panel.

## Entregables Fase 10.4

| Entregable | Ubicación |
|------------|-----------|
| Integración playback en mapa GIS | `src/features/map/index.tsx` |
| Panel lateral + seguir camión | `src/features/map/MapPlaybackPanel.tsx` |
| Filtros sincronizados (ruta/vehículo) | `src/core/map/mapPlaybackUx.ts` |
| Deep link playback mapa | `mapPlaybackHref()` en `operationalLinks.ts` |

### Comportamiento

1. Panel **Capas** → selector de fecha / plan del día.
2. **Ver recorrido** abre overlay con controles de playback (sin ocultar contenedores ni rutas base).
3. Rutas del playback respetan toggles de capa por ruta y `vehicleId` en URL.
4. **Seguir camión** centra el mapa con `easeTo` en la posición animada del marcador.

## Verificación Fase 10.4

```bash
npm test -- src/core/map/mapPlaybackUx.test.ts
npm test -- src/core/planning/operationalLinks.test.ts
```

| Check manual | Verifica |
|--------------|----------|
| Mapa GIS → fecha con plan optimizado → Ver recorrido | Panel + camiones animados sobre capas |
| Desmarcar una ruta en capas durante playback | Esa ruta desaparece del playback |
| `?vehicleId=TR-08` + playback | Solo ruta del vehículo focalizado |
| Activar «Seguir camión» + Play | Cámara sigue el marcador |

## Entregables Fase 10.5

| Mejora | Ubicación |
|--------|-----------|
| Rotación por bearing geográfico | `routePlaybackGeometry.bearingAlongLine`, `RoutePlaybackMarkers` |
| Rastro (glow + línea gruesa) | `RoutePlaybackLayer` capas progress + glow |
| Etiqueta placa + % / hora | `truckMarkerLabel()` + pill en marker |
| Paradas ✓ ● ○ ♻ | `RoutePlaybackMarkers` + `tokens.css` |
| Scrubber arrastrable | `RoutePlaybackControls` (`input[type=range]`) |
| Cámara libre / seguir / ver todas | `playbackCameraUx.ts`, `PlaybackCameraControls`, `MapPlaybackPanel` |

## Verificación Fase 10.5

```bash
npm test -- src/core/route-playback/routePlaybackMath.test.ts src/core/route-playback/playbackCameraUx.test.ts
```

| Check manual | Verifica |
|--------------|----------|
| Play en mapa GIS | Camión rota al avanzar; rastro verde más grueso detrás |
| Etiqueta sobre camión | Muestra placa + hora (o % si no hay `startTime`) |
| Scrubber | Arrastrar barra reposiciona camión y paradas |
| Cámara «Seguir camión» | Mapa sigue el marcador durante play |
| Cámara «Ver todas» | `fitBounds` a todas las rutas visibles |

## Entregables Fase 10.6

| Entregable | Ubicación |
|------------|-----------|
| Shell MapLibre reutilizable | `src/core/map/OperationalMap.tsx` |
| Contexto `useOperationalMap()` | `src/core/map/operationalMapContext.tsx` |
| Hook capas de rutas | `src/core/map/useOperationalRoutesLayer.ts` |
| Hook capas playback | `src/core/map/useRoutePlaybackLayer.ts` |
| Barrel exports | `src/core/map/index.ts` |

### Pantallas migradas

| Pantalla | Cambio |
|----------|--------|
| Optimización | `OperationalMap` en `OptimizationRouteMap.tsx` |
| Monitoreo | `OperationalMap` + `useOperationalRoutesLayer('live-routes')` |
| Simulación | `OperationalMap` en `SimulationMapPanel.tsx` |
| Mapa GIS | `OperationalMap` (`themeSync={false}`) + `useOperationalRoutesLayer` |

## Verificación Fase 10.6

```bash
npm test -- src/core/route-playback/playbackCameraUx.test.ts
```

Smoke manual: abrir Optimización, Monitoreo, Simulación y Mapa GIS — mapa carga, tema/estilo restauran capas tras cambio.

## Entregables Fase 10.7

| Entregable | Ubicación |
|------------|-----------|
| UX playback operador (1 camión, sin autoplay) | `src/core/operator/operatorPlaybackUx.ts` |
| Mapa móvil simplificado | `src/features/operator/OperatorMobilePlayback.tsx` |
| Controles mínimos (play/pausa) | `src/features/operator/OperatorMobilePlaybackControls.tsx` |
| Sincronización con journey strip | `OperatorJourneyStrip` + `OperatorNextStopCard` |
| Monitoreo campo sin panel complejo | `src/features/monitoring/index.tsx` |

### Comportamiento

1. **Mi operación** (`/operator`): mapa compacto bajo la franja de jornada; un solo camión; play manual.
2. **Siguiente parada** en `OperatorJourneyStrip` / `OperatorNextStopCard` se actualiza con el estado del playback al reproducir.
3. **Monitoreo campo**: playback visual se carga automáticamente (posición actual), sin panel de velocidad/scrubber; solo botón flotante Play/Pausa.
4. `autoPlay: false` por defecto — ahorro de batería; el conductor inicia la animación.

## Verificación Fase 10.7

```bash
npm test -- src/core/operator/operatorPlaybackUx.test.ts
```

| Check manual | Verifica |
|--------------|----------|
| `/operator` con ruta activa | Mapa compacto + franja de avance |
| Play en mapa operador | Próxima parada y % avance sincronizados en journey strip |
| Monitoreo como conductor | Sin panel «Reproducir ruta»; solo play flotante en mapa |
| Sin tocar Play | Camión quieto en posición actual (no autoplay) |
