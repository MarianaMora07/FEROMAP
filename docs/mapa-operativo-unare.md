# Mapa operativo Unare

Guía del mapa operativo acotado a la **Parroquia Unare** (FEROMAP). Complementa `backend/docs/API.md` e `backend/docs/INTEGRATION.md`.

## Alcance geográfico

| Constante | Valor | Uso |
|-----------|-------|-----|
| `UNARE_BBOX` | `-62.81, 8.24, -62.69, 8.31` | Filtro API, tiles MBTiles |
| `UNARE_CENTER` | `-62.715, 8.295` | Centro por defecto (depósito) |
| `UNARE_ZOOM` | `13.5` | Zoom inicial |
| `minZoom` / `maxZoom` | `12` / `17` | MapLibre operativo |

Todos los mapas operativos comparten `maxBounds` = bbox Unare. No se puede hacer zoom out más allá de `minZoom: 12`.

## Fondo cartográfico

- **Producción / demo offline:** tiles locales MBTiles (`GET /api/v1/map/tiles/{z}/{x}/{y}.png`)
- **Desarrollo:** estilos OSM/Carto como fallback manual en selector de capas

Generación: `./backend/scripts/generate_unare_mbtiles.sh` (ver INTEGRATION.md).

## Rutas del plan del día

Las rutas visibles provienen del **plan diario activo** (`get_active_daily_plan`), no de mocks en runtime con API:

```
Optimizar → status=pending (línea punteada)
Despachar → status=in_progress (línea sólida)
```

| Propiedad GeoJSON | Tipo | Descripción |
|-------------------|------|-------------|
| `id` | string | Identificador estable (`route-{id}`) |
| `routeId` | number | PK `optimized_routes.id` |
| `label` | string | Etiqueta legible (`Ruta TR-08`) |
| `color` | string | Color hex rotativo (`ROUTE_COLORS`) |
| `vehicleId` | string | Código de vehículo |
| `status` | string | `pending` \| `in_progress` |
| `routeKind` | string | Siempre `optimized` en mapa operativo |
| `waypointsTotal` | number | Paradas de recolección |
| `waypointsDone` | number | Paradas completadas |

### Estilos visuales (frontend)

| `status` | Capa MapLibre | Patrón |
|----------|---------------|--------|
| `pending` | `operational-routes-pending` | Punteada, opacidad 0.75 |
| `in_progress` | `operational-routes-active` | Sólida, opacidad 0.95 |

### Visibilidad por rol

| Rol | Rutas mostradas |
|-----|-----------------|
| Planificador / admin | Todas las del plan activo |
| Conductor | Solo `driver_id` asignado |
| Residente | Rutas de su sector (vista acotada) |

## Vistas que usan el mapa operativo

| Vista | Componente | Fuente de datos |
|-------|------------|-----------------|
| Dashboard | `DashboardMiniMap` | `GET /api/v1/map/context` |
| Mapa GIS | `/map` | `GET /api/v1/map/context` |
| Monitoreo | mapa embebido | `/monitoring/status` o map context |
| Optimización | `OptimizationRouteMap` | Resultado local + enlace a `/map?focus=routes` |

## Configuración compartida (frontend)

- `src/core/map/operationalMapConfig.ts` — bounds, zoom, `fitMapToOperationalData`
- `src/core/map/operationalMapLayers.ts` — capas pending/active, filtros por ruta
- `src/core/utils/mapStyleConfig.ts` — estilo `unare-local` por defecto

## Tests

| Ámbito | Archivo |
|--------|---------|
| Backend bbox/rutas/colores | `backend/tests/test_map_context_service.py` |
| Backend geometría vial | `backend/tests/test_route_geometry_service.py` |
| Backend plan ↔ mapa | `backend/tests/test_map_planning_integration.py` |
| Frontend fit bounds | `src/core/map/operationalMapConfig.test.ts` |
| Frontend capas pending/active | `src/core/map/operationalMapLayers.test.ts` |
| E2E dashboard + /map | `e2e/operational-map.spec.ts` |

## Verificación manual rápida

1. Generar MBTiles: `./backend/scripts/generate_unare_mbtiles.sh`
2. Optimizar plan del día → dashboard muestra rutas punteadas
3. Despachar → mismas rutas pasan a sólidas
4. `/map?focus=routes` encuadra rutas del plan
5. Desconectar internet externo → fondo local sigue visible con backend levantado
