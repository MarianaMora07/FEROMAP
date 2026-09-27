# Fase 9 — Vertedero obligatorio y jornada operativa

**Estado:** Fase 5 completada (matriz de aceptación)  
**Fecha inicio:** 2026-08-15

## Objetivo

Modelar viajes obligatorios al vertedero cuando el camión alcanza su capacidad máxima, y cortar la ruta cuando supera la jornada **06:00 – 18:00**, sin cambiar el objetivo del ACO (distancia), pero reflejando duración realista y cobertura en KPIs.

## Entregables Fase 0

| Entregable | Ubicación |
|------------|-----------|
| ADR (decisiones + fórmulas) | [adr-vertedero-multi-viaje.md](./adr-vertedero-multi-viaje.md) |
| Dominio Python | `backend/app/domain/landfill_service_time.py` |
| Contrato TypeScript | `src/core/types/landfillServiceTime.ts` |
| API.md | Sección vertedero + jornada |

## Fases siguientes

| Fase | Alcance | Estado |
|------|---------|--------|
| **0** | ADR + contrato API/tipos | ✅ Completada |
| **1** | BD `waypoint_type`, settings admin (coords vertedero) | ✅ Completada |
| **2** | Motor multi-viaje + corte jornada en ACO | ✅ Completada |
| **3** | Persistencia, GeoJSON, playback, KPIs | ✅ Completada |
| **4** | UI simulación, mapa, alertas uncovered | ✅ Completada |
| **5** | Tests integración (matriz aceptación) | ✅ Completada |

## Verificación Fase 5 (matriz de aceptación)

```bash
# Backend — 11 tests de aceptación
cd backend && python -m pytest tests/test_landfill_multi_trip.py -v

# Frontend — fórmulas y KPIs
npm test -- src/core/types/landfillServiceTime.test.ts src/core/utils/optimizationResults.test.ts
```

| Test | Verifica |
|------|----------|
| `test_inserts_landfill_when_capacity_full` | Capacidad → visita obligatoria al vertedero |
| `test_landfill_resets_load_and_continues` | Tras descarga, sigue recolectando |
| `test_route_always_ends_at_depot` | Último índice = depósito (0) |
| `test_unload_if_loaded_at_shift_end` | Carga residual → vertedero antes de cerrar |
| `test_shift_limit_cuts_route_at_12h` | Jornada 06:00–18:00 corta la ruta |
| `test_uncovered_points_reported` | Contenedores fuera de jornada en KPIs |
| `test_no_capacity_violation_between_dumps` | Ningún tramo supera capacidad |
| `test_landfill_kpi_count` | `landfillTrips` correcto |
| `test_persist_landfill_waypoint` | BD: `waypoint_type=landfill` |
| `test_aco_fitness_unchanged_by_unload_time` | Misma semilla → misma distancia |

### Guion manual (defensa)

1. **Admin** → Instalaciones operativas: vertedero en `-62.690, 8.280`.
2. **Simulación** escenario `saturated` → rutas con 2+ viajes al vertedero en badges/KPIs.
3. **Alta demanda / jornada corta** → alerta de puntos no cubiertos.
4. **Mapa** → ruta visible pasando por el vertedero (pin ♻ y vértices en ruta).

## Verificación Fase 2

```bash
cd backend && python -m pytest tests/test_landfill_multi_trip.py tests/test_optimization_engine.py tests/test_aco_parallel.py -v
```

| Test | Verifica |
|------|----------|
| Capacidad llena → vertedero | `test_inserts_landfill_when_capacity_full` |
| Capacidad por tramo | `test_no_capacity_violation_between_dumps` |
| Jornada corta → uncovered | `test_shift_limit_cuts_route_at_12h` |
| Carga residual → vertedero antes de cerrar | `test_unload_if_loaded_at_shift_end` |
| Misma semilla → misma distancia | `test_aco_fitness_unchanged_by_unload_time` |

## Verificación Fase 3

```bash
cd backend && python -m pytest tests/test_landfill_phase3.py tests/test_route_playback_service.py -v
```

| Test | Verifica |
|------|----------|
| KPIs top-level vertedero | `test_compute_kpis_exposes_top_level_landfill_fields` |
| GeoJSON `stopType: landfill` | `test_routes_to_geojson_includes_landfill_stops` |
| Geometría con coords vertedero | `test_route_geometry_includes_landfill_coordinates` |
| Persistencia `waypoint_type=landfill` | `test_persist_routes_writes_landfill_waypoints` |
| Playback parada VERTEDERO | `test_build_stop_landfill_returns_vertedero` |

## Criterio de aceptación Fase 3

- Simulación persiste waypoints `landfill` en PostgreSQL.
- GeoJSON muestra la ruta pasando por el vertedero placeholder.
- KPIs incluyen viajes al vertedero y puntos no cubiertos.

## Verificación Fase 4

```bash
npm test -- src/core/utils/landfillUx.test.ts src/core/utils/optimizationResults.test.ts
cd backend && python -m pytest tests/test_operator_service.py -v
```

| Área | Verifica |
|------|----------|
| Admin pin map + aviso demo | `AdminOperationalSettings` + `LandfillPinMap` |
| Simulación paso 3 | `LandfillKpiStrip`, `UncoveredPointsAlert`, `DurationBreakdownPanel` |
| Mapa operativo | Capa vertedero desde `map/context.facilities` |
| Operador | `OperatorJourneyStrip` + parada VERTEDERO en `OperatorRoutePanel` |

## Criterio de aceptación Fase 4

- Admin cambia coordenadas del vertedero → próxima optimización usa las nuevas (vía `OperationalSettings` en backend).
- Resultados de simulación muestran viajes al vertedero y alerta de puntos no cubiertos.
- Mapa muestra el vertedero placeholder y la ruta pasando por él.

## Verificación Fase 1

```bash
cd backend && alembic upgrade head
cd backend && python -m pytest tests/test_operational_facilities_service.py tests/test_admin_service.py -v
```

| Test | Verifica |
|------|----------|
| Defaults incluyen vertedero placeholder | `test_operational_settings_defaults_include_landfill` |
| PATCH persiste coordenadas | `test_update_landfill_coordinates_persists` |
| Helper devuelve facilities | `test_resolve_operational_facilities_reads_settings` |

## Verificación Fase 0

```bash
# Backend — contrato vertedero + jornada
cd backend && python -m pytest tests/test_landfill_service_time.py -v

# Frontend — contrato TypeScript
npm test -- src/core/types/landfillServiceTime.test.ts
```

| Test | Archivo |
|------|---------|
| Descarga 15 min → 900 s | `test_landfill_service_time.py`, `landfillServiceTime.test.ts` |
| Jornada 06:00–18:00 → 43 200 s | `test_landfill_service_time.py` |
| `elapsedSec` = viaje + paradas + vertederos | `test_landfill_service_time.py` |
| `canFitStopInShift` rechaza parada fuera de jornada | `test_landfill_service_time.py` |

## Criterio de aceptación Fase 0

Un evaluador lee el ADR y entiende por qué el ACO optimiza distancia pero los KPIs reflejan descargas en vertedero y la jornada de 12 h.

## Referencias

- [ADR-004](./adr-vertedero-multi-viaje.md)
- [ADR-003 Dotación](../fase-8/adr-dotacion-tiempo-servicio.md)
