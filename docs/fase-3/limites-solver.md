# Límites del solver ACO — FEROMAP

**Fase:** 3 — Rigor algorítmico  
**Fecha:** 2026-08-27

## Qué resuelve el motor

FEROMAP implementa un **CVRP** (Capacitated Vehicle Routing Problem) sobre la red vial real de Unare:

| Capacidad | Detalle |
|-----------|---------|
| **Grafo vial** | OSMnx + NetworkX; distancias y tiempos por calles |
| **Multi-vehículo** | Flota asignable (`available`/`in_route` + conductor); cada vehículo optimiza solo puntos de los sectores de su conductor (`sector.driver_id`); `fleet_limit` es tope opcional |
| **Capacidad** | Carga acumulada por vehículo; demanda según llenado del contenedor |
| **Vertedero multi-viaje** | Descarga obligatoria cuando se supera capacidad |
| **Jornada laboral** | Ventana operativa 06:00–18:00 (12 h) |
| **Escenarios** | Normal, tráfico pico, lluvia, saturación, avería (multiplicadores) |
| **Metaheurística** | ACO + refinamiento 2-opt por ruta |
| **Objetivo del solver** | Minimizar **distancia total** recorrida |
| **Comparación** | Baseline operativo (orden fijo por código de contenedor) |

## Qué NO resuelve (alcance explícito)

| Limitación | Implicación para la tesis |
|------------|-------------------------|
| **Optimalidad global** | ACO es heurístico; entrega soluciones de alta calidad, no garantía óptima |
| **VRPTW** | Sin ventanas horarias por contenedor o sector |
| **Multi-objetivo** | No optimiza simultáneamente CO₂, tiempo y distancia en el fitness |
| **OR-Tools / solver exacto** | No hay comparación con branch-and-cut o CP-SAT |
| **Tráfico en vivo** | Solo multiplicadores estáticos por escenario |
| **Cobertura forzada** | Puede dejar puntos no cubiertos si flota o jornada no alcanzan |
| **GA / SA** | Eliminados del UI operativo; solo ACO en producción |

## Narrativa recomendada ante el jurado

> «El sistema resuelve un CVRP operativo con restricciones reales de la recolección en Unare. La calidad se demuestra con benchmark reproducible, curva de convergencia ACO, comparación baseline vs solución heurística, y análisis de sensibilidad de parámetros — no con la promesa de optimalidad global.»

## Referencias técnicas

- Motor: `backend/app/services/optimization_service.py`
- ACO paralelo: `backend/app/services/aco_parallel.py`
- Benchmark: `just benchmark-aco` → `data/cache/benchmarks/aco_latest.json`
- Sensibilidad: `just phase3-sensitivity` → `data/cache/phase3/aco_sensitivity.json`
- Evidencia consolidada: [evidencia-aco.md](./evidencia-aco.md)
- Alcance congelado: [alineacion-defensa.md](../fase-0/alineacion-defensa.md)
- Backlog post-grado: [post-grado/README.md](../post-grado/README.md)
