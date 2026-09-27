# Backlog 3 — Tráfico en vivo (OSRM, etc.)

**Estado:** backlog  
**Esfuerzo:** 10–20 días  
**Prioridad post-grado:** media-baja

## Objetivo

Incorporar **tiempos de viaje dinámicos** desde un servicio de routing externo (OSRM, Valhalla, GraphHopper o API comercial) en lugar de depender solo del grafo OSMnx estático con multiplicadores por escenario.

## Por qué esperar

| Razón | Detalle |
|-------|---------|
| Infraestructura externa | Servidor OSRM propio o API con cuota/costo |
| Latencia | Matriz N×N vía API es lenta; requiere caché agresivo |
| Alcance tesis | Escenarios `peak_traffic` / `rain` ya modelan degradación sin live data |
| Defensa | Jurado evalúa metodología CVRP+ACO, no integración traffic API |

## Estado actual

| Componente | Comportamiento |
|------------|----------------|
| Grafo | OSMnx descargado/caché local |
| Escenarios | `trafficMultiplier` en `scenarios.json` |
| Lluvia | `rainIntensity` → factor sobre tiempos |
| Matriz | `distance_matrix_cache.py` — persistida en disco |

## Diseño propuesto

### Fase A — OSRM matriz bajo demanda

1. Servicio OSRM en compose opcional (`compose.traffic.yml`)
2. Adapter `traffic_routing_service.py`:
   - `get_travel_time_matrix(coords) → matrix`
   - Fallback a OSMnx si OSRM no disponible
3. TTL de caché por `(origen, destino, hour_bucket)`

### Fase B — Perfil horario

- Bucket horario (mañana/tarde/noche) para no llamar API en cada optimización
- Invalidación al cambiar día operativo

### Excluido inicialmente

- Google Maps / Waze (licencias)
- Re-optimización continua en ruta (requiere SSE + jobs)

## Criterios de aceptación

- [ ] Flag `TRAFFIC_PROVIDER=osrm|static` en `.env`
- [ ] Optimización funciona con `static` sin OSRM (comportamiento actual)
- [ ] Benchmark documenta delta distancia/tiempo vs estático en 1 día pico
- [ ] Runbook de despliegue OSRM en `docs/post-grado/runbook-osrm.md`

## Costos / operación

| Opción | Pros | Contras |
|--------|------|---------|
| OSRM self-hosted | Sin cuota por request | RAM, actualización de OSM |
| API comercial | Rápido de integrar | Costo, dependencia vendor |
| Híbrido | OSMnx + patch OSRM en aristas críticas | Complejidad |

## Referencias

- `backend/app/services/graph_service.py`
- `docs/fase-0/alineacion-defensa.md` — exclusión tráfico en vivo
- `docs/fase-3/limites-solver.md`
